import {z} from 'zod';
import {createHash,timingSafeEqual} from 'node:crypto';
import {withTenant} from '@/lib/db/tenant-transaction';
import {getCredentials,encryptionKey} from '@/lib/engines/connections';
import {providerSchema,EngineError} from '@/lib/engines/contracts';
import {verifyWebhook,limitedBody} from '@/lib/engines/signatures';
import {encryptValue} from '@/lib/security/encryption';

type Context={params:Promise<{tenantId:string;provider:string}>};
export async function POST(request:Request,context:Context){
  try{
    const params=await context.params;const tenantId=z.uuid().parse(params.tenantId);const provider=providerSchema.parse(params.provider);
    const credentials=await getCredentials(tenantId,provider);
    const raw=await limitedBody(request);let eventId=verifyWebhook(raw,request.headers,credentials);
    const data=JSON.parse(raw) as unknown;
    if(provider==='stripe')eventId=z.object({id:z.string().min(1).max(300)}).parse(data).id;
    const encrypted=encryptValue(raw,encryptionKey(),`webhook:${tenantId}:${provider}:${eventId}`);
    await withTenant(tenantId,db=>db.query('INSERT INTO webhook_receipts(tenant_id,provider,event_id,body_hash,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[tenantId,provider,eventId,createHash('sha256').update(raw).digest('hex'),JSON.stringify(encrypted)]));
    return Response.json({received:true});
  }catch(error){
    const bad=error instanceof z.ZodError||error instanceof SyntaxError||error instanceof EngineError;
    return Response.json({error:bad?'Invalid webhook':'Webhook temporarily unavailable'},{status:error instanceof EngineError&&error.code==='BODY_TOO_LARGE'?413:bad?400:503});
  }
}
export async function GET(request:Request,context:Context){
  try{
    const p=await context.params;if(p.provider!=='whatsapp')return new Response(null,{status:404});
    const credentials=await getCredentials(z.uuid().parse(p.tenantId),'whatsapp');if(credentials.provider!=='whatsapp')throw new Error();
    const query=new URL(request.url).searchParams;const a=Buffer.from(query.get('hub.verify_token')??'');const b=Buffer.from(credentials.verifyToken);
    if(query.get('hub.mode')!=='subscribe'||a.length!==b.length||!timingSafeEqual(a,b))return new Response(null,{status:403});
    return new Response(query.get('hub.challenge')??'',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});
  }catch{return new Response(null,{status:403});}
}
