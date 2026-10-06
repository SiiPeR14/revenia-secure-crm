import {before,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeDatabase} from '../db/pool.ts';
import {billingRequired,billingOverview,reserveJobUsage} from './usage.ts';
import {processJob} from '../engines/queue.ts';
import type {Job} from '../engines/contracts.ts';

const tenant=randomUUID(),other=randomUUID(),actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const extraUsers=[randomUUID(),randomUUID()];
before(async()=>{
  await admin.connect();
  for(const id of [tenant,other])await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[id,`billing-test-${id}`,'Billing test']);
  await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tenant,actor]);
  await admin.query("INSERT INTO billing_accounts(tenant_id,plan_id,status,seats,access_until) VALUES($1,'starter','active',2,now()+interval '30 days')",[tenant]);
  for(const id of extraUsers)await admin.query('INSERT INTO users(id,email,display_name,password_hash) SELECT $1,$2,\'Billing test\',password_hash FROM users WHERE id=$3',[id,`${id}@example.test`,actor]);
});
after(async()=>{
  for(const table of ['audit_logs','billing_usage','billing_accounts','engine_jobs','memberships'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1)`,[[tenant,other]]);
  await admin.query('DELETE FROM users WHERE id=ANY($1)',[extraUsers]);
  await admin.query('DELETE FROM tenants WHERE id=ANY($1)',[[tenant,other]]);
  await admin.end();await closeDatabase();
});
async function job(kind='email',target=tenant){
  const id=randomUUID(),lease_token=randomUUID();
  await admin.query("INSERT INTO engine_jobs(id,tenant_id,actor_id,kind,dedupe_key,status,lease_token,lease_until) VALUES($1::uuid,$2,$3,$4,$1::uuid::text,'running',$5,now()+interval '10 minutes')",[id,target,actor,kind,lease_token]);
  return {id,lease_token};
}
it('requires billing in production even when a local override says false',()=>{
  assert.equal(billingRequired({NODE_ENV:'production',BILLING_REQUIRED:'false'}),true);
  assert.equal(billingRequired({NODE_ENV:'development'}),false);
});
it('distinguishes unconfigured local workspaces from required subscriptions',async()=>{
  const j=await job('task',other);
  assert.equal(await withTenant(other,db=>reserveJobUsage(db,j,false)),'unconfigured');
  await assert.rejects(()=>withTenant(other,db=>reserveJobUsage(db,j,true)),/SUBSCRIPTION_REQUIRED/);
});
it('does not grant the app the ability to assign plans or erase usage',async()=>{
  await assert.rejects(()=>withTenant(tenant,db=>db.query("UPDATE billing_accounts SET plan_id='enterprise'")),/permission denied/i);
  await assert.rejects(()=>withTenant(tenant,db=>db.query('DELETE FROM billing_usage')),/permission denied/i);
  await assert.rejects(()=>withTenant(tenant,db=>db.query('UPDATE billing_plans SET monthly_messages=NULL')),/permission denied/i);
});
it('isolates accounts and reservations from other companies and validates leases',async()=>{
  const j=await job();
  assert.equal((await billingOverview(other)).account,null);
  await assert.rejects(()=>withTenant(tenant,db=>reserveJobUsage(db,{...j,lease_token:randomUUID()})),/BILLING_LEASE_INVALID/);
  const rivalJob=await job('email',other);
  await assert.rejects(()=>withTenant(tenant,db=>reserveJobUsage(db,rivalJob)),/BILLING_LEASE_INVALID/);
  assert.equal((await withTenant(other,db=>db.query('SELECT * FROM billing_usage WHERE tenant_id=$1',[tenant]))).rowCount,0);
});
it('reserves once under concurrent execution and keeps the reservation on retry',async()=>{
  const j=await job();
  const results=await Promise.all(Array.from({length:12},()=>withTenant(tenant,db=>reserveJobUsage(db,j))));
  assert.equal(results.filter(x=>x==='reserved').length,1);
  assert.equal(results.filter(x=>x==='existing').length,11);
  assert.equal((await billingOverview(tenant)).usage.find(x=>x.metric==='messages')?.used,1);
});
it('does not bypass a cancelled subscription by reusing a reservation',async()=>{
  const j=await job();await withTenant(tenant,db=>reserveJobUsage(db,j));
  await admin.query("UPDATE billing_accounts SET status='canceled' WHERE tenant_id=$1",[tenant]);
  try{await assert.rejects(()=>withTenant(tenant,db=>reserveJobUsage(db,j)),/SUBSCRIPTION_INACTIVE/);}
  finally{await admin.query("UPDATE billing_accounts SET status='active' WHERE tenant_id=$1",[tenant]);}
});
it('blocks expired access and features absent from a plan',async()=>{
  const j=await job('ai');
  await assert.rejects(()=>withTenant(tenant,db=>reserveJobUsage(db,j)),/PLAN_FEATURE_UNAVAILABLE/);
  await admin.query("UPDATE billing_accounts SET access_until=now()-interval '1 second' WHERE tenant_id=$1",[tenant]);
  try{await assert.rejects(()=>withTenant(tenant,db=>reserveJobUsage(db,j)),/SUBSCRIPTION_INACTIVE/);}
  finally{await admin.query("UPDATE billing_accounts SET access_until=now()+interval '30 days' WHERE tenant_id=$1",[tenant]);}
});
it('rolls a reservation back when the surrounding task transaction fails',async()=>{
  const j=await job('task');
  await assert.rejects(()=>withTenant(tenant,async db=>{await reserveJobUsage(db,j);throw new Error('rollback');}),/rollback/);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT 1 FROM billing_usage WHERE job_id=$1',[j.id]))).rowCount,0);
});
it('serializes mixed-channel traffic at the exact monthly limit',async()=>{
  // Seed 999 consumed slots only inside this isolated fixture.
  await admin.query('DELETE FROM billing_usage WHERE tenant_id=$1',[tenant]);
  await admin.query(`WITH jobs AS (
    INSERT INTO engine_jobs(tenant_id,actor_id,kind,dedupe_key,status)
    SELECT $1,$2,'email','quota-seed-'||n,'succeeded' FROM generate_series(1,999) n RETURNING id
  ) INSERT INTO billing_usage(tenant_id,job_id,metric,usage_month)
    SELECT $1,id,'messages',date_trunc('month',now() AT TIME ZONE 'UTC')::date FROM jobs`,[tenant,actor]);
  const jobs=[];for(let i=0;i<10;i++)jobs.push(await job(i%2?'whatsapp':'email'));
  const results=await Promise.allSettled(jobs.map(j=>withTenant(tenant,db=>reserveJobUsage(db,j))));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected'&&String(x.reason).includes('PLAN_MESSAGE_LIMIT')).length,9);
  assert.equal((await billingOverview(tenant)).usage.find(x=>x.metric==='messages')?.used,1000);
});
it('upgrades keep existing usage and old-month retries are never charged again',async()=>{
  await admin.query("UPDATE billing_accounts SET plan_id='pro' WHERE tenant_id=$1",[tenant]);
  const j=await job();assert.equal(await withTenant(tenant,db=>reserveJobUsage(db,j)),'reserved');
  await admin.query("UPDATE billing_usage SET usage_month=(usage_month-interval '1 month')::date WHERE tenant_id=$1 AND job_id=$2",[tenant,j.id]);
  assert.equal(await withTenant(tenant,db=>reserveJobUsage(db,j)),'existing');
  assert.equal((await billingOverview(tenant)).usage.find(x=>x.metric==='messages')?.used,1000);
  const ai=await job('ai');assert.equal(await withTenant(tenant,db=>reserveJobUsage(db,ai)),'reserved');
});
it('allows only one concurrent membership when one licensed seat remains',async()=>{
  const clients=extraUsers.map(()=>new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL}));
  try{
    await Promise.all(clients.map(c=>c.connect()));
    const results=await Promise.allSettled(clients.map((c,i)=>c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'VIEWER')",[tenant,extraUsers[i]])));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.filter(x=>x.status==='rejected'&&String(x.reason).includes('PLAN_SEAT_LIMIT')).length,1);
  }finally{await Promise.all(clients.map(c=>c.end()));}
});
it('blocks engine dispatch after a seat downgrade without deleting existing members',async()=>{
  await admin.query('UPDATE billing_accounts SET seats=1 WHERE tenant_id=$1',[tenant]);
  const j=await job('task');
  const row=(await admin.query<Job>('SELECT * FROM engine_jobs WHERE id=$1',[j.id])).rows[0]!;
  await processJob(row,async()=>{throw new Error('Must not contact providers');});
  const state=(await withTenant(tenant,db=>db.query('SELECT status,error_code FROM engine_jobs WHERE id=$1',[j.id]))).rows[0];
  assert.equal(state?.status,'failed');assert.equal(state?.error_code,'PLAN_SEAT_LIMIT');
  const summary=(await billingOverview(tenant)).account!;assert.equal(summary.members,2);assert.equal(summary.access_allowed,false);
});
