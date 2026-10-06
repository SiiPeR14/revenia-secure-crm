import {z} from 'zod';
import {database} from '../db/pool.ts';
import {withTenant} from '../db/tenant-transaction.ts';
import {verifyWebhook} from '../engines/signatures.ts';
import {PlatformBillingError,type NotificationConfig} from './stripe-platform.ts';
export {notificationConfig} from './stripe-platform.ts';

const id=z.string().regex(/^sub_[A-Za-z0-9]+$/);
const customer=z.string().regex(/^cus_[A-Za-z0-9]+$/);
export async function receivePlatformNotification(raw:string,headers:Headers,config:NotificationConfig){
  const hash=verifyWebhook(raw,headers,{provider:'stripe',apiKey:'unused-server-webhook',webhookSecret:config.secret});
  const event=z.object({id:z.string().regex(/^evt_[A-Za-z0-9]+$/).max(300),type:z.string().max(100),livemode:z.boolean(),data:z.object({object:z.unknown()})}).parse(JSON.parse(raw));
  if(event.livemode!==config.live)throw new PlatformBillingError('PLATFORM_EVENT_MODE_INVALID');
  let target:{customer:string;subscription:string};
  if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed'].includes(event.type)){
    const s=z.object({id,customer}).parse(event.data.object);target={customer:s.customer,subscription:s.id};
  }else if(['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type)){
    const invoice=z.object({customer,parent:z.object({type:z.string(),subscription_details:z.object({subscription:id}).nullable().optional()}).nullable()}).parse(event.data.object);
    if(invoice.parent?.type!=='subscription_details'||!invoice.parent.subscription_details)return 'ignored';
    target={customer:invoice.customer,subscription:invoice.parent.subscription_details.subscription};
  }else return 'ignored';
  const tenant=(await database.query<{tenant_id:string|null}>('SELECT revenia_platform_webhook_target($1,$2,$3) tenant_id',[target.customer,target.subscription,event.livemode])).rows[0]?.tenant_id;
  if(!tenant)return 'ignored';
  return withTenant(tenant,async db=>{
    const inserted=await db.query('INSERT INTO billing_event_receipts(tenant_id,event_id,event_type,body_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id',[tenant,event.id,event.type,hash]);
    if(!inserted.rowCount){
      const existing=(await db.query<{body_hash:string}>('SELECT body_hash FROM billing_event_receipts WHERE event_id=$1',[event.id])).rows[0];
      if(existing?.body_hash!==hash)throw new PlatformBillingError('PLATFORM_EVENT_CONFLICT');
      return 'duplicate';
    }
    // Persist a wake-up only. Old or replayed event state never grants access;
    // the worker fetches the latest subscription for the pre-bound customer.
    await db.query('UPDATE billing_bindings SET next_sync_at=least(next_sync_at,now())');
    return 'queued';
  });
}
