import {limitedBody} from '@/lib/engines/signatures';
import {EngineError} from '@/lib/engines/contracts';
import {PlatformBillingError} from '@/lib/billing/stripe-platform';
import {notificationConfig,receivePlatformNotification} from '@/lib/billing/notifications';
import {z} from 'zod';

export const runtime='nodejs';
export async function POST(request:Request){
  let config:ReturnType<typeof notificationConfig>;
  try{config=notificationConfig();}catch{return Response.json({error:'Servicio no configurado'},{status:503});}
  try{
    await receivePlatformNotification(await limitedBody(request),request.headers,config);
    return Response.json({received:true});
  }catch(error){
    const invalid=error instanceof EngineError||error instanceof z.ZodError||error instanceof SyntaxError||error instanceof PlatformBillingError;
    return Response.json({error:invalid?'Aviso no válido':'Servicio temporalmente no disponible'},{status:invalid?400:503});
  }
}
