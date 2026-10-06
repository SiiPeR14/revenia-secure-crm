'use server';
import {requireSession} from '@/lib/auth/current-session';
import {can} from '@/lib/security/rbac';
import {verifyStoredAudit,type AuditVerification} from '@/lib/db/audit-verification';
import {consumeLoginAttempt} from '@/lib/redis/login-rate-limit';
type State={error?:string;result?:AuditVerification};
export async function verifyAuditAction():Promise<State>{
  const session=await requireSession();
  if(!can(session.role,'security:read'))return {error:'Tu rol no permite verificar la auditoría.'};
  try{
    if(!(await consumeLoginAttempt(`audit:${session.tenantId}:${session.userId}`)).allowed)return {error:'Espera 15 minutos antes de repetir más comprobaciones.'};
    return {result:await verifyStoredAudit(session.tenantId)};
  }catch{return {error:'No se ha podido completar la comprobación. No se ha modificado ningún registro.'};}
}

