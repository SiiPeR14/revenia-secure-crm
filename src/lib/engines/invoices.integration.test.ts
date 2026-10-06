import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeDatabase} from '../db/pool.ts';
import {prepareInvoiceMessage,checkInvoiceMessage} from './invoice-messages.ts';
import {scheduleRules,claimJob,processJob} from './queue.ts';

const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function scenario(work:(tenant:string,invoice:string,rule:string)=>Promise<void>){
  const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
  const tenant=randomUUID(),invoice=randomUUID(),rule=randomUUID();
  await admin.connect();
  try{
    await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[tenant,`invoice-test-${tenant}`,'Invoice engine test']);
    await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tenant,actor]);
    await withTenant(tenant,async db=>{
      await db.query("INSERT INTO automations(id,tenant_id,name,trigger_name,trigger_type,delay_days,actor_id) VALUES($1,$2,'Revisar cobro','Factura vencida','invoice_overdue',3,$3)",[rule,tenant,actor]);
      await db.query("INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES($1,$2,'FAC-TEST-01','Cliente de prueba',3250,'Pendiente',(now() AT TIME ZONE 'UTC')::date-20,(now() AT TIME ZONE 'UTC')::date-3,'Manual')",[invoice,tenant]);
    });
    await work(tenant,invoice,rule);
  }finally{
    for(const table of ['conversations','billing_usage','audit_logs','notifications','tasks','engine_jobs','engine_heartbeat','invoices','automations','clients','memberships'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
    await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);
    await admin.end();
  }
}
after(closeDatabase);
test('due-date boundary schedules once under concurrency and records one linked task',()=>scenario(async(tenant,invoice)=>{
  const counts=await Promise.all([scheduleRules(tenant),scheduleRules(tenant)]);
  assert.equal(counts.reduce((a,b)=>a+b,0),1);
  const jobs=await Promise.all([claimJob(tenant,false),claimJob(tenant,false)]);
  assert.equal(jobs.filter(Boolean).length,1);
  const job=jobs.find(Boolean)!;await processJob(job);await processJob(job);
  const tasks=await withTenant(tenant,db=>db.query('SELECT invoice_id,title FROM tasks'));
  assert.equal(tasks.rowCount,1);assert.equal(tasks.rows[0]!.invoice_id,invoice);assert.match(tasks.rows[0]!.title,/FAC-TEST-01/);
  assert.equal(await scheduleRules(tenant),0);
}));
test('does not schedule before the threshold or for non-collectible invoice states',()=>scenario(async(tenant,invoice)=>{
  await withTenant(tenant,db=>db.query("UPDATE invoices SET due_at=(now() AT TIME ZONE 'UTC')::date-2 WHERE id=$1",[invoice]));
  assert.equal(await scheduleRules(tenant),0);
  for(const status of ['Pagada','Cancelada','Borrador','En revisión']){
    await withTenant(tenant,db=>db.query("UPDATE invoices SET due_at=(now() AT TIME ZONE 'UTC')::date-3,status=$1 WHERE id=$2",[status,invoice]));
    assert.equal(await scheduleRules(tenant),0);
  }
  await withTenant(tenant,db=>db.query("UPDATE invoices SET status='Pendiente',amount=0 WHERE id=$1",[invoice]));
  assert.equal(await scheduleRules(tenant),0);
}));
for(const status of ['Pagada','Cancelada'])test(`does not create a follow-up if an enqueued invoice becomes ${status}`,()=>scenario(async(tenant,invoice)=>{
  await scheduleRules(tenant);const job=await claimJob(tenant,false);assert.ok(job);
  await withTenant(tenant,db=>db.query('UPDATE invoices SET status=$1 WHERE id=$2',[status,invoice]));
  await processJob(job);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT id FROM tasks'))).rowCount,0);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT error_code FROM engine_jobs'))).rows[0]!.error_code,'RULE_OR_SOURCE_INACTIVE');
}));
test('rejects a changed invoice snapshot and schedules the new revision only once',()=>scenario(async(tenant,invoice)=>{
  await scheduleRules(tenant);const job=await claimJob(tenant,false);assert.ok(job);
  await withTenant(tenant,db=>db.query("UPDATE invoices SET amount=4000,updated_at=now()+interval '1 second' WHERE id=$1",[invoice]));
  await processJob(job);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT error_code FROM engine_jobs'))).rows[0]!.error_code,'SOURCE_CHANGED');
  assert.equal(await scheduleRules(tenant),1);assert.equal(await scheduleRules(tenant),0);
}));
test('revalidates rule pause before committing the task',()=>scenario(async(tenant,_invoice,rule)=>{
  await scheduleRules(tenant);const job=await claimJob(tenant,false);assert.ok(job);
  await withTenant(tenant,db=>db.query('UPDATE automations SET enabled=false WHERE id=$1',[rule]));
  await processJob(job);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT id FROM tasks'))).rowCount,0);
}));
test('isolates invoice scheduling and linked tasks between companies',()=>scenario(async(tenant,invoice)=>{
  const other=randomUUID();assert.equal(await claimJob(other,false),undefined);
  await assert.rejects(()=>withTenant(other,db=>db.query("INSERT INTO tasks(tenant_id,invoice_id,title,channel,due_at) VALUES($1,$2,'Foreign invoice','Tarea',now())",[tenant,invoice])),/row-level security/i);
  assert.equal((await withTenant(other,db=>db.query('SELECT id FROM invoices WHERE id=$1',[invoice]))).rowCount,0);
}));

