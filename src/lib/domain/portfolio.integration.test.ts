import {before,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {database,closeDatabase} from '../db/pool.ts';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeRedis} from '../redis/client.ts';
import {hashPassword,verifyPassword} from '../security/password.ts';
import {createStoredSession,readStoredSession} from '../db/session-store.ts';
import {addClient,getClient,listClients,editClient,archiveClient,addTask,editTask} from './crm-service.ts';
import {requestRecovery,resetPassword,deliverRecovery} from '../auth/recovery-service.ts';
import {recoveryHttp} from '../auth/recovery-http.ts';
import {securityOverview,persistResults,updateFinding} from '../security-center/service.ts';
import {localTarget,headerChecks,type CheckResult} from '../security-center/checks.ts';
import {readJson,api} from '../api/http.ts';
import {openapi} from '../api/openapi.ts';
import {verifyStoredAudit} from '../db/audit-verification.ts';
import type {SessionClaims} from '../security/session.ts';

const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const tenant=randomUUID(),other=randomUUID(),user=randomUUID(),foreignUser=randomUUID();
const claims=(tenantId=tenant,userId=user):SessionClaims=>({tenantId,userId,role:'OWNER',sessionVersion:1,issuedAt:0,expiresAt:Math.floor(Date.now()/1000)+3600});
const owner=claims(),foreign=claims(other,foreignUser),viewer={...owner,role:'VIEWER' as const};
const customer={name:'Prueba de contrato',company:'Portfolio',email:'portfolio@example.test',value:'125.50'};
let token:string;
before(async()=>{
 await admin.connect();
 for(const id of [tenant,other])await admin.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Portfolio test')",[id,'portfolio-'+id]);
 const encoded=await hashPassword('Portfolio-original-password-2026');
 for(const [uid,tid] of [[user,tenant],[foreignUser,other]]){await admin.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,'Portfolio test',$3)",[uid,uid+'@example.test',encoded]);await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tid,uid]);}
 token=(await createStoredSession(owner)).token;
});
after(async()=>{
 for(const table of ['security_findings','security_runs','tasks','clients','audit_logs','memberships'])await admin.query('DELETE FROM '+table+' WHERE tenant_id=ANY($1)',[[tenant,other]]);
 await admin.query('DELETE FROM users WHERE id=ANY($1)',[[user,foreignUser]]);
 await admin.query("DELETE FROM password_recovery WHERE user_id IS NULL AND token_hash=ANY($1)",[unknownHashes]);
 await admin.query('DELETE FROM tenants WHERE id=ANY($1)',[[tenant,other]]);
 await admin.end();await closeDatabase();await closeRedis();
});
const unknownHashes:string[]=[];
it('validates the contract, decimal amounts and rejects caller-selected tenants',async()=>{
 await assert.rejects(()=>addClient(owner,{...customer,tenantId:other}));
 await assert.rejects(()=>addClient(owner,{...customer,value:10.1}));
 await assert.rejects(()=>listClients(owner,{limit:10001}));
 assert.equal(openapi.openapi,'3.1.0');assert.ok(openapi.paths['/api/v1/clients/{id}'].patch.requestBody);
});
it('keeps RLS, permissions and references across companies',async()=>{
 const c=await addClient(foreign,customer);
 await assert.rejects(()=>getClient(owner,c.id),{status:404});
 await assert.rejects(()=>editClient(owner,c.id,{version:1,name:'Forbidden'}),{status:404});
 await assert.rejects(()=>addTask(owner,{title:'Cross tenant',clientId:c.id,dueAt:new Date().toISOString()}),{status:404});
 await assert.rejects(()=>addClient(viewer,customer),/Permiso/);
 assert.equal((await listClients(owner,{})).data.some(x=>x.id===c.id),false);
});
it('allows only one concurrent edit and preserves audit integrity',async()=>{
 const c=await addClient(owner,customer);
 const edits=await Promise.allSettled(['First','Second'].map(name=>editClient(owner,c.id,{version:c.version,name})));
 assert.equal(edits.filter(e=>e.status==='fulfilled').length,1);
 const failure=edits.find(e=>e.status==='rejected');assert.equal(failure?.status==='rejected'&&failure.reason.status,409);
 const updated=await getClient(owner,c.id);assert.equal(updated.version,2);assert.equal(updated.value,'125.50');
 assert.equal((await verifyStoredAudit(tenant)).status,'verified');
});
it('soft archives clients without deleting their tasks and supports task reopening',async()=>{
 const c=await addClient(owner,{...customer,email:'archive@example.test'});const task=await addTask(owner,{title:'Retained task',clientId:c.id,dueAt:new Date().toISOString()});
 await archiveClient(owner,c.id,c.version);await assert.rejects(()=>getClient(owner,c.id),{status:404});
 const finished=await editTask(owner,task.id,{version:task.version,status:'Completada'});
 const reopened=await editTask(owner,task.id,{version:finished.version,status:'Pendiente'});assert.equal(reopened.clientId,c.id);
 const row=await withTenant(tenant,db=>db.query('SELECT completed_at FROM tasks WHERE id=$1',[task.id]));assert.equal(row.rows[0]!.completed_at,null);
});
it('rejects unauthenticated API calls, forged origins and oversized bodies',async()=>{
 const run=(request:Request)=>api(request,'test.route','crm:read',async()=>({ok:true}));
 assert.equal((await run(new Request('http://localhost:3000/api/v1/clients'))).status,401);
 const response=await run(new Request('http://localhost:3000/api/v1/clients',{method:'POST',headers:{cookie:'revenia_session='+token,origin:'https://evil.example'}}));assert.equal(response.status,403);assert.ok(response.headers.get('X-Request-Id'));
 await assert.rejects(()=>readJson(new Request('http://localhost/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(17000)})})),{status:413});
 await assert.rejects(()=>readJson(new Request('http://localhost/',{method:'POST',body:'{}'})),{status:415});
});
it('scanner rejects arbitrary destinations and reports absent protections honestly',()=>{
 for(const url of ['https://example.com','http://127.0.0.1.evil.test','http://localhost/path','http://user@localhost','http://169.254.169.254','file:///etc/passwd'])assert.throws(()=>localTarget(url));
 assert.equal(localTarget('http://127.0.0.1:3000').hostname,'127.0.0.1');
 assert.equal(headerChecks({},true).filter(c=>c.status==='fail').length,4);
});
it('deduplicates findings; only a passing recheck resolves them',async()=>{
 const result:CheckResult={id:'TEST-RULE',title:'Test rule',status:'fail',severity:'medium',evidence:'Synthetic failure',remediation:'Synthetic remediation'};
 async function record(status:CheckResult['status']){const id=randomUUID();await withTenant(tenant,db=>db.query("INSERT INTO security_runs(id,tenant_id,actor_id,rules_version,status,scope) VALUES($1,$2,$3,'test','running','test')",[id,tenant,user]));await persistResults(owner,id,[{...result,status}]);}
 await record('fail');await record('fail');let overview=await securityOverview(owner);assert.equal(overview.findings.length,1);
 const id=overview.findings[0]!.id;await assert.rejects(()=>updateFinding(owner,{id,status:'resolved',reason:'Cannot self-certify'}));
 await assert.rejects(()=>updateFinding(foreign,{id,status:'in_progress',reason:'Foreign tenant attack'}),{status:404});
 await updateFinding(owner,{id,status:'pending_verification',reason:'Ready for another check'});
 await record('not_evaluated');assert.equal((await securityOverview(owner)).findings[0]!.status,'pending_verification');
 await record('pass');overview=await securityOverview(owner);assert.equal(overview.findings[0]!.status,'resolved');
 assert.equal((await securityOverview(foreign)).findings.length,0);
});
it('recovery does not expose tokens, closes sessions, and consumes all account tokens atomically',async()=>{
 await requestRecovery({email:user+'@example.test'});await requestRecovery({email:user+'@example.test'});
 const messages:{email:string;link:string;id:string}[]=[];
 const pending=(await admin.query('SELECT id FROM password_recovery WHERE user_id=$1',[user])).rows;
 for(const row of pending)await deliverRecovery(async message=>{messages.push(message);},row.id);
 const own=messages.filter(m=>m.email===user+'@example.test');assert.equal(own.length,2);
 const links=own.map(m=>new URL(m.link).hash.slice(1));
 const rows=(await admin.query('SELECT payload,token_hash FROM password_recovery WHERE user_id=$1',[user])).rows;assert.equal(rows.every(r=>r.payload===null),true);assert.equal(JSON.stringify(rows).includes(links[0]!),false);
 const results=await Promise.all(links.map(t=>resetPassword({token:t,password:'Portfolio-new-password-2026'})));
 assert.equal(results.filter(Boolean).length,1);assert.equal(await readStoredSession(token),null);
 assert.equal(await resetPassword({token:links[0],password:'Another-password-2026'}),false);
 const hash=(await admin.query('SELECT password_hash FROM users WHERE id=$1',[user])).rows[0].password_hash;
 assert.equal(await verifyPassword('Portfolio-new-password-2026',hash),true);
 await assert.rejects(()=>database.query('SELECT * FROM password_recovery'),/permission denied/);
});
it('recovery rejects expired tokens',async()=>{
 const secret=randomBytes(32).toString('base64url');const hash=createHash('sha256').update(secret).digest('hex');
 await database.query('SELECT revenia_recovery_issue($1,$2,$3)',[user+'@example.test',hash,'{}']);
 await admin.query("UPDATE password_recovery SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[hash]);
 assert.equal(await resetPassword({token:secret,password:'Another-password-2026'}),false);
});
it('returns the same public response for known and unknown accounts',async()=>{
 const req=(email:string)=>new Request('http://localhost:3000/api/auth/recovery',{method:'POST',headers:{origin:process.env.APP_URL??'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email})});
 const unknown=randomUUID()+'@example.test';
 const a=await recoveryHttp(req(user+'@example.test'),'request'),b=await recoveryHttp(req(unknown),'request');
 assert.equal(a.status,202);assert.equal(b.status,202);assert.deepEqual(await a.json(),await b.json());
 // Keep cleanup scoped to this synthetic request; no mailbox delivery here.
 const rows=(await admin.query("SELECT token_hash,payload FROM password_recovery WHERE user_id IS NULL AND created_at>now()-interval '10 seconds'")).rows;
 const {decryptValue}=await import('../security/encryption.ts');const {encryptionKey}=await import('../engines/connections.ts');
 for(const r of rows){if(r.payload&&JSON.parse(decryptValue(r.payload,encryptionKey(),'revenia:password-recovery:v1')).email===unknown)unknownHashes.push(r.token_hash);}
});

it('recovery delivery fails closed and uses idempotency without external calls',async()=>{
 const {sendRecovery,recoveryAvailable}=await import('../auth/recovery-delivery.ts');
 const message={email:'test@example.test',link:'http://localhost:3000/restablecer-acceso#test',id:randomUUID()};
 const disabled={NODE_ENV:'production',RECOVERY_MAIL_PROVIDER:'resend',EXTERNAL_OPERATIONS_ENABLED:'false'};
 assert.equal(recoveryAvailable(disabled),false);let calls=0;
 const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(new Headers(init?.headers).get('Idempotency-Key'),'recovery/'+message.id);assert.equal(init?.redirect,'error');return new Response('{}',{status:200});};
 await assert.rejects(()=>sendRecovery(message,transport,disabled));assert.equal(calls,0);
 await sendRecovery(message,transport,{...disabled,EXTERNAL_OPERATIONS_ENABLED:'true',RECOVERY_RESEND_API_KEY:'re_fake_for_unit_tests_only',RECOVERY_FROM:'security@example.test'});assert.equal(calls,1);
});
