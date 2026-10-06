'use server';
import {requireSession} from '@/lib/auth/current-session';
import {runSecurityChecks,updateFinding} from '@/lib/security-center/service';
import {ApiError} from '@/lib/api/contracts';
import {revalidatePath} from 'next/cache';import {redirect} from 'next/navigation';
export async function scanSecurityAction(){const session=await requireSession();let error='';try{await runSecurityChecks(session);}catch(e){error=e instanceof ApiError?e.detail:'No se pudo completar la comprobación. El resultado no se considera superado.';}revalidatePath('/seguridad');redirect(error?'/seguridad?error='+encodeURIComponent(error):'/seguridad?analizado=1');}
export async function updateFindingAction(form:FormData){const session=await requireSession();let error='';try{const p=Object.fromEntries(form.entries());await updateFinding(session,{id:p.id,status:p.status,reason:p.reason,...(p.reviewAt?{reviewAt:p.reviewAt}:{})});}catch(e){error=e instanceof ApiError?e.detail:'Revisa el estado, la justificación y la fecha de revisión.';}revalidatePath('/seguridad');redirect(error?'/seguridad?error='+encodeURIComponent(error):'/seguridad?guardado=1');}

