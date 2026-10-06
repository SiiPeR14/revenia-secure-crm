import {withTenant} from '../db/tenant-transaction.ts';
import {recordAudit} from '../db/audit-repository.ts';
import type {Transport} from '../engines/providers.ts';
import {platformConfig,retrievePlatformSubscription,PlatformBillingError,type PlatformConfig,type SubscriptionBinding} from './stripe-platform.ts';

// Polling supplements the future webhook inbox. Holding a per-tenant advisory
// transaction lock across the bounded GET prevents stale concurrent snapshots.
export async function reconcileSubscription(tenantId:string,config:PlatformConfig,transport:Transport=fetch){
  return withTenant(tenantId,async db=>{
    const lock=(await db.query<{acquired:boolean}>('SELECT pg_try_advisory_xact_lock(hashtextextended($1,8)) acquired',[tenantId])).rows[0];
    if(!lock?.acquired)return 'busy';
    const binding=(await db.query<SubscriptionBinding&{error_code:string|null}>('SELECT customer_id,subscription_id,livemode,error_code FROM billing_bindings WHERE next_sync_at<=now()')).rows[0];
    if(!binding)return 'idle';
    let errorCode:string|undefined;
    let snapshot:Awaited<ReturnType<typeof retrievePlatformSubscription>>|undefined;
    try{snapshot=await retrievePlatformSubscription(config,binding,transport);}
    catch(error){errorCode=error instanceof PlatformBillingError?error.code:'PLATFORM_RECONCILE_FAILED';}
    if(snapshot){
      const previous=(await db.query<{plan_id:string;status:string;seats:number;cancel_at_period_end:boolean}>('SELECT plan_id,status,seats,cancel_at_period_end FROM billing_accounts')).rows[0];
      const applied=(await db.query<{ok:boolean}>('SELECT revenia_apply_subscription($1,$2,$3,$4,$5,$6,$7,$8) ok',
        [binding.customer_id,binding.subscription_id,binding.livemode,snapshot.plan,snapshot.status,snapshot.seats,snapshot.accessUntil,snapshot.cancelAtPeriodEnd])).rows[0]?.ok;
      if(!applied)throw new PlatformBillingError('PLATFORM_BINDING_CHANGED');
      await db.query('UPDATE billing_bindings SET last_synced_at=now(),next_sync_at=now()+interval \'5 minutes\',error_code=NULL');
      if(!previous||binding.error_code||previous.plan_id!==snapshot.plan||previous.status!==snapshot.status||previous.seats!==snapshot.seats||previous.cancel_at_period_end!==snapshot.cancelAtPeriodEnd)
        await recordAudit(db,{tenantId,userId:null},'billing.subscription_synced','subscription',binding.subscription_id,{plan:snapshot.plan,status:snapshot.status,seats:snapshot.seats});
      return 'synced';
    }
    // A malformed or mismatched snapshot cannot retain previous entitlements.
    // Temporary network errors do not extend access, which expires within 24h.
    if(['PLATFORM_SUBSCRIPTION_INVALID','PLATFORM_BINDING_INVALID','PLATFORM_HTTP_404'].includes(errorCode!)){
      await db.query('SELECT revenia_suspend_subscription($1,$2,$3)',[binding.customer_id,binding.subscription_id,binding.livemode]);
    }
    await db.query('UPDATE billing_bindings SET next_sync_at=now()+interval \'5 minutes\',error_code=$1',[errorCode]);
    if(binding.error_code!==errorCode)await recordAudit(db,{tenantId,userId:null},'billing.sync_failed','subscription',binding.subscription_id,{code:errorCode});
    return 'failed';
  });
}
export async function syncPlatformBilling(tenantId:string){
  if(process.env.PLATFORM_BILLING_ENABLED!=='true'||process.env.EXTERNAL_OPERATIONS_ENABLED!=='true')return 'disabled';
  return reconcileSubscription(tenantId,platformConfig());
}
