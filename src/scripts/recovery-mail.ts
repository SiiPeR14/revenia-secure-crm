// Local-only delivery adapter. Never sends messages outside the local Mailpit inbox.
import {deliverRecovery} from '../lib/auth/recovery-service.ts';
import {closeDatabase} from '../lib/db/pool.ts';
if(process.env.NODE_ENV==='production')throw new Error('LOCAL_RECOVERY_TRANSPORT_ONLY');
try{
 let processed=0;
 while(processed<20&&await deliverRecovery(async message=>{
  const response=await fetch('http://127.0.0.1:8025/api/v1/send',{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:'security@revenia.local',Name:'Revenia'},To:[{Email:message.email}],Subject:'Recuperar acceso a Revenia',Text:'Usa este enlace en los próximos 30 minutos. Si no lo solicitaste, ignora este mensaje.\n\n'+message.link})});
  if(!response.ok)throw new Error('LOCAL_MAIL_FAILED');
 })){processed++;}
 console.log(JSON.stringify({event:'recovery.local_delivery',processed}));
}finally{await closeDatabase();}
