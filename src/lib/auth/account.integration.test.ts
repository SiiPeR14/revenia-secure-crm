import {before,beforeEach,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {database,closeDatabase} from '../db/pool.ts';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeRedis} from '../redis/client.ts';
import {resetLoginAttempts} from '../redis/login-rate-limit.ts';
import {hashPassword,verifyPassword} from '../security/password.ts';
import {accountOverview,changeAccountPassword,revokeOtherSessions,teamMembers,tokenDigest,updateTeamMember,switchWorkspace} from './account-service.ts';
import {acceptInvitation,createInvitation,listInvitations,revokeInvitation} from './invitation-service.ts';

const tenant=randomUUID(),other=randomUUID(),owner=randomUUID(),member=randomUUID(),outsider=randomUUID();
const original='Account-test-original-password-2026';let encoded:string;
let current:string,second:string,cross:string,memberToken:string,outsiderToken:string,memberOther:string;
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const newUsers:string[]=[];
async function session(user:string,company:string,role:string){const token=randomBytes(32).toString('base64url');await database.query("SELECT revenia_create_session($1,$2,$3,$4,1,now()+interval '1 hour')",[tokenDigest(token),user,company,role]);return token;}
async function valid(token:string){return (await database.query('SELECT * FROM revenia_session_lookup($1)',[tokenDigest(token)])).rowCount===1;}
before(async()=>{
  await admin.connect();encoded=await hashPassword(original);
  for(const id of [tenant,other])await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,\'Account test\')',[id,`account-${id}`]);
  for(const id of [owner,member,outsider])await admin.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,\'Test user\',$3)',[id,`${id}@example.test`,encoded]);
});
beforeEach(async()=>{
  await admin.query('DELETE FROM team_invitations WHERE tenant_id=ANY($1)',[[tenant,other]]);
  await admin.query('DELETE FROM memberships WHERE tenant_id=ANY($1)',[[tenant,other]]);
  await admin.query('DELETE FROM sessions WHERE user_id=ANY($1)',[[owner,member,outsider]]);
  await admin.query('DELETE FROM audit_logs WHERE tenant_id=ANY($1)',[[tenant,other]]);
  await admin.query('UPDATE users SET password_hash=$1,session_version=1,disabled_at=NULL WHERE id=ANY($2)',[encoded,[owner,member,outsider]]);
  for(const [company,user,role] of [[tenant,owner,'OWNER'],[other,owner,'OWNER'],[tenant,member,'SALES'],[other,member,'SALES'],[other,outsider,'OWNER']])await admin.query('INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=EXCLUDED.role',[company,user,role]);
  for(const user of [owner,member])await resetLoginAttempts(`account:${user}`);
  current=await session(owner,tenant,'OWNER');second=await session(owner,tenant,'OWNER');cross=await session(owner,other,'OWNER');memberToken=await session(member,tenant,'SALES');memberOther=await session(member,other,'SALES');outsiderToken=await session(outsider,other,'OWNER');
});
after(async()=>{
  await admin.query('DELETE FROM team_invitations WHERE tenant_id=ANY($1)',[[tenant,other]]);
  for(const table of ['audit_logs','memberships'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1)`,[[tenant,other]]);
  await admin.query('DELETE FROM users WHERE id=ANY($1)',[[owner,member,outsider,...newUsers]]);
  await admin.query('DELETE FROM tenants WHERE id=ANY($1)',[[tenant,other]]);
  for(const user of [owner,member])await resetLoginAttempts(`account:${user}`);
  await admin.end();await Promise.all([closeDatabase(),closeRedis()]);
});
it('lists only the signed-in user sessions and never exposes password hashes',async()=>{
  const overview=await accountOverview(current);assert.equal(overview.profile?.user_id,owner);assert.equal(overview.sessions.length,3);assert.equal(overview.sessions.filter(s=>s.is_current).length,1);assert.ok(!JSON.stringify(overview).includes('scrypt$'));
  assert.equal((await accountOverview(randomBytes(32).toString('base64url'))).profile,undefined);
});
it('requires the current password and leaves sessions untouched after a failed check',async()=>{
  await assert.rejects(()=>changeAccountPassword(current,'Incorrect-password-2026','New-long-password-2026'),/actual no es correcta/);
  assert.equal(await valid(current),true);assert.equal(await valid(second),true);
});
it('revokes other sessions across companies while preserving this session and other users',async()=>{
  assert.equal(await revokeOtherSessions(current,original),2);assert.equal(await valid(current),true);assert.equal(await valid(second),false);assert.equal(await valid(cross),false);assert.equal(await valid(memberToken),true);assert.equal(await valid(outsiderToken),true);
});
it('changes the password atomically and invalidates every old session',async()=>{
  await changeAccountPassword(current,original,'New-long-password-2026');
  for(const token of [current,second,cross])assert.equal(await valid(token),false);
  const row=(await admin.query('SELECT password_hash,session_version FROM users WHERE id=$1',[owner])).rows[0];assert.equal(row.session_version,2);assert.equal(await verifyPassword(original,row.password_hash),false);assert.equal(await verifyPassword('New-long-password-2026',row.password_hash),true);
  const audit=await withTenant(tenant,db=>db.query("SELECT metadata FROM audit_logs WHERE action='account.password_changed'"));assert.equal(audit.rowCount,1);assert.ok(!JSON.stringify(audit.rows).includes('password-2026'));
});
it('accepts only one concurrent password update against the same original state',async()=>{
  const next=await hashPassword('Concurrent-next-password-2026');
  const results=await Promise.all([current,second].map(token=>database.query('SELECT revenia_account_password($1,$2,$3) ok',[tokenDigest(token),encoded,next])));
  assert.equal(results.filter(result=>result.rows[0].ok).length,1);
});
it('rejects stale sessions immediately after a direct role change or membership removal',async()=>{
  await admin.query("UPDATE memberships SET role='VIEWER' WHERE tenant_id=$1 AND user_id=$2",[tenant,member]);assert.equal(await valid(memberToken),false);
  await admin.query('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=$2',[other,member]);assert.equal(await valid(memberOther),false);
});
it('changes a team role and revokes only that company sessions',async()=>{
  await updateTeamMember(current,original,member,'VIEWER');assert.equal(await valid(memberToken),false);assert.equal(await valid(memberOther),true);assert.equal((await teamMembers(current)).find(m=>m.user_id===member)?.role,'VIEWER');
});
it('protects owners and rejects cross-company or non-owner changes',async()=>{
  for(const target of [owner,outsider])await assert.rejects(()=>updateTeamMember(current,original,target,null),/No puedes/);
  await assert.rejects(()=>updateTeamMember(memberToken,original,owner,'VIEWER'),/No puedes/);
  assert.equal((await teamMembers(memberToken)).length,0);assert.equal((await teamMembers(current)).length,2);
});
it('removes only membership, preserves the account and rejects its revoked session',async()=>{
  await updateTeamMember(current,original,member,null);assert.equal(await valid(memberToken),false);assert.equal(await valid(memberOther),true);assert.equal((await admin.query('SELECT id FROM users WHERE id=$1',[member])).rowCount,1);
});
it('rate limits repeated incorrect reauthentication',async()=>{
  for(let i=0;i<5;i++)await assert.rejects(()=>revokeOtherSessions(current,'Wrong-password-for-test'),/actual no es correcta/);
  await assert.rejects(()=>revokeOtherSessions(current,original),/Demasiados intentos/);
});
it('switches only to an existing membership, rotates the token and keeps its expiration',async()=>{
  const oldExpiry=(await database.query('SELECT expires_at FROM revenia_session_lookup($1)',[tokenDigest(current)])).rows[0].expires_at;
  const next=await switchWorkspace(current,other);assert.notEqual(next.token,current);assert.equal(await valid(current),false);assert.equal(await valid(next.token),true);assert.equal(next.expiresAt.getTime(),oldExpiry.getTime());
  assert.equal((await accountOverview(next.token)).workspaces.find(w=>w.is_current)?.tenant_id,other);
  await assert.rejects(()=>switchWorkspace(second,randomUUID()),/No tienes acceso/);assert.equal(await valid(second),true);
});
it('permits only one concurrent switch using the same token',async()=>{
  const results=await Promise.allSettled([switchWorkspace(current,tenant),switchWorkspace(current,other)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});

async function invitation(email=`invite-${randomUUID()}@example.test`,role='VIEWER'){
  const url=await createInvitation(current,original,email,role);const token=new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
  return {email,token,id:(await listInvitations(current)).find(i=>i.email===email)!.id};
}
async function remember(email:string){const id=(await admin.query('SELECT id FROM users WHERE email=$1',[email])).rows[0]?.id;if(id&&!newUsers.includes(id))newUsers.push(id);return id;}
it('stores only an invitation digest and restricts access to its secret column',async()=>{
  const invite=await invitation();const row=(await admin.query('SELECT token_hash FROM team_invitations WHERE id=$1',[invite.id])).rows[0];assert.equal(row.token_hash,tokenDigest(invite.token));assert.notEqual(row.token_hash,invite.token);
  assert.ok(!JSON.stringify(await listInvitations(current)).includes(invite.token));await assert.rejects(()=>database.query('SELECT token_hash FROM team_invitations'),/permission denied/);
});
it('creates a new account and one membership, then rejects invitation replay',async()=>{
  const invite=await invitation(undefined,'SALES');const password='New-invited-account-password';
  await acceptInvitation(invite.token,'Invited user',password);const id=await remember(invite.email);assert.ok(id);
  assert.equal((await admin.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,id])).rows[0].role,'SALES');
  assert.equal(await verifyPassword(password,(await admin.query('SELECT password_hash FROM users WHERE id=$1',[id])).rows[0].password_hash),true);
  await assert.rejects(()=>acceptInvitation(invite.token,'Another name',password),/no está disponible/);
});
it('does not reset an existing account password through an invitation',async()=>{
  const invite=await invitation(`${outsider}@example.test`,'ADMIN');
  await assert.rejects(()=>acceptInvitation(invite.token,'Changed name','Attacker-chosen-password'),/contraseña actual/);
  await acceptInvitation(invite.token,'Changed name',original);
  const user=(await admin.query('SELECT password_hash,display_name FROM users WHERE id=$1',[outsider])).rows[0];assert.equal(user.password_hash,encoded);assert.equal(user.display_name,'Test user');
  assert.equal((await admin.query('SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenant,outsider])).rows[0].role,'ADMIN');assert.equal(await valid(outsiderToken),true);
});
it('rejects revoked, expired and replaced invitation links',async()=>{
  const first=await invitation();await revokeInvitation(current,original,first.id);await assert.rejects(()=>acceptInvitation(first.token,'Test user',original),/no está disponible/);
  const expired=await invitation();await admin.query("UPDATE team_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await assert.rejects(()=>acceptInvitation(expired.token,'Test user',original),/no está disponible/);
  const replaced=await invitation();await invitation(replaced.email);await assert.rejects(()=>acceptInvitation(replaced.token,'Test user',original),/no está disponible/);
});
it('invalidates invitations when the inviter loses ownership',async()=>{
  const invite=await invitation();await admin.query("UPDATE memberships SET role='VIEWER' WHERE tenant_id=$1 AND user_id=$2",[tenant,owner]);
  await assert.rejects(()=>acceptInvitation(invite.token,'Test user',original),/no está disponible/);
});
it('rejects invitation creation by a non-owner or for an existing member',async()=>{
  await assert.rejects(()=>createInvitation(memberToken,original,'new@example.test','VIEWER'),/No se puede/);
  await assert.rejects(()=>createInvitation(current,original,`${member}@example.test`,'ADMIN'),/No se puede/);
});
it('accepts an invitation once under concurrent submissions',async()=>{
  const invite=await invitation();const results=await Promise.allSettled([acceptInvitation(invite.token,'Test one',original),acceptInvitation(invite.token,'Test two',original)]);
  await remember(invite.email);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await admin.query('SELECT id FROM users WHERE email=$1',[invite.email])).rowCount,1);
});
it('does not revive an old session when an administrator restores the original role',async()=>{
  await admin.query("UPDATE memberships SET role='VIEWER' WHERE tenant_id=$1 AND user_id=$2",[tenant,member]);
  await admin.query("UPDATE memberships SET role='SALES' WHERE tenant_id=$1 AND user_id=$2",[tenant,member]);
  assert.equal(await valid(memberToken),false);assert.equal(await valid(memberOther),true);
});
it('does not revive sessions when a disabled identity is enabled again',async()=>{
  await admin.query('UPDATE users SET disabled_at=now() WHERE id=$1',[member]);await admin.query('UPDATE users SET disabled_at=NULL WHERE id=$1',[member]);
  assert.equal(await valid(memberToken),false);assert.equal(await valid(memberOther),false);
});
