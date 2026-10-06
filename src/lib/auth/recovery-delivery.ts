import {z} from 'zod';
type Environment=Record<string,string|undefined>;
type Message={email:string;link:string;id:string};
export function recoveryAvailable(env:Environment=process.env){
 if(env.NODE_ENV!=='production')return true;
 return env.RECOVERY_MAIL_PROVIDER==='resend'&&env.EXTERNAL_OPERATIONS_ENABLED==='true'&&/^re_[A-Za-z0-9_-]{10,}$/.test(env.RECOVERY_RESEND_API_KEY??'')&&z.email().safeParse(env.RECOVERY_FROM).success;
}
export async function sendRecovery(message:Message,transport:typeof fetch=fetch,env:Environment=process.env){
 const text='Usa este enlace en los próximos 30 minutos. Si no lo solicitaste, ignora este mensaje.\n\n'+message.link;
 if(env.RECOVERY_MAIL_PROVIDER==='resend'){
  if(!recoveryAvailable({...env,NODE_ENV:'production'}))throw new Error('RECOVERY_MAIL_NOT_CONFIGURED');
  const response=await transport('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+env.RECOVERY_RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'recovery/'+message.id},body:JSON.stringify({from:env.RECOVERY_FROM,to:[message.email],subject:'Recuperar acceso a Revenia',text})});
  if(!response.ok)throw new Error('RECOVERY_MAIL_UNAVAILABLE');await response.body?.cancel();return;
 }
 if(env.NODE_ENV==='production'||env.RECOVERY_MAIL_PROVIDER!=='mailpit')throw new Error('RECOVERY_MAIL_DISABLED');
 const response=await transport('http://127.0.0.1:8025/api/v1/send',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:'security@revenia.local',Name:'Revenia'},To:[{Email:message.email}],Subject:'Recuperar acceso a Revenia',Text:text})});
 if(!response.ok)throw new Error('RECOVERY_MAIL_UNAVAILABLE');await response.body?.cancel();
}
