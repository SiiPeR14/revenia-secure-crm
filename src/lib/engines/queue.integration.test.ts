import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeDatabase} from '../db/pool.ts';
import {enqueue,claimJob,processJob,scheduleRules} from './queue.ts';
import {applyStripeEvent,processWebhookInbox} from './events.ts';
import {sealCredentials,encryptionKey} from './connections.ts';
import {encryptValue} from '../security/encryption.ts';

const tenant=randomUUID();const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const rule=randomUUID();const quote=randomUUID();
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
before(async()=>{
  await admin.connect();
  await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[tenant,`engine-test-${tenant}`,'Engine integration test']);
  await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tenant,actor]);
  await withTenant(tenant,async db=>{
    await db.query("INSERT INTO automations(id,tenant_id,name,trigger_name,trigger_type,delay_days,actor_id) VALUES($1,$2,'Engine test rule','Quote inactivity','quote_inactive',1,$3)",[rule,tenant,actor]);
    await db.query("INSERT INTO quotes(id,tenant_id,number,amount,status,issued_at,expires_at,updated_at) VALUES($1,$2,'ENGINE-TEST',100,'Enviado',CURRENT_DATE,CURRENT_DATE,now()-interval '3 days')",[quote,tenant]);
  });
});
after(async()=>{
  for(const table of ['audit_logs','notifications','tasks','webhook_receipts','provider_connections','message_suppressions','contact_permissions','conversations','checkout_links','payments','engine_jobs','engine_heartbeat','invoices','quotes','automations','clients','memberships'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
  await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);await admin.end();await closeDatabase();
});
describe('durable queue in PostgreSQL',()=>{
  it('schedules once, grants one lease and commits one audited task',async()=>{
    assert.equal(await scheduleRules(tenant),1);assert.equal(await scheduleRules(tenant),0);
    const claims=await Promise.all([claimJob(tenant),claimJob(tenant)]);assert.equal(claims.filter(Boolean).length,1);
    const job=claims.find(Boolean)!;await processJob(job);await processJob(job);
    await withTenant(tenant,async db=>{
      assert.equal((await db.query('SELECT id FROM tasks')).rowCount,1);
      assert.equal((await db.query("SELECT id FROM engine_jobs WHERE status='succeeded'")).rowCount,1);
      assert.equal((await db.query("SELECT id FROM audit_logs WHERE action='engine.succeeded'")).rowCount,1);
    });
  });
  it('blocks cross-company reads and inserts in the new queue',async()=>{
    const other=randomUUID();
    assert.equal((await withTenant(other,db=>db.query('SELECT id FROM engine_jobs WHERE tenant_id=$1',[tenant]))).rowCount,0);
    await assert.rejects(()=>withTenant(other,db=>enqueue(db,tenant,actor,'task','forbidden',{ruleId:rule,sourceId:quote,source:'quote',clientId:null,title:'Forbidden task'})),/row-level security/i);
  });
  it('cancels work when its rule is paused before execution',async()=>{
    await withTenant(tenant,async db=>{
      await enqueue(db,tenant,actor,'task','paused-rule',{ruleId:rule,sourceId:quote,source:'quote',clientId:null,title:'Should not run'});
      await db.query('UPDATE automations SET enabled=false WHERE id=$1',[rule]);
    });
    const job=await claimJob(tenant);assert.ok(job);await processJob(job);
    const result=await withTenant(tenant,db=>db.query("SELECT status,error_code FROM engine_jobs WHERE id=$1",[job.id]));
    assert.equal(result.rows[0]?.status,'failed');assert.equal(result.rows[0]?.error_code,'RULE_OR_SOURCE_INACTIVE');
    assert.equal((await withTenant(tenant,db=>db.query('SELECT id FROM tasks'))).rowCount,1);
  });
  it('does not claim external jobs while sending is disabled',async()=>{
    const previous=process.env.EXTERNAL_OPERATIONS_ENABLED;process.env.EXTERNAL_OPERATIONS_ENABLED='false';
    try{
      await withTenant(tenant,db=>enqueue(db,tenant,actor,'ai','disabled-ai',{opportunityId:randomUUID(),context:'Test context'}));
      assert.equal(await claimJob(tenant),undefined);
    }finally{if(previous===undefined)delete process.env.EXTERNAL_OPERATIONS_ENABLED;else process.env.EXTERNAL_OPERATIONS_ENABLED=previous;}
  });
  it('advances beyond the first hundred sources and rejects activity after scheduling',async()=>{
    const batchRule=randomUUID();
    await withTenant(tenant,async db=>{
      await db.query("INSERT INTO automations(id,tenant_id,name,trigger_name,trigger_type,delay_days,actor_id) VALUES($1,$2,'Batch rule','Quote inactivity','quote_inactive',1,$3)",[batchRule,tenant,actor]);
      await db.query("UPDATE quotes SET status='Aceptado' WHERE id=$1",[quote]);
      await db.query("INSERT INTO quotes(tenant_id,number,amount,status,issued_at,expires_at,updated_at) SELECT $1,'BATCH-'||n,100,'Enviado',CURRENT_DATE,CURRENT_DATE,now()-interval '3 days' FROM generate_series(1,105) n",[tenant]);
    });
    assert.equal(await scheduleRules(tenant),100);assert.equal(await scheduleRules(tenant),5);assert.equal(await scheduleRules(tenant),0);
    const job=await claimJob(tenant,false);assert.ok(job);
    await withTenant(tenant,db=>db.query('UPDATE quotes SET updated_at=now() WHERE id=$1',[(job.payload as {sourceId:string}).sourceId]));
    await processJob(job);
    assert.equal((await withTenant(tenant,db=>db.query('SELECT status FROM engine_jobs WHERE id=$1',[job.id]))).rows[0]?.status,'failed');
    assert.equal((await withTenant(tenant,db=>db.query('SELECT id FROM tasks'))).rowCount,1);
  });
});

describe('provider event reconciliation without external calls',()=>{
  const invoice=randomUUID();let jobId:string;
  const paid=(amount=12500)=>({id:'evt_paid',type:'checkout.session.completed',created:1700000000,data:{object:{id:'cs_test_local',metadata:{tenant_id:tenant,job_id:jobId,invoice_id:invoice},amount_total:amount,currency:'eur',payment_status:'paid'}}});
  it('rejects a wrong amount, commits one payment and ignores duplicate/late expiry events',async()=>{
    await withTenant(tenant,async db=>{
      await db.query("INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES($1,$2,'PAYMENT-TEST','Test customer',125,'Pendiente',CURRENT_DATE,CURRENT_DATE,'Test')",[invoice,tenant]);
      jobId=(await enqueue(db,tenant,actor,'checkout','payment-test',{invoiceId:invoice,number:'PAYMENT-TEST',amountCents:12500,currency:'eur',tenantId:tenant}))!;
      await db.query('INSERT INTO checkout_links(tenant_id,invoice_id,job_id,amount_cents,currency) VALUES($1,$2,$3,12500,\'eur\')',[tenant,invoice,jobId]);
    });
    await assert.rejects(()=>withTenant(tenant,db=>applyStripeEvent(db,tenant,paid(12499))),/CHECKOUT_AMOUNT_MISMATCH/);
    assert.equal((await withTenant(tenant,db=>db.query('SELECT status FROM invoices WHERE id=$1',[invoice]))).rows[0]?.status,'Pendiente');
    await withTenant(tenant,db=>applyStripeEvent(db,tenant,paid()));
    await withTenant(tenant,db=>applyStripeEvent(db,tenant,paid()));
    await withTenant(tenant,db=>applyStripeEvent(db,tenant,{...paid(),type:'checkout.session.expired'}));
    await withTenant(tenant,async db=>{
      assert.equal((await db.query('SELECT id FROM payments WHERE invoice_id=$1',[invoice])).rowCount,1);
      assert.equal((await db.query('SELECT state FROM checkout_links WHERE job_id=$1',[jobId])).rows[0]?.state,'paid');
      assert.equal((await db.query('SELECT status FROM invoices WHERE id=$1',[invoice])).rows[0]?.status,'Pagada');
    });
  });
  it('backs off unmatched receipts and quarantines exhausted events',async()=>{
    const c={provider:'stripe' as const,apiKey:'sk_test_mock_only',webhookSecret:'whsec_mock_only'};
    await withTenant(tenant,async db=>{
      await db.query('INSERT INTO provider_connections(tenant_id,provider,credentials,enabled) VALUES($1,\'stripe\',$2,true)',[tenant,JSON.stringify(sealCredentials(tenant,c))]);
      const event=paid();event.data.object.metadata.job_id=randomUUID();
      const payload=encryptValue(JSON.stringify(event),encryptionKey(),`webhook:${tenant}:stripe:evt_unmatched`);
      await db.query('INSERT INTO webhook_receipts(tenant_id,provider,event_id,body_hash,payload) VALUES($1,\'stripe\',\'evt_unmatched\',\'test\',$2)',[tenant,JSON.stringify(payload)]);
    });
    await processWebhookInbox(tenant);await processWebhookInbox(tenant);
    const first=(await withTenant(tenant,db=>db.query('SELECT attempts,available_at>now() delayed FROM webhook_receipts WHERE event_id=\'evt_unmatched\''))).rows[0];
    assert.equal(first?.attempts,1);assert.equal(first?.delayed,true);
    await withTenant(tenant,db=>db.query("UPDATE webhook_receipts SET attempts=19,available_at=now() WHERE event_id='evt_unmatched'"));
    await processWebhookInbox(tenant);
    assert.ok((await withTenant(tenant,db=>db.query("SELECT quarantined_at FROM webhook_receipts WHERE event_id='evt_unmatched'"))).rows[0]?.quarantined_at);
  });
  it('deduplicates inbound WhatsApp and preserves a recipient opt-out',async()=>{
    const c={provider:'whatsapp' as const,apiKey:'mock_token_only',phoneId:'12345678',appSecret:'mock_app_secret',verifyToken:'mock_verify_token',graphVersion:'v23.0'};
    await withTenant(tenant,async db=>{
      await db.query('INSERT INTO provider_connections(tenant_id,provider,credentials,enabled) VALUES($1,\'whatsapp\',$2,true)',[tenant,JSON.stringify(sealCredentials(tenant,c))]);
      const event={object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:c.phoneId},messages:[{id:'wamid.local',from:'34600000000',timestamp:'1700000000',type:'text',text:{body:'BAJA'}}]}}]}]};
      for(const eventId of ['meta_one','meta_duplicate'])await db.query('INSERT INTO webhook_receipts(tenant_id,provider,event_id,body_hash,payload) VALUES($1,\'whatsapp\',$2,\'test\',$3)',[tenant,eventId,JSON.stringify(encryptValue(JSON.stringify(event),encryptionKey(),`webhook:${tenant}:whatsapp:${eventId}`))]);
    });
    await processWebhookInbox(tenant);
    await withTenant(tenant,async db=>{
      assert.equal((await db.query("SELECT id FROM conversations WHERE provider_message_id='wamid.local'")).rowCount,1);
      assert.equal((await db.query("SELECT address FROM message_suppressions WHERE address='34600000000'")).rowCount,1);
      assert.equal((await db.query("SELECT event_id FROM webhook_receipts WHERE provider='whatsapp' AND processed_at IS NOT NULL AND payload IS NULL")).rowCount,2);
    });
  });
});

