import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyWebhook,limitedBody} from './signatures.ts';

const raw='{"id":"evt_test"}';const time=1700000000;const now=time*1000;
describe('webhook verification',()=>{
  it('accepts Stripe rotation signatures and rejects altered or old requests',()=>{
    const c={provider:'stripe' as const,apiKey:'sk_test_mock',webhookSecret:'whsec_test'};
    const signature=createHmac('sha256',c.webhookSecret).update(`${time}.${raw}`).digest('hex');
    const h=new Headers({'stripe-signature':`t=${time},v1=wrong,v1=${signature}`});
    assert.ok(verifyWebhook(raw,h,c,now));assert.throws(()=>verifyWebhook(raw+' ',h,c,now),/SIGNATURE_INVALID/);assert.throws(()=>verifyWebhook(raw,h,c,now+301000),/SIGNATURE_EXPIRED/);
  });
  it('verifies Svix id, timestamp and raw body for Resend',()=>{
    const key=Buffer.from('a sufficiently long webhook secret');const c={provider:'resend' as const,apiKey:'mock_key_123',from:'sender@example.test',webhookSecret:'whsec_'+key.toString('base64')};
    const sig=createHmac('sha256',key).update(`msg_test.${time}.${raw}`).digest('base64');
    const h=new Headers({'svix-id':'msg_test','svix-timestamp':String(time),'svix-signature':`v1,${sig}`});
    assert.equal(verifyWebhook(raw,h,c,now),'msg_test');h.set('svix-id','other');assert.throws(()=>verifyWebhook(raw,h,c,now),/SIGNATURE_INVALID/);
  });
  it('validates the Meta HMAC and rejects a signature from another app',()=>{
    const c={provider:'whatsapp' as const,apiKey:'mock_key_123',phoneId:'12345678',graphVersion:'v23.0',appSecret:'test_app_secret',verifyToken:'verify_token_123'};
    const sig='sha256='+createHmac('sha256',c.appSecret).update(raw).digest('hex');const h=new Headers({'x-hub-signature-256':sig});
    assert.ok(verifyWebhook(raw,h,c,now));assert.throws(()=>verifyWebhook(raw,h,{...c,appSecret:'different_secret'},now),/SIGNATURE_INVALID/);
  });
  it('caps streamed bodies even without a content-length header',async()=>{
    const request=new Request('https://example.test',{method:'POST',body:'0123456789'});await assert.rejects(()=>limitedBody(request,5),/BODY_TOO_LARGE/);
    assert.equal(await limitedBody(new Request('https://example.test',{method:'POST',body:raw})),raw);
  });
});
