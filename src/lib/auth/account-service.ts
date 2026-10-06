import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {withTenant} from '../db/tenant-transaction.ts';
import {database} from '../db/pool.ts';
import {hashPassword,verifyPassword} from '../security/password.ts';
import {recordAudit} from '../db/audit-repository.ts';
import {consumeLoginAttempt,resetLoginAttempts} from '../redis/login-rate-limit.ts';

export class AccountError extends Error {}
export const passwordInput=z.string().min(12).max(200);
export function tokenDigest(token:string){return createHash('sha256').update(z.string().min(40).max(100).parse(token)).digest('hex');}
type Principal={user_id:string;tenant_id:string;role:string};
export async function authenticateAccount(token:string,currentPassword:string){
  const digest=tokenDigest(token);
  const principal=(await database.query<Principal>('SELECT user_id,tenant_id,role FROM revenia_session_lookup($1)',[digest])).rows[0];
  if(!principal)throw new AccountError('La sesión ha caducado. Vuelve a entrar.');
  const key=`account:${principal.user_id}`;
  if(!(await consumeLoginAttempt(key)).allowed)throw new AccountError('Demasiados intentos. Espera 15 minutos.');
  const row=(await database.query<{password_hash:string}>('SELECT password_hash FROM revenia_account_profile($1)',[digest])).rows[0];
  if(!row||!await verifyPassword(passwordInput.parse(currentPassword),row.password_hash))throw new AccountError('La contraseña actual no es correcta.');
  await resetLoginAttempts(key);
  return {digest,principal,expected:row.password_hash};
}
export async function accountOverview(token:string){
  const digest=tokenDigest(token);
  const profile=(await database.query<{user_id:string;email:string;display_name:string;tenant_name:string}>('SELECT user_id,email,display_name,tenant_name FROM revenia_account_profile($1)',[digest])).rows[0];
  const sessions=(await database.query<{id:string;tenant_name:string;role:string;created_at:Date;expires_at:Date;is_current:boolean}>('SELECT * FROM revenia_account_sessions($1)',[digest])).rows;
  const workspaces=(await database.query<{tenant_id:string;tenant_name:string;role:string;is_current:boolean}>('SELECT * FROM revenia_account_workspaces($1)',[digest])).rows;
  return {profile,sessions,workspaces};
}
export async function accountIdentity(token:string){
  return (await database.query<{display_name:string;tenant_name:string}>('SELECT display_name,tenant_name FROM revenia_account_profile($1)',[tokenDigest(token)])).rows[0];
}
export async function switchWorkspace(token:string,target:string){
  z.uuid().parse(target);const digest=tokenDigest(token);const nextToken=randomBytes(32).toString('base64url');
  const principal=(await database.query<Principal>('SELECT user_id,tenant_id,role FROM revenia_session_lookup($1)',[digest])).rows[0];
  if(!principal)throw new AccountError('La sesión ha caducado.');
  const expiresAt=await withTenant(target,async db=>{
    const row=(await db.query<{expires_at:Date|null}>('SELECT revenia_switch_workspace($1,$2,$3) expires_at',[digest,target,tokenDigest(nextToken)])).rows[0];
    if(!row?.expires_at)throw new AccountError('No tienes acceso a esa empresa o la sesión ha cambiado.');
    await recordAudit(db,{tenantId:target,userId:principal.user_id},'account.workspace_switched','user',principal.user_id);
    return row.expires_at;
  });
  return {token:nextToken,expiresAt};
}
export async function changeAccountPassword(token:string,currentPassword:string,newPassword:string){
  passwordInput.parse(newPassword);
  if(currentPassword.normalize('NFKC')===newPassword.normalize('NFKC'))throw new AccountError('Elige una contraseña diferente de la actual.');
  const {digest,principal,expected}=await authenticateAccount(token,currentPassword);
  const encoded=await hashPassword(newPassword);
  await withTenant(principal.tenant_id,async db=>{
    const result=await db.query<{ok:boolean}>('SELECT revenia_account_password($1,$2,$3) ok',[digest,expected,encoded]);
    if(!result.rows[0]?.ok)throw new AccountError('La cuenta ha cambiado. Vuelve a entrar e inténtalo de nuevo.');
    await recordAudit(db,{tenantId:principal.tenant_id,userId:principal.user_id},'account.password_changed','user',principal.user_id);
  });
}
export async function revokeOtherSessions(token:string,currentPassword:string){
  const {digest,principal,expected}=await authenticateAccount(token,currentPassword);
  return withTenant(principal.tenant_id,async db=>{
    const result=await db.query<{total:number}>('SELECT revenia_account_revoke_others($1,$2) total',[digest,expected]);
    if((result.rows[0]?.total??-1)<0)throw new AccountError('La cuenta ha cambiado. Vuelve a entrar.');
    await recordAudit(db,{tenantId:principal.tenant_id,userId:principal.user_id},'account.sessions_revoked','user',principal.user_id);
    return result.rows[0]!.total;
  });
}
export async function teamMembers(token:string){
  return (await database.query<{user_id:string;email:string;display_name:string;role:string;created_at:Date}>('SELECT * FROM revenia_team_members($1)',[tokenDigest(token)])).rows;
}
export async function updateTeamMember(token:string,currentPassword:string,target:string,role:string|null){
  z.uuid().parse(target);if(role!==null)z.enum(['ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER']).parse(role);
  const {digest,principal,expected}=await authenticateAccount(token,currentPassword);
  await withTenant(principal.tenant_id,async db=>{
    const result=await db.query<{ok:boolean}>('SELECT revenia_team_update($1,$2,$3,$4) ok',[digest,expected,target,role]);
    if(!result.rows[0]?.ok)throw new AccountError('No puedes modificar este miembro o su acceso ha cambiado.');
    await recordAudit(db,{tenantId:principal.tenant_id,userId:principal.user_id},role?'team.role_changed':'team.member_removed','user',target,{role});
  });
}
