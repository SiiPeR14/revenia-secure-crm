import {deploymentIssues} from '../lib/security/deployment.ts';

const issues=deploymentIssues(process.env);
if(issues.length){console.error('Publicación bloqueada por configuración:');for(const issue of issues)console.error(`- ${issue}`);process.exitCode=1;}
else{
  const {database,closeDatabase}=await import('../lib/db/pool.ts');
  const {checkRedis,closeRedis}=await import('../lib/redis/client.ts');
  try{
    const role=(await database.query<{rolsuper:boolean;rolbypassrls:boolean}>("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    if(!role||role.rolsuper||role.rolbypassrls)throw new Error('El usuario de aplicación tiene privilegios incompatibles con el aislamiento.');
    const tables=['invoices','clients','engine_jobs','provider_connections','contact_permissions','webhook_receipts','checkout_links','message_suppressions','team_invitations','billing_accounts','billing_usage','billing_bindings','billing_event_receipts','security_runs','security_findings'];
    const secured=await database.query("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relrowsecurity AND relforcerowsecurity",[tables]);
    if(secured.rowCount!==tables.length)throw new Error('Faltan tablas o políticas de aislamiento obligatorias.');
    await database.query('SELECT quarantined_at FROM webhook_receipts LIMIT 0');
    await database.query('SELECT invoice_id FROM tasks LIMIT 0');
    await database.query('SELECT invoice_id,invoice_updated_at FROM conversations LIMIT 0');
    await database.query('SELECT hash_version FROM audit_logs LIMIT 0');
    const requiredFunctions=['revenia_account_password','revenia_invite_accept','revenia_switch_workspace','revenia_reserve_job_usage','revenia_apply_subscription','revenia_platform_webhook_target','revenia_recovery_consume'];
    const functions=await database.query("SELECT DISTINCT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY($1)",[requiredFunctions]);
    if(functions.rowCount!==requiredFunctions.length)throw new Error('Faltan funciones de seguridad de cuenta.');
    const triggers=await database.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D' AND tgname=ANY($1)",[['identity_session_revocation','membership_session_revocation']]);
    if(triggers.rowCount!==2)throw new Error('Faltan disparadores de revocación.');
    const {withTenant}=await import('../lib/db/tenant-transaction.ts');
    for(const tenant of process.env.WORKER_TENANT_IDS!.split(',').map(s=>s.trim()).filter(Boolean)){
      const result=await withTenant(tenant,db=>db.query('SELECT id FROM tenants WHERE id=$1',[tenant]));
      if(!result.rowCount)throw new Error('Una empresa configurada para el motor no existe.');
      const licensed=await withTenant(tenant,db=>db.query("SELECT 1 FROM billing_accounts a JOIN billing_bindings b USING(tenant_id) WHERE a.status IN ('active','trialing') AND a.access_until>now() AND b.last_synced_at>now()-interval '24 hours'"));
      if(!licensed.rowCount)throw new Error('Falta una suscripción verificada para una empresa del motor.');
    }
    if(!await checkRedis())throw new Error('Redis no está listo.');
    console.log('Configuración técnica y servicios comprobados. Esta comprobación no certifica proveedores, copias de seguridad ni requisitos legales.');
  }catch{console.error('Publicación bloqueada: revisar conectividad, permisos, empresas y migraciones con un administrador.');process.exitCode=1;}
  finally{await Promise.allSettled([closeDatabase(),closeRedis()]);}
}
