import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import {hashPassword} from '../lib/security/password.ts';

if(process.env.NODE_ENV==='production')throw new Error('Test fixture forbidden in production');
const file='../../work/account-ui.json';
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});await admin.connect();
try{
  if(process.argv.includes('--setup')){
    try{await fs.access(file);throw new Error('Fixture already exists; clean it first');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const tenant=randomUUID(),owner=randomUUID(),email=`ui-${owner}@example.test`,slug=`ui-account-${tenant}`;
    await admin.query('BEGIN');
    await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,\'Prueba de cuentas\')',[tenant,slug]);
    await admin.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,\'Propietario de prueba\',$3)',[owner,email,await hashPassword('AccountBrowserTest-2026!')]);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tenant,owner]);
    await admin.query('COMMIT');await fs.writeFile(file,JSON.stringify({tenant,owner,email,slug}));console.log(JSON.stringify({email,tenant}));
  }else if(process.argv.includes('--cleanup')){
    const fixture=JSON.parse(await fs.readFile(file,'utf8')) as {tenant:string;owner:string;slug:string};
    const tenant=(await admin.query('SELECT slug FROM tenants WHERE id=$1',[fixture.tenant])).rows[0];
    if(!tenant||tenant.slug!==fixture.slug||!fixture.slug.startsWith('ui-account-'))throw new Error('Fixture identity mismatch');
    const users=(await admin.query('SELECT user_id FROM memberships WHERE tenant_id=$1',[fixture.tenant])).rows.map(row=>row.user_id as string);
    if(!users.includes(fixture.owner)||users.length>3)throw new Error('Unexpected fixture membership');
    await admin.query('BEGIN');
    await admin.query('DELETE FROM audit_logs WHERE tenant_id=$1',[fixture.tenant]);
    await admin.query('DELETE FROM team_invitations WHERE tenant_id=$1',[fixture.tenant]);
    await admin.query('DELETE FROM memberships WHERE tenant_id=$1',[fixture.tenant]);
    for(const user of users)await admin.query('DELETE FROM users WHERE id=$1 AND email LIKE \'%@example.test\' AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=$1)',[user]);
    await admin.query('DELETE FROM tenants WHERE id=$1',[fixture.tenant]);
    await admin.query('COMMIT');await fs.unlink(file);console.log('Isolated UI fixture removed.');
  }else throw new Error('Use --setup or --cleanup');
}catch(error){await admin.query('ROLLBACK');throw error;}finally{await admin.end();}
