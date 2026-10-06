import {before,beforeEach,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {withTenant} from './tenant-transaction.ts';
import {recordAudit} from './audit-repository.ts';
import {verifyStoredAudit} from './audit-verification.ts';
import {canonicalJson} from '../security/canonical-json.ts';
import {closeDatabase} from './pool.ts';

const tenant=randomUUID(),actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
before(async()=>{await admin.connect();await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,\'Audit test\')',[tenant,`audit-${tenant}`]);});
beforeEach(async()=>{await admin.query('DELETE FROM audit_logs WHERE tenant_id=$1',[tenant]);});
after(async()=>{await admin.query('DELETE FROM audit_logs WHERE tenant_id=$1',[tenant]);await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);await admin.end();await closeDatabase();});
const append=(metadata:Record<string,unknown>={})=>withTenant(tenant,db=>recordAudit(db,{tenantId:tenant,userId:actor},'test.audit_event','test',randomUUID(),metadata));

it('canonicalizes nested metadata independently of JSON property order',()=>{
  assert.equal(canonicalJson({z:1,a:{zz:2,a:3},list:[{b:1,a:2}]}),canonicalJson({list:[{a:2,b:1}],a:{a:3,zz:2},z:1}));
});
it('verifies stored JSONB metadata without depending on its database key order',async()=>{
  await append({channel:'Email',allowed:true,nested:{longKey:1,a:2},values:[{z:2,a:1}]});
  const result=await verifyStoredAudit(tenant);assert.equal(result.status,'verified');assert.equal(result.verified,1);
});
it('keeps an ordered chain during concurrent writes',async()=>{
  await Promise.all(Array.from({length:25},(_,i)=>append({index:i,context:{b:'two',a:'one'}})));
  const result=await verifyStoredAudit(tenant);assert.equal(result.status,'verified');assert.equal(result.checked,25);
});
it('detects changed persisted metadata',async()=>{
  await append({amount:100});await admin.query('UPDATE audit_logs SET metadata=\'{"amount":200}\'::jsonb WHERE tenant_id=$1',[tenant]);
  assert.equal((await verifyStoredAudit(tenant)).status,'broken');
});
it('detects a removed middle record',async()=>{
  await append();await append();await append();await admin.query('DELETE FROM audit_logs WHERE id=(SELECT id FROM audit_logs WHERE tenant_id=$1 ORDER BY id OFFSET 1 LIMIT 1)',[tenant]);
  assert.equal((await verifyStoredAudit(tenant)).status,'broken');
});
it('labels historical entries as legacy instead of claiming full content verification',async()=>{
  const at=new Date().toISOString(),hash=createHash('sha256').update('synthetic legacy entry').digest('hex');
  await admin.query('INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,previous_hash,hash,created_at,hash_version) VALUES($1,$2,\'legacy.event\',\'test\',\'legacy\',$3,$4,$5,1)',[tenant,actor,'0'.repeat(64),hash,at]);
  await append();const result=await verifyStoredAudit(tenant);assert.equal(result.status,'legacy');assert.equal(result.legacy,1);assert.equal(result.verified,1);
});
it('reports a bounded partial check and cannot see another company records',async()=>{
  await append();await append();assert.equal((await verifyStoredAudit(tenant,1)).status,'partial');assert.equal((await verifyStoredAudit(randomUUID())).checked,0);
});
it('makes verification snapshots read-only',async()=>{
  await assert.rejects(()=>withTenant(tenant,db=>db.query("INSERT INTO audit_logs(tenant_id,action,resource_type,resource_id,previous_hash,hash) VALUES($1,'test.fail','test','test',$2,$3)",[tenant,'0'.repeat(64),'1'.repeat(64)]),true),/read-only/i);
});
it('orders numeric record identifiers correctly across a digit boundary',async()=>{
  let previous='0'.repeat(64);const at=new Date().toISOString();
  for(const id of ['99999999999999999','100000000000000000']){
    const hash=createHash('sha256').update(canonicalJson({version:2,tenantId:tenant,userId:actor,action:'test.boundary',resourceType:'test',resourceId:id,metadata:{},createdAt:at,previousHash:previous})).digest('hex');
    await admin.query('INSERT INTO audit_logs(id,tenant_id,actor_id,action,resource_type,resource_id,previous_hash,hash,metadata,created_at,hash_version) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,\'test.boundary\',\'test\',$7,$4,$5,\'{}\',$6,2)',[id,tenant,actor,previous,hash,at,id]);previous=hash;
  }
  const result=await verifyStoredAudit(tenant);assert.equal(result.status,'verified');assert.equal(result.checked,2);
});

