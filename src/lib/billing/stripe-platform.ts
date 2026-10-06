import {z} from 'zod';
import type {Transport} from '../engines/providers.ts';

export const planCode=z.enum(['starter','pro','business','enterprise']);
const cadence=z.enum(['month','year']);
const caps={starter:5,pro:20,business:50,enterprise:100000} as const;
const priceConfig=z.array(z.object({plan:planCode,interval:cadence,priceId:z.string().regex(/^price_[A-Za-z0-9]+$/)})).min(1).max(8);
export class PlatformBillingError extends Error {
  constructor(public code:string,public uncertain=false){super(code);}
}
export type PlatformConfig={key:string;origin:string;live:boolean;prices:z.infer<typeof priceConfig>};
// The platform uses its own operator configuration, never a tenant's Stripe key.
export function platformConfig(env:Record<string,string|undefined>=process.env):PlatformConfig{
  if(env.EXTERNAL_OPERATIONS_ENABLED!=='true'||env.PLATFORM_BILLING_ENABLED!=='true')throw new PlatformBillingError('PLATFORM_BILLING_DISABLED');
  try{
    const key=z.string().regex(/^sk_(test|live)_[A-Za-z0-9]+$/).min(20).parse(env.PLATFORM_STRIPE_SECRET_KEY);
    const live=key.startsWith('sk_live_');
    if(env.PLATFORM_BILLING_MODE!==(live?'live':'test'))throw new Error();
    if(live&&env.PLATFORM_BILLING_ALLOW_LIVE!=='true')throw new Error();
    const origin=new URL(env.APP_URL??'');
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error();
    const prices=priceConfig.parse(JSON.parse(env.PLATFORM_STRIPE_PRICES??''));
    if(new Set(prices.map(p=>`${p.plan}:${p.interval}`)).size!==prices.length||new Set(prices.map(p=>p.priceId)).size!==prices.length)throw new Error();
    return {key,live,origin:origin.origin,prices};
  }catch{throw new PlatformBillingError('PLATFORM_BILLING_CONFIG_INVALID');}
}
const version='2025-03-31.basil';
async function request(config:PlatformConfig,path:string,transport:Transport,body?:URLSearchParams,idempotency?:string):Promise<unknown>{
  let response:Response;
  try{
    response=await transport(`https://api.stripe.com/v1/${path}`,{
      method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${config.key}`,'Stripe-Version':version,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},
      ...(body?{body:body.toString()}:{}),
    });
  }catch{throw new PlatformBillingError('PLATFORM_NETWORK_UNCERTAIN',Boolean(body));}
  if(!response.ok)throw new PlatformBillingError(`PLATFORM_HTTP_${response.status}`,Boolean(body)&&(response.status>=500||response.status===409));
  try{return await response.json();}catch{throw new PlatformBillingError('PLATFORM_RESPONSE_INVALID',Boolean(body));}
}
function hostedUrl(raw:string,host:string){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||url.port)throw new Error();
  return url.href;
}
const checkoutInput=z.object({tenantId:z.uuid(),operationId:z.uuid(),customerId:z.string().regex(/^cus_[A-Za-z0-9]+$/),plan:planCode,interval:cadence,seats:z.number().int().positive().max(100000)});
export async function createPlatformCheckout(config:PlatformConfig,input:z.input<typeof checkoutInput>,transport:Transport=fetch){
  const p=checkoutInput.parse(input);
  const selection=config.prices.find(price=>price.plan===p.plan&&price.interval===p.interval);
  if(!selection||p.seats>caps[p.plan])throw new PlatformBillingError('PLATFORM_PLAN_INVALID');
  // Confirm that an operator-configured price is an active, licensed EUR price.
  const raw=await request(config,`prices/${selection.priceId}`,transport);
  try{
    const price=z.object({id:z.string(),active:z.literal(true),livemode:z.boolean(),currency:z.literal('eur'),unit_amount:z.number().int().positive(),billing_scheme:z.literal('per_unit'),recurring:z.object({interval:cadence,interval_count:z.literal(1),usage_type:z.literal('licensed')})}).parse(raw);
    if(price.id!==selection.priceId||price.livemode!==config.live||price.recurring.interval!==p.interval)throw new Error();
  }catch{throw new PlatformBillingError('PLATFORM_PRICE_INVALID');}
  const form=new URLSearchParams({mode:'subscription',customer:p.customerId,client_reference_id:p.operationId,
    'line_items[0][price]':selection.priceId,'line_items[0][quantity]':String(p.seats),
    success_url:`${config.origin}/configuracion?tab=plan&checkout=recibido`,cancel_url:`${config.origin}/configuracion?tab=plan&checkout=cancelado`,
    'metadata[tenant_id]':p.tenantId,'metadata[operation_id]':p.operationId,
    'subscription_data[metadata][tenant_id]':p.tenantId,'subscription_data[metadata][operation_id]':p.operationId,
  });
  const result=await request(config,'checkout/sessions',transport,form,`revenia-subscription:${p.operationId}`);
  try{
    const session=z.object({id:z.string().regex(/^cs_/),url:z.url(),livemode:z.boolean()}).parse(result);
    if(session.livemode!==config.live)throw new Error();
    return {id:session.id,url:hostedUrl(session.url,'checkout.stripe.com')};
  }catch{throw new PlatformBillingError('PLATFORM_CHECKOUT_RESPONSE_INVALID',true);}
}
export async function createPlatformPortal(config:PlatformConfig,customerId:string,operationId:string,transport:Transport=fetch){
  z.string().regex(/^cus_[A-Za-z0-9]+$/).parse(customerId);z.uuid().parse(operationId);
  const raw=await request(config,'billing_portal/sessions',transport,new URLSearchParams({customer:customerId,return_url:`${config.origin}/configuracion?tab=plan`}),`revenia-portal:${operationId}`);
  try{const result=z.object({id:z.string().regex(/^bps_/),url:z.url()}).parse(raw);return {id:result.id,url:hostedUrl(result.url,'billing.stripe.com')};}
  catch{throw new PlatformBillingError('PLATFORM_PORTAL_RESPONSE_INVALID',true);}
}

export type SubscriptionBinding={customer_id:string;subscription_id:string;livemode:boolean};
const subscriptionStatus=z.enum(['trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired','paused']);
const timestamp=z.number().int().positive().max(253402300799);
export async function retrievePlatformSubscription(config:PlatformConfig,binding:SubscriptionBinding,transport:Transport=fetch){
  if(!/^sub_[A-Za-z0-9]+$/.test(binding.subscription_id)||binding.livemode!==config.live)throw new PlatformBillingError('PLATFORM_BINDING_INVALID');
  const raw=await request(config,`subscriptions/${binding.subscription_id}`,transport);
  try{
    const s=z.object({id:z.string(),customer:z.string(),livemode:z.boolean(),status:subscriptionStatus,
      cancel_at_period_end:z.boolean(),trial_end:timestamp.nullable(),pause_collection:z.unknown(),
      items:z.object({has_more:z.literal(false),data:z.array(z.object({quantity:z.number().int().positive().max(100000),
        current_period_end:timestamp,price:z.object({id:z.string(),currency:z.literal('eur'),livemode:z.boolean(),
          billing_scheme:z.literal('per_unit'),recurring:z.object({interval:cadence,interval_count:z.literal(1),usage_type:z.literal('licensed')})})})).length(1)})}).parse(raw);
    if(s.id!==binding.subscription_id||s.customer!==binding.customer_id||s.livemode!==binding.livemode)throw new Error();
    const item=s.items.data[0]!;
    const price=config.prices.find(p=>p.priceId===item.price.id&&p.interval===item.price.recurring.interval);
    if(!price||item.price.livemode!==config.live||item.quantity>caps[price.plan]||s.pause_collection===undefined)throw new Error();
    if(s.status==='trialing'&&!s.trial_end)throw new Error();
    const until=s.status==='trialing'?Math.min(item.current_period_end,s.trial_end!):item.current_period_end;
    return {plan:price.plan,status:s.pause_collection!==null?'paused':s.status,seats:item.quantity,accessUntil:new Date(until*1000),cancelAtPeriodEnd:s.cancel_at_period_end};
  }catch{throw new PlatformBillingError('PLATFORM_SUBSCRIPTION_INVALID');}
}

export type NotificationConfig={secret:string;live:boolean};
export function notificationConfig(env:Record<string,string|undefined>=process.env):NotificationConfig{
  if(env.PLATFORM_BILLING_ENABLED!=='true')throw new PlatformBillingError('PLATFORM_BILLING_DISABLED');
  const live=env.PLATFORM_BILLING_MODE==='live';
  if(!['live','test'].includes(env.PLATFORM_BILLING_MODE??'')||live&&env.PLATFORM_BILLING_ALLOW_LIVE!=='true')throw new PlatformBillingError('PLATFORM_BILLING_CONFIG_INVALID');
  const secret=z.string().regex(/^whsec_[A-Za-z0-9]+$/).min(20).parse(env.PLATFORM_STRIPE_WEBHOOK_SECRET);
  return {secret,live};
}
