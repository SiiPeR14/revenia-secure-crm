import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {retryAllowed,retryDelay,checkoutPayload,whatsappPayload,EngineError,type Job} from './contracts.ts';
import {dispatchProvider} from './providers.ts';
import {encryptValue,decryptValue} from '../security/encryption.ts';

const uuid='11111111-1111-4111-8111-111111111111';
const job=(kind:Job['kind'],payload:unknown):Job=>({id:uuid,tenant_id:uuid,actor_id:uuid,kind,payload,status:'running',attempts:1,lease_token:uuid,created_at:new Date(),first_attempt_at:new Date(),result:{},error_code:null});
describe('durable provider contracts',()=>{
  it('limits retries to idempotent providers and a bounded window',()=>{
    assert.equal(retryAllowed(job('email',{})),true);
    assert.equal(retryAllowed(job('whatsapp',{})),false);
    assert.equal(retryAllowed(job('ai',{})),false);
    assert.equal(retryAllowed({...job('checkout',{}),attempts:5}),false);
    assert.equal(retryAllowed({...job('email',{}),first_attempt_at:new Date(Date.now()-7*3600000)}),false);
    assert.equal(retryDelay(1),30);assert.equal(retryDelay(20),3600);
  });
  it('binds credential ciphertext to company and provider',()=>{
    const key='12'.repeat(32);const encrypted=encryptValue('secret',key,`provider:${uuid}:resend`);
    assert.equal(decryptValue(encrypted,key,`provider:${uuid}:resend`),'secret');
    assert.throws(()=>decryptValue(encrypted,key,`provider:${uuid}:stripe`));
    assert.throws(()=>decryptValue(encrypted,key,'provider:other:resend'));
  });
  it('rejects unsafe payment amounts and malformed WhatsApp destinations',()=>{
    assert.equal(checkoutPayload.safeParse({invoiceId:uuid,tenantId:uuid,number:'F1',amountCents:0,currency:'eur'}).success,false);
    assert.equal(whatsappPayload.safeParse({conversationId:uuid,clientId:uuid,to:'../private',template:'hello',language:'es'}).success,false);
  });
  it('sends Resend with stable idempotency and plain text',async()=>{
    const result=await dispatchProvider(job('email',{conversationId:uuid,clientId:uuid,to:'test@example.test',subject:'Test',body:'Hello'}),{provider:'resend',apiKey:'test-secret-key',from:'sender@example.test',webhookSecret:'test-webhook-secret'},async(url,init)=>{
      assert.equal(url,'https://api.resend.com/emails');assert.equal(new Headers(init.headers).get('Idempotency-Key'),uuid);
      assert.deepEqual(JSON.parse(String(init.body)),{from:'sender@example.test',to:['test@example.test'],subject:'Test',text:'Hello'});
      return Response.json({id:'email_test'});
    });assert.equal(result.providerId,'email_test');
  });
  it('restricts WhatsApp outbound to explicit approved-template identifiers',async()=>{
    await dispatchProvider(job('whatsapp',{conversationId:uuid,clientId:uuid,to:'+34600111222',template:'follow_up',language:'es'}),{provider:'whatsapp',apiKey:'test-secret-key',appSecret:'test-app-secret',verifyToken:'test-verify-token',phoneId:'123456789',graphVersion:'v23.0'},async(url,init)=>{
      assert.match(url,/^https:\/\/graph.facebook.com\/v23.0\/123456789\/messages$/);
      const body=JSON.parse(String(init.body));assert.equal(body.type,'template');assert.equal(body.template.name,'follow_up');assert.equal(body.to,'34600111222');
      return Response.json({messages:[{id:'wamid.test'}]});
    });
  });
  it('stores AI output, model, usage and a configured cost estimate without tools',async()=>{
    const result=await dispatchProvider(job('ai',{opportunityId:uuid,context:'Propuesta pendiente'}),{provider:'openai',apiKey:'test-secret-key',model:'configured-model',inputPricePerMillion:1,outputPricePerMillion:2},async(url,init)=>{
      assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(init.body));assert.equal(body.store,false);assert.equal(body.max_output_tokens,1000);assert.equal(body.tools,undefined);
      return Response.json({id:'resp_test',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Borrador'}]}],usage:{input_tokens:100,output_tokens:20}});
    });assert.equal(result.text,'Borrador');assert.equal(result.estimatedCostUsd,0.00014);
  });
  it('creates hosted checkout with server-provided amount and metadata',async()=>{
    const result=await dispatchProvider(job('checkout',{invoiceId:uuid,tenantId:uuid,number:'F-TEST',amountCents:12345,currency:'eur'}),{provider:'stripe',apiKey:'sk_test_mock',webhookSecret:'whsec_mock'},async(url,init)=>{
      assert.equal(url,'https://api.stripe.com/v1/checkout/sessions');const body=new URLSearchParams(String(init.body));assert.equal(body.get('line_items[0][price_data][unit_amount]'),'12345');assert.equal(body.get('metadata[tenant_id]'),uuid);
      return Response.json({id:'cs_test',url:'https://checkout.stripe.com/test'});
    });assert.equal(result.providerId,'cs_test');
  });
  it('rejects an unexpected redirect from a checkout response',async()=>{
    await assert.rejects(()=>dispatchProvider(job('checkout',{invoiceId:uuid,tenantId:uuid,number:'F-TEST',amountCents:10,currency:'eur'}),{provider:'stripe',apiKey:'sk_test_mock',webhookSecret:'whsec_mock'},async()=>Response.json({id:'cs_test',url:'https://malicious.example/test'})),/CHECKOUT_URL_INVALID/);
  });
  it('does not expose provider response bodies or credentials on failures',async()=>{
    await assert.rejects(()=>dispatchProvider(job('email',{conversationId:uuid,clientId:uuid,to:'test@example.test',subject:'Test',body:'Hello'}),{provider:'resend',apiKey:'secret-sensitive-key',from:'sender@example.test',webhookSecret:'test-webhook-secret'},async()=>new Response('private data',{status:429})),(error:unknown)=>error instanceof EngineError&&error.code==='PROVIDER_HTTP_429'&&error.retryable&&!error.message.includes('private'));
  });
});