async function contact(tenant:string){const id=randomUUID();await withTenant(tenant,db=>db.query("INSERT INTO clients(id,tenant_id,name,company,email) VALUES($1,$2,'Contacto Prueba','Empresa Prueba','notice@example.test')",[id,tenant]));return id;}
test('invoice notices are deduplicated drafts and do not enqueue sending',()=>scenario(async(tenant,invoice)=>{
 const client=await contact(tenant);const prepare=()=>withTenant(tenant,db=>prepareInvoiceMessage(db,{tenantId:tenant,userId:actor},invoice,client));
 const ids=await Promise.all([prepare(),prepare()]);assert.equal(ids.filter(Boolean).length,1);
 await withTenant(tenant,async db=>{assert.equal((await db.query("SELECT id FROM conversations WHERE delivery_status='draft' AND invoice_id=$1",[invoice])).rowCount,1);assert.equal((await db.query('SELECT id FROM engine_jobs')).rowCount,0);await checkInvoiceMessage(db,ids.find(Boolean)!,client);});
}));
test('invoice notice is rejected after payment or recipient mismatch',()=>scenario(async(tenant,invoice)=>{
 const client=await contact(tenant);const id=await withTenant(tenant,db=>prepareInvoiceMessage(db,{tenantId:tenant,userId:actor},invoice,client));assert.ok(id);
 await assert.rejects(()=>withTenant(tenant,db=>checkInvoiceMessage(db,id,randomUUID())),/INVOICE_NOTICE_STALE/);
 await withTenant(tenant,db=>db.query("UPDATE invoices SET status='Pagada' WHERE id=$1",[invoice]));
 await assert.rejects(()=>withTenant(tenant,db=>checkInvoiceMessage(db,id,client)),/INVOICE_NOTICE_STALE/);
 await assert.rejects(()=>withTenant(tenant,db=>prepareInvoiceMessage(db,{tenantId:tenant,userId:actor},invoice,client)),/INVOICE_NOT_PAYABLE/);
}));
test('invoice notices reject a foreign contact and changed invoice revision',()=>scenario(async(tenant,invoice)=>{
 await assert.rejects(()=>withTenant(tenant,db=>prepareInvoiceMessage(db,{tenantId:tenant,userId:actor},invoice,randomUUID())),/CONTACT_PERMISSION_MISSING/);
 const client=await contact(tenant);const id=await withTenant(tenant,db=>prepareInvoiceMessage(db,{tenantId:tenant,userId:actor},invoice,client));assert.ok(id);
 await withTenant(tenant,db=>db.query("UPDATE invoices SET amount=4500,updated_at=now()+interval '1 second' WHERE id=$1",[invoice]));
 await assert.rejects(()=>withTenant(tenant,db=>checkInvoiceMessage(db,id,client)),/INVOICE_NOTICE_STALE/);
}));
