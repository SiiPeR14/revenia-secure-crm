import {z} from 'zod';
import {withTenant,type TenantDatabase} from '../db/tenant-transaction.ts';
import {decryptValue,encryptValue} from '../security/encryption.ts';
import {encryptionKey,getCredentials,externalEnabled} from './connections.ts';
import {EngineError,type Credentials,type Provider} from './contracts.ts';
import {recordAudit} from '../db/audit-repository.ts';

const id=z.string().min(1).max(300);
const stripeEvent=z.object({id,type:z.string(),created:z.number().int().positive(),data:z.object({object:z.object({id,metadata:z.record(z.string(),z.string()).nullish(),amount_total:z.number().int().nullish(),currency:z.string().nullish(),payment_status:z.string().optional()})})});
export async function applyStripeEvent(db:TenantDatabase,tenantId:string,payload:unknown){
  const event=stripeEvent.parse(payload);const session=event.data.object;
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type))return true;
  if(session.metadata?.tenant_id!==tenantId)return true;
  const jobId=z.uuid().safeParse(session.metadata.job_id);if(!jobId.success)return true;
  const link=(await db.query<{id:string;invoice_id:string;amount_cents:string;currency:string;state:string;provider_session_id:string|null;provider_event_at:Date|null}>(`SELECT * FROM checkout_links WHERE job_id=$1 FOR UPDATE`,[jobId.data])).rows[0];
  if(!link)return false;
  if(link.provider_session_id&&link.provider_session_id!==session.id)throw new EngineError('CHECKOUT_ID_MISMATCH');
  if(session.metadata.invoice_id!==link.invoice_id)throw new EngineError('CHECKOUT_INVOICE_MISMATCH');
  if(event.type==='checkout.session.expired'){
    if(link.state!=='paid')await db.query("UPDATE checkout_links SET state='expired',provider_session_id=$1,provider_event_at=to_timestamp($2) WHERE id=$3",[session.id,event.created,link.id]);
    return true;
  }
  if(session.payment_status!=='paid')return true;
  if(session.amount_total!==Number(link.amount_cents)||session.currency!==link.currency)throw new EngineError('CHECKOUT_AMOUNT_MISMATCH');
  if(link.state==='paid')return true;
  const invoice=(await db.query<{cents:string;currency:string}>('SELECT (amount*100)::bigint::text cents,currency FROM invoices WHERE id=$1 FOR UPDATE',[link.invoice_id])).rows[0];
  if(!invoice||invoice.cents!==String(link.amount_cents)||invoice.currency!==link.currency)throw new EngineError('INVOICE_CHANGED_AFTER_CHECKOUT');
  await db.query("UPDATE checkout_links SET state='paid',provider_session_id=$1,provider_event_at=to_timestamp($2) WHERE id=$3",[session.id,event.created,link.id]);
  await db.query("UPDATE invoices SET status='Pagada',updated_at=now() WHERE id=$1",[link.invoice_id]);
  await db.query("INSERT INTO payments(tenant_id,invoice_id,reference,amount,status,paid_at) VALUES($1,$2,$3,$4,'Completado',to_timestamp($5)) ON CONFLICT(tenant_id,reference) DO NOTHING",[tenantId,link.invoice_id,`stripe:${jobId.data}`,Number(link.amount_cents)/100,event.created]);
  await db.query("INSERT INTO notifications(tenant_id,title,detail,href) VALUES($1,'Pago confirmado por Stripe','Se ha conciliado el cobro con la factura.','/pagos')",[tenantId]);
  return true;
}
const statusRank:Record<string,number>={draft:0,queued:1,accepted:2,delivered:3,read:4,failed:5,uncertain:1};
async function delivery(db:TenantDatabase,channel:string,providerId:string,state:string,at:Date){
  const message=(await db.query<{id:string;delivery_status:string;provider_event_at:Date|null;client_id:string|null;sender_address:string|null}>('SELECT id,delivery_status,provider_event_at,client_id,sender_address FROM conversations WHERE channel=$1 AND provider_message_id=$2 FOR UPDATE',[channel,providerId])).rows[0];
  if(!message)return false;
  if((statusRank[state]??0)>(statusRank[message.delivery_status]??0))await db.query('UPDATE conversations SET delivery_status=$1,provider_event_at=$2 WHERE id=$3',[state,at,message.id]);
  return true;
}
async function suppress(db:TenantDatabase,tenantId:string,channel:string,address:string,reason:string){
  await db.query('INSERT INTO message_suppressions(tenant_id,channel,address,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tenantId,channel,address,reason]);
}
const resendEvent=z.object({type:z.string(),created_at:z.string(),data:z.object({email_id:id,from:z.string().optional(),to:z.array(z.string()).optional(),subject:z.string().optional()})});
async function applyResendEvent(db:TenantDatabase,tenantId:string,raw:unknown,credentials:Credentials){
  if(credentials.provider!=='resend')throw new EngineError('PROVIDER_MISMATCH');
  const event=resendEvent.parse(raw);const at=new Date(event.created_at);if(!Number.isFinite(at.getTime()))throw new EngineError('INVALID_EVENT_DATE');
  if(event.type==='email.received'){
    if(!credentials.inboundAddress||!event.data.to?.some(address=>address.toLowerCase()===credentials.inboundAddress?.toLowerCase()))return true;
    if((await db.query("SELECT id FROM conversations WHERE channel='Email' AND provider_message_id=$1",[event.data.email_id])).rowCount)return true;
    if(!externalEnabled())return false;
    const response=await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(event.data.email_id)}`,{headers:{Authorization:`Bearer ${credentials.apiKey}`},signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok)throw new EngineError('INBOUND_EMAIL_FETCH_FAILED');
    const received=z.object({text:z.string().nullable().optional(),subject:z.string().optional()}).parse(await response.json());
    const from=(event.data.from??'').match(/<([^>]+)>/)?.[1]??event.data.from??'';const address=from.toLowerCase();
    const client=(await db.query<{id:string}>('SELECT id FROM clients WHERE email=$1',[address])).rows[0];
    const body=(received.text||'Mensaje sin texto plano; consultar en el proveedor.').slice(0,4000);
    await db.query("INSERT INTO conversations(tenant_id,client_id,channel,direction,body,subject,provider_message_id,delivery_status,sender_address) VALUES($1,$2,'Email','Entrada',$3,$4,$5,'delivered',$6) ON CONFLICT DO NOTHING",[tenantId,client?.id??null,body,(received.subject??event.data.subject??'Mensaje recibido').slice(0,200),event.data.email_id,address]);
    if(/^(stop|baja|cancelar)$/i.test(body.trim()))await suppress(db,tenantId,'Email',address,'recipient_request');
    return true;
  }
  const states:Record<string,string>={'email.sent':'accepted','email.delivered':'delivered','email.opened':'read','email.bounced':'failed','email.complained':'failed','email.failed':'failed'};
  if(!states[event.type])return true;
  if(event.type==='email.bounced'||event.type==='email.complained')for(const to of event.data.to??[])await suppress(db,tenantId,'Email',to.toLowerCase(),event.type);
  return delivery(db,'Email',event.data.email_id,states[event.type]!,at);
}
const metaEvent=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({changes:z.array(z.object({value:z.object({metadata:z.object({phone_number_id:id}),messages:z.array(z.object({id,from:z.string().regex(/^\d{7,15}$/),timestamp:z.string(),type:z.string(),text:z.object({body:z.string()}).optional()})).optional(),statuses:z.array(z.object({id,status:z.string(),timestamp:z.string()})).optional()})}))}))});
async function applyMetaEvent(db:TenantDatabase,tenantId:string,raw:unknown,credentials:Credentials){
  if(credentials.provider!=='whatsapp')throw new EngineError('PROVIDER_MISMATCH');
  const event=metaEvent.parse(raw);let complete=true;
  for(const entry of event.entry)for(const change of entry.changes){
    if(change.value.metadata.phone_number_id!==credentials.phoneId)continue;
    for(const message of change.value.messages??[]){
      const client=(await db.query<{id:string}>("SELECT id FROM clients WHERE regexp_replace(phone,'[^0-9]','','g')=$1 ORDER BY id LIMIT 1",[message.from])).rows[0];
      const body=(message.text?.body??`Mensaje ${message.type}; consultar en WhatsApp.`).slice(0,4000)||'Mensaje vacío';
      await db.query("INSERT INTO conversations(tenant_id,client_id,channel,direction,body,provider_message_id,delivery_status,sender_address) VALUES($1,$2,'WhatsApp','Entrada',$3,$4,'delivered',$5) ON CONFLICT DO NOTHING",[tenantId,client?.id??null,body,message.id,message.from]);
      if(/^(stop|baja|cancelar)$/i.test(body.trim()))await suppress(db,tenantId,'WhatsApp',message.from,'recipient_request');
    }
    for(const status of change.value.statuses??[]){
      const state=({sent:'accepted',delivered:'delivered',read:'read',failed:'failed'} as Record<string,string>)[status.status];
      const at=new Date(Number(status.timestamp)*1000);
      if(state&&Number.isFinite(at.getTime()))complete=(await delivery(db,'WhatsApp',status.id,state,at))&&complete;
    }
  }
  return complete;
}
async function deferReceipt(db:TenantDatabase,provider:Provider,eventId:string,code:string){
  await db.query(`UPDATE webhook_receipts SET attempts=attempts+1,error_code=$1,
    available_at=now()+(least(3600,30*power(2,least(attempts,7)))*interval '1 second'),
    quarantined_at=CASE WHEN attempts>=19 OR received_at<now()-interval '7 days' THEN now() ELSE NULL END
    WHERE provider=$2 AND event_id=$3 AND processed_at IS NULL AND quarantined_at IS NULL`,[code,provider,eventId]);
}
export async function processWebhookInbox(tenantId:string,shouldStop:()=>boolean=()=>false,onProgress:()=>Promise<void>=async()=>{}){
  const receipts=await withTenant(tenantId,async db=>(await db.query<{provider:Provider;event_id:string}>('SELECT provider,event_id FROM webhook_receipts WHERE processed_at IS NULL AND quarantined_at IS NULL AND available_at<=now() ORDER BY available_at,received_at LIMIT 50')).rows);
  for(const receipt of receipts){
    if(shouldStop())break;
    try{
      const credentials=await getCredentials(tenantId,receipt.provider);
      await withTenant(tenantId,async db=>{
        const row=(await db.query<{payload:ReturnType<typeof encryptValue>}>("SELECT payload FROM webhook_receipts WHERE provider=$1 AND event_id=$2 AND processed_at IS NULL AND quarantined_at IS NULL AND available_at<=now() FOR UPDATE SKIP LOCKED",[receipt.provider,receipt.event_id])).rows[0];
        if(!row?.payload)return;
        const raw=JSON.parse(decryptValue(row.payload,encryptionKey(),`webhook:${tenantId}:${receipt.provider}:${receipt.event_id}`)) as unknown;
        const done=receipt.provider==='stripe'?await applyStripeEvent(db,tenantId,raw):receipt.provider==='resend'?await applyResendEvent(db,tenantId,raw,credentials):receipt.provider==='whatsapp'?await applyMetaEvent(db,tenantId,raw,credentials):true;
        if(done){
          await db.query('UPDATE webhook_receipts SET processed_at=now(),payload=NULL,error_code=NULL WHERE provider=$1 AND event_id=$2',[receipt.provider,receipt.event_id]);
          await recordAudit(db,{tenantId,userId:null},'webhook.processed',receipt.provider,receipt.event_id.slice(0,160));
        }else await deferReceipt(db,receipt.provider,receipt.event_id,'EVENT_AWAITING_MATCH');
      });
    }catch(error){await withTenant(tenantId,db=>deferReceipt(db,receipt.provider,receipt.event_id,error instanceof EngineError?error.code:'EVENT_PROCESSING_FAILED'));}
    await onProgress();
  }
}
