import { withTenant, type TenantDatabase } from '../db/tenant-transaction.ts';
import { recordAudit } from '../db/audit-repository.ts';
import { EngineError,payloadSchemas,providerFor,retryAllowed,retryDelay,taskPayload,emailPayload,whatsappPayload,type Job,type Kind } from './contracts.ts';
import { externalEnabled,getCredentials } from './connections.ts';
import { dispatchProvider,type Transport } from './providers.ts';
import {checkInvoiceMessage} from './invoice-messages.ts';
import {reserveJobUsage} from '../billing/usage.ts';

export async function enqueue(db:TenantDatabase,tenantId:string,actorId:string,kind:Kind,dedupe:string,payload:unknown){
  const valid=payloadSchemas[kind].parse(payload);
  const version=providerFor(kind)?(await db.query<{version:string}>('SELECT version FROM provider_connections WHERE provider=$1 AND enabled',[providerFor(kind)])).rows[0]?.version:null;
  const result=await db.query<{id:string}>(`INSERT INTO engine_jobs(tenant_id,actor_id,kind,dedupe_key,payload,connection_version) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(tenant_id,dedupe_key) DO NOTHING RETURNING id`,[tenantId,actorId,kind,dedupe,JSON.stringify(valid),version??null]);
  return result.rows[0]?.id ?? null;
}
export async function claimJob(tenantId:string,includeExternal=true){
  return withTenant(tenantId,async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))",[tenantId]);
    await db.query(`UPDATE engine_jobs SET status=CASE WHEN kind='task' THEN 'queued' ELSE 'uncertain' END,error_code='WORKER_INTERRUPTED',lease_until=NULL,updated_at=now() WHERE status='running' AND lease_until<now()`);
    await db.query("UPDATE conversations SET delivery_status='uncertain' WHERE delivery_status='queued' AND engine_job_id IN (SELECT id FROM engine_jobs WHERE status='uncertain')");
    const row=(await db.query<Job>(`UPDATE engine_jobs SET status='running',attempts=attempts+1,dispatch_started_at=NULL,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid(),first_attempt_at=coalesce(first_attempt_at,now()),updated_at=now()
      WHERE id=(SELECT id FROM engine_jobs j WHERE status='queued' AND available_at<=now()
        AND (kind='task' OR $1) AND (kind='task' OR (SELECT count(*) FROM engine_jobs x WHERE x.first_attempt_at>now()-interval '1 day' AND x.kind=j.kind)<$2 OR first_attempt_at IS NOT NULL)
        ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[includeExternal&&externalEnabled(),Math.max(1,Math.min(1000,Number(process.env.ENGINE_DAILY_LIMIT)||100))])).rows[0];
    return row;
  });
}
async function currentPermission(db:TenantDatabase,job:Job){
  const row=(await db.query<{allowed:boolean}>('SELECT revenia_engine_authorized($1,$2) allowed',[job.actor_id,job.kind])).rows[0];
  if(!row?.allowed)throw new EngineError('ACTOR_NOT_AUTHORIZED');
}
async function checkContact(db:TenantDatabase,job:Job){
  if(job.kind!=='email'&&job.kind!=='whatsapp')return;
  const p=job.kind==='email'?emailPayload.parse(job.payload):whatsappPayload.parse(job.payload);
  await checkInvoiceMessage(db,p.conversationId,p.clientId);
  const channel=job.kind==='email'?'Email':'WhatsApp';
  const client=(await db.query<{email:string;phone:string}>(`SELECT c.email,c.phone FROM clients c JOIN contact_permissions p ON p.client_id=c.id AND p.tenant_id=c.tenant_id
    WHERE c.id=$1 AND p.channel=$2 AND p.allowed`,[p.clientId,channel])).rows[0];
  if(!client)throw new EngineError('CONTACT_PERMISSION_MISSING');
  const normalized=channel==='Email'?p.to.toLowerCase():p.to.replace(/^\+/,'');
  if((await db.query('SELECT 1 FROM message_suppressions WHERE channel=$1 AND address=$2',[channel,normalized])).rowCount)throw new EngineError('CONTACT_SUPPRESSED');
  if((job.kind==='email'?client.email:client.phone.replace(/[\s()-]/g,'').replace(/^\+/,''))!==(job.kind==='email'?p.to:p.to.replace(/^\+/,'')))throw new EngineError('RECIPIENT_CHANGED');
}
export async function processJob(job:Job,transport?:Transport){
  let sent=false;
  try{
    await withTenant(job.tenant_id,async db=>{await currentPermission(db,job);await checkContact(db,job);});
    let result:Record<string,unknown>={};
    if(job.kind!=='task'){
      if(!externalEnabled())throw new EngineError('EXTERNAL_OPERATIONS_DISABLED');
      if(job.attempts>1&&job.first_attempt_at&&Date.now()-job.first_attempt_at.getTime()>6*60*60*1000)throw new EngineError('RETRY_WINDOW_EXPIRED',false,true);
      if(!job.connection_version)throw new EngineError('CONNECTION_SNAPSHOT_MISSING');
      const credentials=await getCredentials(job.tenant_id,providerFor(job.kind)!,true,job.connection_version);
      const dispatch=await withTenant(job.tenant_id,async db=>{
        await currentPermission(db,job);
        await checkContact(db,job);
        await reserveJobUsage(db,job);
        return db.query("UPDATE engine_jobs SET dispatch_started_at=now() WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_until>now() AND dispatch_started_at IS NULL RETURNING id",[job.id,job.lease_token]);
      });
      if(!dispatch.rowCount)return;
      try { result=await dispatchProvider(job,credentials,transport); }
      catch(error){if(error instanceof EngineError)throw error;throw new EngineError('PROVIDER_RESPONSE_UNCERTAIN',false,true);}
      sent=true;
    }
    await withTenant(job.tenant_id,async db=>{
      if(job.kind==='task')await reserveJobUsage(db,job);
      const locked=(await db.query('SELECT id FROM engine_jobs WHERE id=$1 AND status=\'running\' AND lease_token=$2 FOR UPDATE',[job.id,job.lease_token])).rowCount;
      if(!locked)throw new EngineError('LEASE_LOST',false,sent);
      if(job.kind==='task'){
        await currentPermission(db,job);
        const p=taskPayload.parse(job.payload);
        const rule=(await db.query<{delay_days:number;trigger_type:string}>('SELECT delay_days,trigger_type FROM automations WHERE id=$1 AND enabled AND trigger_type IS NOT NULL FOR SHARE',[p.ruleId])).rows[0];
        if(!rule||rule.trigger_type!==(p.source==='invoice'?'invoice_overdue':`${p.source}_inactive`))throw new EngineError('RULE_OR_SOURCE_INACTIVE');
        const source=await db.query<{updated_at:Date;client_id:string|null;number?:string}>(p.source==='invoice'?"SELECT updated_at,NULL::uuid AS client_id,number FROM invoices WHERE id=$1 AND status IN ('Pendiente','Vencida') AND amount>0 AND due_at<=(now() AT TIME ZONE 'UTC')::date-$2::integer FOR SHARE":p.source==='quote'?"SELECT updated_at,client_id FROM quotes WHERE id=$1 AND status IN ('Enviado','Visto','Seguimiento') AND updated_at<now()-($2*interval '1 day') FOR SHARE":"SELECT updated_at,client_id FROM opportunities WHERE id=$1 AND stage NOT IN ('Ganada','Perdida') AND updated_at<now()-($2*interval '1 day') FOR SHARE",[p.sourceId,rule.delay_days]);
        if(!source.rowCount)throw new EngineError('RULE_OR_SOURCE_INACTIVE');
        if(p.sourceUpdatedAt&&source.rows[0]!.updated_at.toISOString()!==p.sourceUpdatedAt)throw new EngineError('SOURCE_CHANGED');
        if(source.rows[0]!.client_id!==p.clientId)throw new EngineError('SOURCE_CHANGED');
        const title=p.source==='invoice'?`${p.title} · Factura ${source.rows[0]!.number}`.slice(0,200):p.title;
        const task=(await db.query<{id:string}>("INSERT INTO tasks(tenant_id,client_id,title,channel,due_at,invoice_id) VALUES($1,$2,$3,'Tarea',now(),$4) RETURNING id",[job.tenant_id,p.clientId,title,p.source==='invoice'?p.sourceId:null])).rows[0]!;
        result={taskId:task.id};
        await db.query('UPDATE automations SET executions=executions+1 WHERE id=$1',[p.ruleId]);
        await db.query("INSERT INTO notifications(tenant_id,title,detail,href) VALUES($1,'Seguimiento programado',$2,'/tareas')",[job.tenant_id,p.title]);
      }
      if(job.kind==='email'||job.kind==='whatsapp')await db.query("UPDATE conversations SET delivery_status='accepted',provider_message_id=$1 WHERE engine_job_id=$2 AND delivery_status='queued'",[result.providerId,job.id]);
      if(job.kind==='checkout')await db.query("UPDATE checkout_links SET provider_session_id=$1,checkout_url=$2,state='open' WHERE job_id=$3 AND state='pending'",[result.providerId,result.url,job.id]);
      await db.query("UPDATE engine_jobs SET status='succeeded',result=$1,error_code=NULL,lease_until=NULL,updated_at=now() WHERE id=$2",[JSON.stringify(result),job.id]);
      await recordAudit(db,{tenantId:job.tenant_id,userId:job.actor_id},'engine.succeeded',job.kind,job.id);
    });
  }catch(error){
    const known=error instanceof EngineError?error:new EngineError(sent?'RESULT_PERSISTENCE_UNCERTAIN':'ENGINE_VALIDATION_FAILED',false,sent);
    const retry=!sent&&known.retryable&&retryAllowed(job);
    const status=retry?'queued':known.uncertain||(job.kind!=='task'&&job.attempts>1)?'uncertain':'failed';
    await withTenant(job.tenant_id,async db=>{
      const row=await db.query("UPDATE engine_jobs SET status=$1,error_code=$2,lease_until=NULL,available_at=now()+($3*interval '1 second'),updated_at=now() WHERE id=$4 AND status='running' AND lease_token=$5 RETURNING id",[status,known.code,retryDelay(job.attempts),job.id,job.lease_token]);
      if(!row.rowCount)return;
      if(!retry)await db.query("UPDATE conversations SET delivery_status=$1 WHERE engine_job_id=$2 AND delivery_status='queued'",[status==='uncertain'?'uncertain':'failed',job.id]);
      if(status==='failed')await db.query("UPDATE checkout_links SET state='failed' WHERE job_id=$1 AND state='pending'",[job.id]);
      await recordAudit(db,{tenantId:job.tenant_id,userId:job.actor_id},`engine.${status}`,job.kind,job.id,{code:known.code});
    });
  }
}
export async function scheduleRules(tenantId:string){
  return withTenant(tenantId,async db=>{
    const rules=(await db.query<{id:string;actor_id:string;trigger_type:string;delay_days:number;name:string}>('SELECT id,actor_id,trigger_type,delay_days,name FROM automations WHERE enabled AND trigger_type IS NOT NULL AND actor_id IS NOT NULL')).rows;
    let scheduled=0;
    for(const rule of rules){
      if(!['quote_inactive','opportunity_inactive','invoice_overdue'].includes(rule.trigger_type))continue;
      const source=rule.trigger_type==='invoice_overdue'?'invoice':rule.trigger_type==='quote_inactive'?'quote':'opportunity';
      // The table and predicate are chosen from fixed literals, never user input.
      const table=source==='invoice'?'invoices':source==='quote'?'quotes':'opportunities';
      const predicate=source==='invoice'?"s.status IN ('Pendiente','Vencida') AND s.amount>0":source==='quote'?"s.status IN ('Enviado','Visto','Seguimiento')":"s.stage NOT IN ('Ganada','Perdida')";
      const deadline=source==='invoice'?"s.due_at<=(now() AT TIME ZONE 'UTC')::date-$1::integer":"s.updated_at<now()-($1*interval '1 day')";
      const rows=(await db.query<{id:string;client_id:string|null;updated_at:Date}>(`SELECT s.id,${source==='invoice'?'NULL::uuid AS client_id':'s.client_id'},s.updated_at FROM ${table} s WHERE ${predicate} AND ${deadline}
        AND NOT EXISTS (SELECT 1 FROM engine_jobs j WHERE j.dedupe_key='rule:'||$2||':'||s.id::text||':'||to_char(s.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ORDER BY s.updated_at,s.id LIMIT 100`,[rule.delay_days,rule.id])).rows;
      for(const row of rows){
        const id=await enqueue(db,tenantId,rule.actor_id,'task',`rule:${rule.id}:${row.id}:${row.updated_at.toISOString()}`,{ruleId:rule.id,source,sourceId:row.id,sourceUpdatedAt:row.updated_at.toISOString(),clientId:row.client_id,title:`Seguimiento: ${rule.name}`.slice(0,200)});
        if(id)scheduled++;
      }
    }
    await db.query('INSERT INTO engine_heartbeat(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO UPDATE SET last_seen_at=now()',[tenantId]);
    return scheduled;
  });
}
