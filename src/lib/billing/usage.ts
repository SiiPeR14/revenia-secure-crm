import type {TenantDatabase} from '../db/tenant-transaction.ts';
import {withTenant} from '../db/tenant-transaction.ts';
import {EngineError,type Job} from '../engines/contracts.ts';

export function billingRequired(env:Record<string,string|undefined>=process.env){
  return env.NODE_ENV==='production'||env.BILLING_REQUIRED==='true';
}
export async function reserveJobUsage(db:TenantDatabase,job:Pick<Job,'id'|'lease_token'>,required=billingRequired()){
  const result=(await db.query<{result:string}>('SELECT revenia_reserve_job_usage($1,$2,$3) result',[job.id,job.lease_token,required])).rows[0]?.result;
  if(!result||!['reserved','existing','unconfigured'].includes(result))throw new EngineError(result??'BILLING_RESERVATION_FAILED');
  return result;
}
export type BillingOverview={
  plan_id:string;name:string;status:string;seats:number;max_members:number|null;
  monthly_messages:number|null;ai_enabled:boolean;access_until:Date;cancel_at_period_end:boolean;access_allowed:boolean;members:number;
};
export async function billingOverview(tenantId:string){
  return withTenant(tenantId,async db=>{
    const account=(await db.query<BillingOverview>(`SELECT a.plan_id,p.name,a.status,a.seats,p.max_members,p.monthly_messages,p.ai_enabled,a.access_until,a.cancel_at_period_end,
      revenia_billing_member_count() members,
      (a.status IN ('active','trialing') AND a.access_until>now() AND (p.max_members IS NULL OR a.seats<=p.max_members)
       AND revenia_billing_member_count()<=a.seats) access_allowed
      FROM billing_accounts a JOIN billing_plans p ON p.id=a.plan_id`)).rows[0]??null;
    const usage=(await db.query<{metric:string;used:number}>(`SELECT metric,count(*)::integer used FROM billing_usage
      WHERE usage_month=date_trunc('month',now() AT TIME ZONE 'UTC')::date GROUP BY metric`)).rows;
    return {account,usage,required:billingRequired()};
  });
}
