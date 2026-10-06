import {before,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeDatabase} from '../db/pool.ts';
import {receivePlatformNotification} from './notifications.ts';

const tenant=randomUUID(),other=randomUUID(),subscription='sub_'+tenant.replaceAll('-',''),customer='cus_'+tenant.replaceAll('-','');
const config={secret:'whsec_SyntheticNotificationSecret',live:false};
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const event=()=>({id:'evt_'+randomUUID().replaceAll('-',''),type:'customer.subscription.updated',livemode:false,data:{object:{id:subscription,customer,status:'active',metadata:{tenant_id:other}}}});
function signed(value:unknown,stamp=Math.floor(Date.now()/1000)){
  const raw=JSON.stringify(value);const signature=createHmac('sha256',config.secret).update(`${stamp}.${raw}`).digest('hex');
  return {raw,headers:new Headers({'stripe-signature':`t=${stamp},v1=${signature}`})};
}
async function receive(value:unknown){const request=signed(value);return receivePlatformNotification(request.raw,request.headers,config);}
before(async()=>{
  await admin.connect();
  for(const id of [tenant,other])await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[id,`notice-test-${id}`,'Notification fixture']);
  await admin.query("INSERT INTO billing_bindings(tenant_id,customer_id,subscription_id,livemode,next_sync_at) VALUES($1,$2,$3,false,now()+interval '1 day')",[tenant,customer,subscription]);
});
after(async()=>{
  for(const table of ['billing_event_receipts','billing_bindings'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1)`,[[tenant,other]]);
  await admin.query('DELETE FROM tenants WHERE id=ANY($1)',[[tenant,other]]);await admin.end();await closeDatabase();
});
it('rejects forged, expired and wrong-mode notifications before storage',async()=>{
  const valid=signed(event());
  await assert.rejects(()=>receivePlatformNotification(valid.raw,new Headers(),config),/SIGNATURE/);
  const old=signed(event(),Math.floor(Date.now()/1000)-600);
  await assert.rejects(()=>receivePlatformNotification(old.raw,old.headers,config),/SIGNATURE/);
  await assert.rejects(()=>receive({...event(),livemode:true}),/MODE_INVALID/);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT 1 FROM billing_event_receipts'))).rowCount,0);
});
it('uses the bound Stripe identity and ignores forged tenant metadata',async()=>{
  assert.equal(await receive(event()),'queued');
  assert.equal((await withTenant(tenant,db=>db.query('SELECT 1 FROM billing_bindings WHERE next_sync_at<=now()'))).rowCount,1);
  assert.equal((await withTenant(other,db=>db.query('SELECT 1 FROM billing_event_receipts'))).rowCount,0);
  assert.equal((await withTenant(tenant,db=>db.query('SELECT 1 FROM billing_accounts'))).rowCount,0,'A webhook alone must never grant access');
});
it('deduplicates simultaneous deliveries and rejects conflicting bodies for the same id',async()=>{
  const value=event();const results=await Promise.all(Array.from({length:10},()=>receive(value)));
  assert.equal(results.filter(x=>x==='queued').length,1);assert.equal(results.filter(x=>x==='duplicate').length,9);
  await assert.rejects(()=>receive({...value,data:{object:{...value.data.object,status:'canceled'}}}),/EVENT_CONFLICT/);
});
it('ignores unbound subscriptions and unrelated events without granting access',async()=>{
  const value=event();
  assert.equal(await receive({...value,data:{object:{...value.data.object,id:'sub_Unbound'}}}),'ignored');
  assert.equal(await receive({...value,type:'payment_intent.succeeded'}),'ignored');
});
it('handles renewal invoice notifications using the pinned API subscription parent',async()=>{
  const value={...event(),type:'invoice.paid',data:{object:{customer,parent:{type:'subscription_details',subscription_details:{subscription}}}}};
  assert.equal(await receive(value),'queued');
  assert.equal(await receive({...value,id:'evt_'+randomUUID().replaceAll('-',''),data:{object:{customer,parent:null}}}),'ignored');
});
