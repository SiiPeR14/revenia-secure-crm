'use server';
import {prepareInvoiceMessage,checkInvoiceMessage} from '@/lib/engines/invoice-messages';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireSession} from '@/lib/auth/current-session';
import {can,type Permission} from '@/lib/security/rbac';
import {withTenant,type TenantDatabase} from '@/lib/db/tenant-transaction';
import {recordAudit} from '@/lib/db/audit-repository';
import {credentialsSchema,providerSchema,EngineError} from '@/lib/engines/contracts';
import {sealCredentials,getCredentials,externalEnabled} from '@/lib/engines/connections';
import {enqueue,claimJob,processJob,scheduleRules} from '@/lib/engines/queue';

const messages:Record<string,string>={INVOICE_NOTICE_STALE:'La factura o el contacto han cambiado. Revisa la factura y prepara un borrador nuevo.',INVOICE_NOT_PAYABLE:'La factura debe estar pendiente o vencida y tener un importe positivo.',PROVIDER_NOT_CONFIGURED:'Configura y habilita el proveedor en Integraciones.',EXTERNAL_OPERATIONS_DISABLED:'La activación de servicios externos todavía está apagada.',CONTACT_PERMISSION_MISSING:'Registra primero la autorización del contacto para este canal.',CONTACT_SUPPRESSED:'Este destinatario ha solicitado la baja o ha sido bloqueado por el proveedor.',ENCRYPTION_KEY_MISSING:'Falta configurar una clave de cifrado válida en el servidor.'};
async function operation(path:string,permission:Permission,work:(session:Awaited<ReturnType<typeof requireSession>>)=>Promise<void>){
  const session=await requireSession();let failure:string|undefined;
  if(!can(session.role,permission))failure='Tu rol no permite realizar esta operación.';
  else try{await work(session);}catch(error){failure=error instanceof EngineError?(messages[error.code]??'La operación no está disponible. Revisa su estado y configuración.'):'Revisa los campos. El registro puede existir ya o haber cambiado.';}
  revalidatePath('/','layout');
  redirect(`${path}${path.includes('?')?'&':'?'}${failure?'error='+encodeURIComponent(failure):'guardado=1'}`);
}
export async function saveConnection(form:FormData){
  await operation('/integraciones','tenant:manage',async session=>{
    const raw=Object.fromEntries(form.entries());if(raw.inboundAddress==='')delete raw.inboundAddress;
    const credentials=credentialsSchema.parse(raw);
    await withTenant(session.tenantId,async db=>{
      await db.query(`INSERT INTO provider_connections(tenant_id,provider,credentials) VALUES($1,$2,$3)
        ON CONFLICT(tenant_id,provider) DO UPDATE SET credentials=EXCLUDED.credentials,enabled=false,version=gen_random_uuid(),updated_at=now()`,[session.tenantId,credentials.provider,JSON.stringify(sealCredentials(session.tenantId,credentials))]);
      await recordAudit(db,session,'provider.credentials_updated','provider',credentials.provider);
    });
  });
}
export async function toggleConnection(form:FormData){
  await operation('/integraciones','tenant:manage',async session=>{
    const provider=providerSchema.parse(form.get('provider'));const enabled=z.enum(['true','false']).parse(form.get('enabled'))==='true';
    await withTenant(session.tenantId,async db=>{
      await db.query('UPDATE provider_connections SET enabled=$1,updated_at=now() WHERE provider=$2',[enabled,provider]);
      await recordAudit(db,session,enabled?'provider.enabled':'provider.disabled','provider',provider);
    });
  });
}
export async function saveContactPermission(form:FormData){
  await operation('/permisos-contacto','crm:write',async session=>{
    const p=z.object({clientId:z.uuid(),channel:z.enum(['Email','WhatsApp']),allowed:z.enum(['true','false']),evidence:z.string().trim().min(5).max(500)}).parse(Object.fromEntries(form.entries()));
    await withTenant(session.tenantId,async db=>{
      await db.query(`INSERT INTO contact_permissions(tenant_id,client_id,channel,allowed,evidence,recorded_by) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(tenant_id,client_id,channel) DO UPDATE SET allowed=EXCLUDED.allowed,evidence=EXCLUDED.evidence,recorded_by=EXCLUDED.recorded_by,updated_at=now()`,[session.tenantId,p.clientId,p.channel,p.allowed==='true',p.evidence,session.userId]);
      await recordAudit(db,session,'contact.permission_updated','client',p.clientId,{channel:p.channel,allowed:p.allowed==='true'});
    });
  });
}
export async function saveRule(form:FormData){
  await operation('/automatizaciones','crm:write',async session=>{
    const p=z.object({name:z.string().trim().min(2).max(160),triggerType:z.enum(['quote_inactive','opportunity_inactive','invoice_overdue']),delayDays:z.coerce.number().int().min(1).max(365)}).parse(Object.fromEntries(form.entries()));
    await withTenant(session.tenantId,async db=>{
      const row=(await db.query<{id:string}>('INSERT INTO automations(tenant_id,name,trigger_name,trigger_type,delay_days,actor_id,enabled) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id',[session.tenantId,p.name,p.triggerType==='invoice_overdue'?'Factura vencida':p.triggerType==='quote_inactive'?'Presupuesto sin actividad':'Oportunidad sin actividad',p.triggerType,p.delayDays,session.userId])).rows[0]!;
      await recordAudit(db,session,'automation.created','automation',row.id);
    });
  });
}
export async function runLocalRules(){
  await operation('/ejecuciones','crm:write',async session=>{
    await scheduleRules(session.tenantId);
    for(let i=0;i<20;i++){const job=await claimJob(session.tenantId,false);if(!job)break;await processJob(job);}
  });
}
async function ready(tenantId:string,provider:'resend'|'whatsapp'|'stripe'|'openai',db?:TenantDatabase){
  if(!externalEnabled())throw new EngineError('EXTERNAL_OPERATIONS_DISABLED');
  if(db){if(!(await db.query('SELECT 1 FROM provider_connections WHERE provider=$1 AND enabled',[provider])).rowCount)throw new EngineError('PROVIDER_NOT_CONFIGURED');}
  else await getCredentials(tenantId,provider);
}
export async function queueDraft(form:FormData){
  await operation('/inbox','crm:write',async session=>{
    const p=z.object({id:z.uuid(),confirm:z.literal('on'),template:z.string().optional(),language:z.string().optional()}).parse(Object.fromEntries(form.entries()));
    await withTenant(session.tenantId,async db=>{
      const row=(await db.query<{id:string;client_id:string;channel:'Email'|'WhatsApp';body:string;subject:string;email:string;phone:string}>("SELECT m.id,m.client_id,m.channel,m.body,m.subject,c.email,c.phone FROM conversations m JOIN clients c ON c.id=m.client_id WHERE m.id=$1 AND m.direction='Salida' AND m.delivery_status='draft' FOR UPDATE OF m",[p.id])).rows[0];
      if(!row)throw new EngineError('DRAFT_NOT_AVAILABLE');
      await checkInvoiceMessage(db,row.id,row.client_id);
      await ready(session.tenantId,row.channel==='Email'?'resend':'whatsapp',db);
      if(!(await db.query('SELECT 1 FROM contact_permissions WHERE client_id=$1 AND channel=$2 AND allowed',[row.client_id,row.channel])).rowCount)throw new EngineError('CONTACT_PERMISSION_MISSING');
      const address=row.channel==='Email'?row.email:row.phone.replace(/[\s()-]/g,'').replace(/^\+/,'');
      if((await db.query('SELECT 1 FROM message_suppressions WHERE channel=$1 AND address=$2',[row.channel,address])).rowCount)throw new EngineError('CONTACT_SUPPRESSED');
      const job=await enqueue(db,session.tenantId,session.userId,row.channel==='Email'?'email':'whatsapp',`message:${row.id}:${randomUUID()}`,row.channel==='Email'?{conversationId:row.id,clientId:row.client_id,to:address,subject:row.subject,body:row.body}:{conversationId:row.id,clientId:row.client_id,to:address,template:p.template,language:p.language});
      if(job){await db.query("UPDATE conversations SET engine_job_id=$1,delivery_status='queued',template_name=$2,template_language=$3 WHERE id=$4",[job,row.channel==='WhatsApp'?p.template:null,row.channel==='WhatsApp'?p.language:null,row.id]);await recordAudit(db,session,'message.approved','conversation',row.id);}
    });
  });
}
export async function queueAi(form:FormData){
  await operation('/ejecuciones','crm:write',async session=>{
    const id=z.uuid().parse(form.get('id'));await ready(session.tenantId,'openai');
    await withTenant(session.tenantId,async db=>{
      const row=(await db.query<{title:string;stage:string;amount:string;updated_at:Date}>('SELECT title,stage,amount,updated_at FROM opportunities WHERE id=$1',[id])).rows[0];if(!row)throw new EngineError('OPPORTUNITY_MISSING');
      const job=await enqueue(db,session.tenantId,session.userId,'ai',`ai:${id}:${row.updated_at.toISOString()}`,{opportunityId:id,context:JSON.stringify({titulo:row.title,etapa:row.stage,importe:row.amount})});
      if(job)await recordAudit(db,session,'ai.requested','generation',job);
    });
  });
}
export async function queueCheckout(form:FormData){
  await operation('/ejecuciones','billing:manage',async session=>{
    const id=z.uuid().parse(form.get('id'));await ready(session.tenantId,'stripe');
    await withTenant(session.tenantId,async db=>{
      const invoice=(await db.query<{number:string;cents:string;currency:string;status:string}>('SELECT number,(amount*100)::bigint::text cents,currency,status FROM invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!invoice||!['Pendiente','Vencida'].includes(invoice.status))throw new EngineError('INVOICE_NOT_PAYABLE');
      if((await db.query("SELECT id FROM checkout_links WHERE invoice_id=$1 AND state IN ('pending','open')",[id])).rowCount)return;
      const job=await enqueue(db,session.tenantId,session.userId,'checkout',`checkout:${id}:${randomUUID()}`,{invoiceId:id,number:invoice.number,amountCents:Number(invoice.cents),currency:invoice.currency,tenantId:session.tenantId});
      await db.query('INSERT INTO checkout_links(tenant_id,invoice_id,job_id,amount_cents,currency) VALUES($1,$2,$3,$4,$5)',[session.tenantId,id,job,invoice.cents,invoice.currency]);
      await recordAudit(db,session,'checkout.requested','invoice',id);
    });
  });
}
export async function cancelQueuedJob(form:FormData){
  await operation('/ejecuciones','tenant:manage',async session=>{
    const id=z.uuid().parse(form.get('id'));
    await withTenant(session.tenantId,async db=>{
      const job=await db.query("UPDATE engine_jobs SET status='cancelled',updated_at=now() WHERE id=$1 AND status='queued' AND first_attempt_at IS NULL RETURNING id",[id]);
      if(job.rowCount){await db.query("UPDATE conversations SET delivery_status='draft',engine_job_id=NULL WHERE engine_job_id=$1",[id]);await db.query("UPDATE checkout_links SET state='failed' WHERE job_id=$1 AND state='pending'",[id]);await recordAudit(db,session,'engine.cancelled','job',id);}
    });
  });
}
export async function reconcileReceipt(form:FormData){
  await operation('/ejecuciones','tenant:manage',async session=>{
    const p=z.object({provider:providerSchema,eventId:z.string().min(1).max(300)}).parse(Object.fromEntries(form.entries()));
    await withTenant(session.tenantId,async db=>{
      const row=await db.query('UPDATE webhook_receipts SET attempts=0,quarantined_at=NULL,available_at=now(),error_code=NULL WHERE provider=$1 AND event_id=$2 AND processed_at IS NULL AND quarantined_at IS NOT NULL AND payload IS NOT NULL RETURNING event_id',[p.provider,p.eventId]);
      if(row.rowCount)await recordAudit(db,session,'webhook.reconciliation_requested',p.provider,p.eventId.slice(0,160));
    });
  });
}

export async function prepareInvoiceDraft(form:FormData){
 await operation('/inbox','crm:write',async session=>{
 const p=z.object({invoiceId:z.uuid(),clientId:z.uuid(),confirm:z.literal('on')}).parse(Object.fromEntries(form.entries()));
 await withTenant(session.tenantId,db=>prepareInvoiceMessage(db,session,p.invoiceId,p.clientId));
 });
}
