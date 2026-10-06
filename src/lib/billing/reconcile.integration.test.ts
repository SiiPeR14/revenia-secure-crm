import {before,after,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withTenant} from '../db/tenant-transaction.ts';
import {closeDatabase} from '../db/pool.ts';
import {reconcileSubscription} from './reconcile.ts';
import {platformConfig} from './stripe-platform.ts';
import {billingOverview} from './usage.ts';

const tenant=randomUUID(),other=randomUUID();
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const config=platformConfig({EXTERNAL_OPERATIONS_ENABLED:'true',PLATFORM_BILLING_ENABLED:'true',PLATFORM_BILLING_MODE:'test',PLATFORM_STRIPE_SECRET_KEY:'sk_test_UnitTestingPlatformKey',APP_URL:'https://revenia.example.com',PLATFORM_STRIPE_PRICES:JSON.stringify([{plan:'pro',interval:'month',priceId:'price_Pro'}])});
const subscriptionId='sub_'+tenant.replaceAll('-',''),customerId='cus_'+tenant.replaceAll('-','');
function snapshot(){return {id:subscriptionId,customer:customerId,livemode:false,status:'active',cancel_at_period_end:false,trial_end:null,pause_collection:null,
  items:{has_more:false,data:[{quantity:3,current_period_end:Math.floor(Date.now()/1000)+30*86400,
    price:{id:'price_Pro',currency:'eur',livemode:false,billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}}}]}};}
const response=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
const due=()=>admin.query('UPDATE billing_bindings SET next_sync_at=now() WHERE tenant_id=$1',[tenant]);
before(async()=>{
  await admin.connect();
  for(const id of [tenant,other])await admin.query('INSERT INTO tenants(id,slug,name) VALUES($1,$2,$3)',[id,`sync-test-${id}`,'Billing sync test']);
  await admin.query('INSERT INTO billing_bindings(tenant_id,customer_id,subscription_id,livemode) VALUES($1,$2,$3,false)',[tenant,customerId,subscriptionId]);
});
after(async()=>{
  for(const table of ['audit_logs','billing_accounts','billing_bindings'])await admin.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1)`,[[tenant,other]]);
  await admin.query('DELETE FROM tenants WHERE id=ANY($1)',[[tenant,other]]);await admin.end();await closeDatabase();
});
it('only operators can bind provider customers and another tenant cannot apply their subscription',async()=>{
  await assert.rejects(()=>withTenant(tenant,db=>db.query("UPDATE billing_bindings SET customer_id='cus_Attack'")),/permission denied/i);
  const result=await withTenant(other,db=>db.query('SELECT revenia_apply_subscription($1,$2,false,\'pro\',\'active\',3,now()+interval \'1 day\',false) ok',[customerId,subscriptionId]));
  assert.equal(result.rows[0]?.ok,false);
});
it('synchronizes an exact subscription binding and caps offline access at 24 hours',async()=>{
  assert.equal(await reconcileSubscription(tenant,config,async(url,init)=>{
    assert.equal(url,`https://api.stripe.com/v1/subscriptions/${subscriptionId}`);assert.equal(init.method,'GET');return response(snapshot());
  }),'synced');
  const state=(await billingOverview(tenant)).account!;
  assert.equal(state.plan_id,'pro');assert.equal(state.seats,3);assert.equal(state.status,'active');
  assert.ok(state.access_until.getTime()<=Date.now()+86400*1000);
  assert.ok(state.access_until.getTime()>Date.now()+86000*1000);
  assert.equal(await reconcileSubscription(tenant,config,async()=>{throw new Error('Must not fetch before next_sync_at');}),'idle');
});
it('serializes simultaneous refreshes without duplicate provider reads or audit noise',async()=>{
  await due();let calls=0;
  const results=await Promise.all(Array.from({length:8},()=>reconcileSubscription(tenant,config,async()=>{calls++;return response(snapshot());})));
  assert.equal(calls,1);assert.equal(results.filter(x=>x==='synced').length,1);
  assert.equal((await withTenant(tenant,db=>db.query("SELECT 1 FROM audit_logs WHERE action='billing.subscription_synced'"))).rowCount,1);
});
it('does not extend access when Stripe is temporarily unavailable',async()=>{
  await due();const previous=(await billingOverview(tenant)).account!.access_until.getTime();
  assert.equal(await reconcileSubscription(tenant,config,async()=>new Response('private diagnostics',{status:503})),'failed');
  assert.equal((await billingOverview(tenant)).account!.access_until.getTime(),previous);
  const error=(await withTenant(tenant,db=>db.query('SELECT error_code FROM billing_bindings'))).rows[0]?.error_code;
  assert.equal(error,'PLATFORM_HTTP_503');
});
it('suspends access on mismatched customers, unknown prices, wrong mode or multiple items',async()=>{
  const original=snapshot();
  const badPrice={...original,items:{...original.items,data:[{...original.items.data[0]!,price:{...original.items.data[0]!.price,id:'price_Unknown'}}]}};
  for(const invalid of [{...original,customer:'cus_Other'},{...original,livemode:true},badPrice,{...original,items:{...original.items,data:[...original.items.data,...original.items.data]}}]){
    await due();await reconcileSubscription(tenant,config,async()=>response(original));
    await due();assert.equal(await reconcileSubscription(tenant,config,async()=>response(invalid)),'failed');
    assert.equal((await billingOverview(tenant)).account!.status,'paused');
  }
});
it('handles cancellations, trial deadlines and paused collection without extending entitlement',async()=>{
  const original=snapshot();
  await due();await reconcileSubscription(tenant,config,async()=>response({...original,status:'canceled'}));
  assert.equal((await billingOverview(tenant)).account!.access_allowed,false);
  const trialEnd=Math.floor(Date.now()/1000)+1800;
  await due();await reconcileSubscription(tenant,config,async()=>response({...original,status:'trialing',trial_end:trialEnd}));
  assert.equal((await billingOverview(tenant)).account!.access_until.getTime(),trialEnd*1000);
  await due();await reconcileSubscription(tenant,config,async()=>response({...original,pause_collection:{behavior:'void'}}));
  assert.equal((await billingOverview(tenant)).account!.status,'paused');
});
