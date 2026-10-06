import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {EngineError,type Credentials} from './contracts.ts';

function equals(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function verifyWebhook(raw:string,headers:Headers,credentials:Credentials,now=Date.now()):string{
  if(credentials.provider==='stripe'){
    const parts=(headers.get('stripe-signature')??'').split(',');const timestamp=parts.find(p=>p.startsWith('t='))?.slice(2)??'';
    if(!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new EngineError('SIGNATURE_EXPIRED');
    const expected=createHmac('sha256',credentials.webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
    if(!parts.filter(p=>p.startsWith('v1=')).some(p=>equals(p.slice(3),expected)))throw new EngineError('SIGNATURE_INVALID');
    return createHash('sha256').update(raw).digest('hex');
  }
  if(credentials.provider==='resend'){
    const id=headers.get('svix-id')??'';const timestamp=headers.get('svix-timestamp')??'';
    if(!id||id.length>300||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)throw new EngineError('SIGNATURE_EXPIRED');
    const expected=createHmac('sha256',Buffer.from(credentials.webhookSecret.replace(/^whsec_/,''),'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
    if(!(headers.get('svix-signature')??'').split(' ').some(value=>value.startsWith('v1,')&&equals(value.slice(3),expected)))throw new EngineError('SIGNATURE_INVALID');
    return id;
  }
  if(credentials.provider==='whatsapp'){
    const expected='sha256='+createHmac('sha256',credentials.appSecret).update(raw).digest('hex');
    if(!equals(headers.get('x-hub-signature-256')??'',expected))throw new EngineError('SIGNATURE_INVALID');
    return createHash('sha256').update(raw).digest('hex');
  }
  throw new EngineError('PROVIDER_WEBHOOK_UNSUPPORTED');
}
export async function limitedBody(request:Request,max=262144){
  if(Number(request.headers.get('content-length'))>max)throw new EngineError('BODY_TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw new EngineError('BODY_EMPTY');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new EngineError('BODY_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
