import {recoveryAvailable} from './recovery-delivery.ts';
import {z} from 'zod';
import {readJson,consumeQuota} from '../api/http.ts';
import {ApiError} from '../api/contracts.ts';
import {isTrustedOrigin} from '../security/request.ts';
import {requestRecovery,resetPassword,recoveryRequest,recoveryReset} from './recovery-service.ts';
const generic={message:'Si existe una cuenta activa con ese correo, recibirás un enlace de recuperación.'};
export async function recoveryHttp(request:Request,mode:'request'|'reset'){
 const reply=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(status===429?{'Retry-After':'60'}:{})}});
 try{
  if(!isTrustedOrigin(request))throw new ApiError(403,'INVALID_ORIGIN','Origen no permitido.');
  await consumeQuota('recovery:global:'+mode,60);
  const body=await readJson(request,2048);
  if(mode==='request'){
   if(!recoveryAvailable())throw new ApiError(503,'RECOVERY_UNAVAILABLE','La recuperación por correo aún no está disponible. Contacta con el administrador.');
   const input=recoveryRequest.parse(body);
   try{await consumeQuota('recovery:email:'+input.email,3,900);}catch(error){if(error instanceof ApiError&&error.status===429)return reply(generic,202);throw error;}
   await requestRecovery(input);return reply(generic,202);
  }
  const input=recoveryReset.parse(body);await consumeQuota('recovery:token:'+input.token,5,900);
  if(!await resetPassword(input))return reply({message:'El enlace no es válido, ha caducado o ya se ha utilizado.'},400);
  return reply({message:'Contraseña cambiada. Se han cerrado todas las sesiones anteriores.'},200);
 }catch(error){
  if(error instanceof z.ZodError)return reply({message:'Revisa los campos. La contraseña debe tener entre 12 y 200 caracteres.'},400);
  if(error instanceof ApiError)return reply({message:error.detail},error.status);
  return reply({message:'El servicio no está disponible temporalmente.'},503);
 }
}
