import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {withTenant} from '../db/tenant-transaction.ts';
import {recordAudit} from '../db/audit-repository.ts';
import {verifyStoredAudit} from '../db/audit-verification.ts';
import {requirePermission} from '../security/rbac.ts';
import type {SessionClaims} from '../security/session.ts';
import {ApiError} from '../api/contracts.ts';
import {consumeQuota} from '../api/http.ts';
import {headerChecks,probeLocal,type CheckResult} from './checks.ts';
export type Run={id:string;status:'running'|'completed'|'failed';started_at:Date;finished_at:Date|null;results:CheckResult[];scope:string;rules_version:string};
export type Finding={id:string;rule_id:string;title:string;severity:string;status:string;evidence:string;remediation:string;last_seen:Date;reason:string|null;review_at:Date|null};
export async function securityOverview(session:SessionClaims){
 requirePermission(session.role,'security:read');return withTenant(session.tenantId,async db=>({runs:(await db.query<Run>('SELECT id,status,started_at,finished_at,results,scope,rules_version FROM security_runs ORDER BY started_at DESC LIMIT 20')).rows,findings:(await db.query<Finding>('SELECT id,rule_id,title,severity,status,evidence,remediation,last_seen,reason,review_at FROM security_findings ORDER BY last_seen DESC LIMIT 100')).rows}),true);
}
export async function persistResults(session:SessionClaims,id:string,results:CheckResult[]){
 requirePermission(session.role,'security:read');await withTenant(session.tenantId,async db=>{
  if(!(await db.query("UPDATE security_runs SET status='completed',results=$2,finished_at=now() WHERE id=$1 AND status='running' RETURNING id",[id,JSON.stringify(results)])).rowCount)throw new ApiError(409,'RUN_STATE','La ejecución ya ha terminado.');
  for(const r of results){
   if(r.status==='fail')await db.query(`INSERT INTO security_findings(tenant_id,rule_id,title,severity,evidence,remediation,latest_run_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,rule_id) DO UPDATE SET evidence=EXCLUDED.evidence,remediation=EXCLUDED.remediation,last_seen=now(),latest_run_id=EXCLUDED.latest_run_id,verified_at=NULL,status=CASE WHEN security_findings.status='accepted' AND security_findings.review_at>now() THEN 'accepted' ELSE 'open' END`,[session.tenantId,r.id,r.title,r.severity,r.evidence,r.remediation,id]);
   else if(r.status==='pass')await db.query("UPDATE security_findings SET status='resolved',verified_at=now(),latest_run_id=$2 WHERE rule_id=$1 AND status<>'resolved'",[r.id,id]);
  }
  await recordAudit(db,session,'security.scan_completed','security_run',id,{passed:results.filter(x=>x.status==='pass').length,failed:results.filter(x=>x.status==='fail').length});
 });
}
export async function runSecurityChecks(session:SessionClaims){
 requirePermission(session.role,'security:read');await consumeQuota(`scan:${session.tenantId}`,3,60);const id=randomUUID();const results:CheckResult[]=[];
 await withTenant(session.tenantId,async db=>{
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[session.tenantId]);
  await db.query("UPDATE security_runs SET status='failed',finished_at=now() WHERE status='running' AND started_at<now()-interval '1 minute'");
  if((await db.query("SELECT id FROM security_runs WHERE status='running'")).rowCount)throw new ApiError(409,'SCAN_RUNNING','Ya hay una comprobación en curso.');
  await db.query("INSERT INTO security_runs(id,tenant_id,actor_id,rules_version,status,scope) VALUES($1,$2,$3,'1.0','running','Configuración local, rol PostgreSQL, RLS y auditoría de la empresa; no es una auditoría completa.')",[id,session.tenantId,session.userId]);
  await recordAudit(db,session,'security.scan_started','security_run',id);
 });
 const add=(id:string,title:string,status:CheckResult['status'],severity:CheckResult['severity'],evidence:string,remediation:string)=>results.push({id,title,status,severity,evidence,remediation});
 try{
  try{
   const [live,privateRoute]=await Promise.all([probeLocal(process.env.APP_URL??'http://localhost:3000','/api/live'),probeLocal(process.env.APP_URL??'http://localhost:3000','/api/v1/clients')]);
   if(live.status!==200)throw new Error('APP_UNAVAILABLE');results.push(...headerChecks(live.headers,process.env.NODE_ENV==='production'));
   add('API-AUTH','API sin sesión',privateRoute.status===401?'pass':privateRoute.status===503?'not_evaluated':'fail','high',`La API devuelve HTTP ${privateRoute.status} a una petición sin credenciales.`,'Exigir una sesión válida antes de acceder al CRM.');
  }catch{for(const [key,title] of [['HTTP-CSP','Política de scripts'],['HTTP-MIME','Protección MIME'],['HTTP-FRAME','Protección frente a iframes'],['HTTP-REFERRER','Privacidad del referente'],['API-AUTH','API sin sesión']])add(key!,title!,'not_evaluated','medium','Sonda no disponible o destino no local; no se siguen redirecciones.','Repetir con el servidor local activo. La revisión remota exige un alcance independiente.');}
  await withTenant(session.tenantId,async db=>{
   const role=(await db.query<{rolsuper:boolean;rolbypassrls:boolean;rolcreaterole:boolean}>('SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0]!;
   add('DB-ROLE','Privilegios de base de datos',!role.rolsuper&&!role.rolbypassrls&&!role.rolcreaterole?'pass':'fail','high','Rol efectivo de esta conexión examinado.','Usar revenia_app sin SUPERUSER, BYPASSRLS ni CREATEROLE.');
   const tables=(await db.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege(c.oid,'SELECT') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id')`)).rows;
   const failed=tables.filter(t=>!t.relrowsecurity||!t.relforcerowsecurity);
   add('DB-RLS','Aislamiento de tablas',tables.length>0&&failed.length===0?'pass':'fail','high',`${tables.length} tablas accesibles con tenant_id; ${failed.length} sin RLS forzado.`,'Activar y forzar RLS en las tablas de negocio; mantener pruebas cruzadas.');
  });
  const audit=await verifyStoredAudit(session.tenantId,5000);
  add('AUDIT-CHAIN','Integridad de auditoría',audit.status==='verified'?'pass':audit.status==='broken'?'fail':'not_evaluated','high',`${audit.checked} eventos examinados; resultado ${audit.status}.`,'Investigar rupturas; los formatos históricos y análisis parciales requieren revisión.');
  add('TRANSPORT','HTTPS público',process.env.NODE_ENV!=='production'?'not_evaluated':process.env.APP_URL?.startsWith('https://')?'pass':'fail','high',process.env.NODE_ENV==='production'?'Esquema del origen configurado comprobado; certificados no evaluados.':'Desarrollo local; HTTPS público no evaluado.','Verificar TLS, certificados y HSTS en el dominio público.');
  add('SESSION-COOKIE','Cookies de una sesión real','not_evaluated','medium','El scanner no crea ni toma prestadas sesiones de usuario.','Verificar HttpOnly, SameSite y Secure en HTTPS en las pruebas E2E.');
  await persistResults(session,id,results);return {id,results};
 }catch(error){await withTenant(session.tenantId,async db=>{await db.query("UPDATE security_runs SET status='failed',finished_at=now(),results=$2 WHERE id=$1",[id,JSON.stringify(results)]);await recordAudit(db,session,'security.scan_failed','security_run',id);});throw error;}
}
export async function updateFinding(session:SessionClaims,input:unknown){
 requirePermission(session.role,'security:read');const p=z.object({id:z.uuid(),status:z.enum(['open','in_progress','pending_verification','accepted']),reason:z.string().trim().min(12).max(1000),reviewAt:z.iso.date().optional()}).strict().parse(input);
 const review=p.status==='accepted'&&p.reviewAt?new Date(p.reviewAt+'T23:59:59Z'):null;
 if(p.status==='accepted'&&(!review||review.getTime()<=Date.now()||review.getTime()>Date.now()+90*86400000))throw new ApiError(400,'REVIEW_DATE','La aceptación necesita una revisión dentro de 90 días.');
 await withTenant(session.tenantId,async db=>{if(!(await db.query('UPDATE security_findings SET status=$2,reason=$3,review_at=$4 WHERE id=$1 RETURNING id',[p.id,p.status,p.reason,review])).rowCount)throw new ApiError(404,'NOT_FOUND','Hallazgo no encontrado.');await recordAudit(db,session,'security.finding_updated','security_finding',p.id,{status:p.status,reviewAt:review?.toISOString()??null});});
}