describe('send-time safeguards with a simulated transport',()=>{
  async function enabled(work:()=>Promise<void>){
    const previous=process.env.EXTERNAL_OPERATIONS_ENABLED;process.env.EXTERNAL_OPERATIONS_ENABLED='true';
    try{await work();}finally{if(previous===undefined)delete process.env.EXTERNAL_OPERATIONS_ENABLED;else process.env.EXTERNAL_OPERATIONS_ENABLED=previous;}
  }
  async function emailJob(){
    const clientId=randomUUID();const conversationId=randomUUID();const address=`${clientId}@example.test`;
    const c={provider:'resend' as const,apiKey:'mock_only_api_key',from:'sender@example.test',webhookSecret:'mock_only_webhook_secret'};
    await withTenant(tenant,async db=>{
      await db.query("UPDATE engine_jobs SET status='cancelled' WHERE status='queued'");
      await db.query("INSERT INTO provider_connections(tenant_id,provider,credentials,enabled) VALUES($1,'resend',$2,true) ON CONFLICT(tenant_id,provider) DO UPDATE SET enabled=true,version=gen_random_uuid()",[tenant,JSON.stringify(sealCredentials(tenant,c))]);
      await db.query("INSERT INTO clients(id,tenant_id,name,company,email) VALUES($1,$2,'Test client','Test company',$3)",[clientId,tenant,address]);
      await db.query("INSERT INTO contact_permissions(tenant_id,client_id,channel,allowed,evidence,recorded_by) VALUES($1,$2,'Email',true,'Synthetic test permission',$3)",[tenant,clientId,actor]);
      await db.query("INSERT INTO conversations(id,tenant_id,client_id,channel,direction,body,delivery_status) VALUES($1,$2,$3,'Email','Salida','Test body','queued')",[conversationId,tenant,clientId]);
      const id=await enqueue(db,tenant,actor,'email',`test-email:${conversationId}`,{conversationId,clientId,to:address,subject:'Test subject',body:'Test body'});
      await db.query('UPDATE conversations SET engine_job_id=$1 WHERE id=$2',[id,conversationId]);
    });
    const job=await claimJob(tenant);assert.ok(job);assert.equal(job.kind,'email');return {job,clientId,conversationId,address};
  }
  for(const scenario of ['permission','recipient','actor','connection','suppression'] as const)it(`does not send after a ${scenario} change`,()=>enabled(async()=>{
    const {job,clientId,address}=await emailJob();
    await withTenant(tenant,async db=>{
      if(scenario==='permission')await db.query('UPDATE contact_permissions SET allowed=false WHERE client_id=$1',[clientId]);
      if(scenario==='recipient')await db.query('UPDATE clients SET email=$1 WHERE id=$2',[`changed-${address}`,clientId]);
      if(scenario==='actor')await admin.query("UPDATE memberships SET role='VIEWER' WHERE tenant_id=$1 AND user_id=$2",[tenant,actor]);
      if(scenario==='connection')await db.query("UPDATE provider_connections SET version=gen_random_uuid() WHERE provider='resend'");
      if(scenario==='suppression')await db.query("INSERT INTO message_suppressions(tenant_id,channel,address,reason) VALUES($1,'Email',$2,'recipient_request')",[tenant,address]);
    });
    let sent=0;
    try{
      await processJob(job,async()=>{sent++;return Response.json({id:'should_not_send'});});
      assert.equal(sent,0);assert.equal((await withTenant(tenant,db=>db.query('SELECT status FROM engine_jobs WHERE id=$1',[job.id]))).rows[0]?.status,'failed');
    }finally{if(scenario==='actor')await admin.query("UPDATE memberships SET role='OWNER' WHERE tenant_id=$1 AND user_id=$2",[tenant,actor]);}
  }));
  it('dispatches once when the same lease is processed concurrently',()=>enabled(async()=>{
    const {job,conversationId}=await emailJob();let sends=0;
    const transport=async()=>{sends++;return Response.json({id:'mock_accepted_once'});};
    await Promise.all([processJob(job,transport),processJob(job,transport)]);
    assert.equal(sends,1);
    await withTenant(tenant,async db=>{
      assert.equal((await db.query('SELECT status FROM engine_jobs WHERE id=$1',[job.id])).rows[0]?.status,'succeeded');
      assert.equal((await db.query('SELECT delivery_status FROM conversations WHERE id=$1',[conversationId])).rows[0]?.delivery_status,'accepted');
    });
  }));
  it('does not resend an external job after an expired worker lease',()=>enabled(async()=>{
    const {job,conversationId}=await emailJob();
    await withTenant(tenant,db=>db.query("UPDATE engine_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]));
    assert.equal(await claimJob(tenant),undefined);
    await withTenant(tenant,async db=>{
      assert.equal((await db.query('SELECT status FROM engine_jobs WHERE id=$1',[job.id])).rows[0]?.status,'uncertain');
      assert.equal((await db.query('SELECT delivery_status FROM conversations WHERE id=$1',[conversationId])).rows[0]?.delivery_status,'uncertain');
    });
  }));
});
