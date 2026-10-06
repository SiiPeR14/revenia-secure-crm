import {it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {platformConfig,createPlatformCheckout,createPlatformPortal,PlatformBillingError} from './stripe-platform.ts';
import type {Transport} from '../engines/providers.ts';

const env={EXTERNAL_OPERATIONS_ENABLED:'true',PLATFORM_BILLING_ENABLED:'true',PLATFORM_BILLING_MODE:'test',PLATFORM_STRIPE_SECRET_KEY:'sk_test_ExampleKeyForUnitTestsOnly',APP_URL:'https://revenia.example.com',PLATFORM_STRIPE_PRICES:JSON.stringify([{plan:'starter',interval:'month',priceId:'price_Starter'},{plan:'pro',interval:'year',priceId:'price_ProAnnual'}])};
const config=platformConfig(env);
const input=()=>({tenantId:randomUUID(),operationId:randomUUID(),customerId:'cus_Fixture',plan:'starter' as const,interval:'month' as const,seats:2});
const price={id:'price_Starter',active:true,livemode:false,currency:'eur',unit_amount:2900,billing_scheme:'per_unit',recurring:{interval:'month',interval_count:1,usage_type:'licensed'}};
const session={id:'cs_test_Fixture',url:'https://checkout.stripe.com/c/pay/testFixture',livemode:false};
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
it('requires explicit platform activation, rejects duplicate price mappings and isolates live keys',()=>{
  assert.throws(()=>platformConfig({...env,EXTERNAL_OPERATIONS_ENABLED:'false'}),/PLATFORM_BILLING_DISABLED/);
  assert.throws(()=>platformConfig({...env,PLATFORM_BILLING_ENABLED:'false'}),/PLATFORM_BILLING_DISABLED/);
  assert.throws(()=>platformConfig({...env,PLATFORM_STRIPE_SECRET_KEY:['sk','live','ExampleKeyForUnitTestsOnly'].join('_')}),/CONFIG_INVALID/);
  assert.throws(()=>platformConfig({...env,PLATFORM_STRIPE_PRICES:JSON.stringify([{plan:'starter',interval:'month',priceId:'price_A'},{plan:'starter',interval:'month',priceId:'price_B'}])}),/CONFIG_INVALID/);
  assert.throws(()=>platformConfig({...env,APP_URL:'https://user:pass@revenia.example.com'}),/CONFIG_INVALID/);
});
it('creates a recurring checkout using server-selected prices and stable idempotency',async()=>{
  const p=input();const posts:URLSearchParams[]=[];const keys:string[]=[];
  const transport:Transport=async(url,init)=>{
    assert.ok(url.startsWith('https://api.stripe.com/v1/'));
    assert.equal(init.redirect,'error');
    const headers=new Headers(init.headers);assert.equal(headers.get('Stripe-Version'),'2025-03-31.basil');
    if(init.method==='GET')return json(price);
    posts.push(new URLSearchParams(String(init.body)));keys.push(headers.get('Idempotency-Key')!);return json(session);
  };
  assert.equal((await createPlatformCheckout(config,p,transport)).url,session.url);
  await createPlatformCheckout(config,p,transport);
  assert.equal(keys[0],keys[1]);assert.equal(keys[0],`revenia-subscription:${p.operationId}`);
  const body=posts[0]!;assert.equal(body.get('mode'),'subscription');assert.equal(body.get('customer'),p.customerId);
  assert.equal(body.get('line_items[0][price]'),'price_Starter');assert.equal(body.get('line_items[0][quantity]'),'2');
  assert.equal(body.get('subscription_data[metadata][tenant_id]'),p.tenantId);
  assert.equal(body.get('line_items[0][price_data][unit_amount]'),null);
});
it('rejects invalid plans and seat quantities before contacting Stripe',async()=>{
  let calls=0;const transport:Transport=async()=>{calls++;return json(price);};
  await assert.rejects(()=>createPlatformCheckout(config,{...input(),seats:6},transport),/PLAN_INVALID/);
  await assert.rejects(()=>createPlatformCheckout(config,{...input(),interval:'year'},transport),/PLAN_INVALID/);
  assert.equal(calls,0);
});
it('rejects archived, metered, wrong-mode and wrong-currency prices before charging',async()=>{
  for(const invalid of [{...price,active:false},{...price,livemode:true},{...price,currency:'usd'},{...price,recurring:{...price.recurring,usage_type:'metered'}},{...price,recurring:{...price.recurring,interval:'year'}}]){
    let posted=false;
    await assert.rejects(()=>createPlatformCheckout(config,input(),async(_url,init)=>{if(init.method==='POST')posted=true;return json(invalid);}),/PRICE_INVALID/);
    assert.equal(posted,false);
  }
});
it('never redirects to a provider-supplied untrusted checkout URL',async()=>{
  for(const url of ['https://checkout.stripe.com.attacker.test/x','https://checkout.stripe.com@attacker.test/x','http://checkout.stripe.com/x','https://checkout.stripe.com:444/x']){
    await assert.rejects(()=>createPlatformCheckout(config,input(),async(_url,init)=>json(init.method==='GET'?price:{...session,url})),(error)=>error instanceof PlatformBillingError&&error.uncertain&&error.code==='PLATFORM_CHECKOUT_RESPONSE_INVALID');
  }
});
it('marks an interrupted checkout as uncertain without leaking response text or credentials',async()=>{
  await assert.rejects(()=>createPlatformCheckout(config,input(),async(_url,init)=>{if(init.method==='GET')return json(price);throw new Error('secret transport diagnostic');}),error=>error instanceof PlatformBillingError&&error.uncertain&&!error.message.includes('secret'));
  await assert.rejects(()=>createPlatformCheckout(config,input(),async(_url,init)=>init.method==='GET'?json(price):new Response('private response',{status:500})),/PLATFORM_HTTP_500/);
});
it('creates a portal session for the supplied bound customer with a fixed return origin',async()=>{
  const p=input();const result=await createPlatformPortal(config,p.customerId,p.operationId,async(url,init)=>{
    assert.equal(url,'https://api.stripe.com/v1/billing_portal/sessions');
    const form=new URLSearchParams(String(init.body));assert.equal(form.get('customer'),p.customerId);
    assert.equal(form.get('return_url'),'https://revenia.example.com/configuracion?tab=plan');
    return json({id:'bps_Fixture',url:'https://billing.stripe.com/p/session/fixture'});
  });
  assert.ok(result.url.startsWith('https://billing.stripe.com/'));
});
