import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {readStoredSession} from '../db/session-store.ts';
import {getRedis} from '../redis/client.ts';
import {AuthorizationError,requirePermission,type Permission} from '../security/rbac.ts';
import {isTrustedOrigin} from '../security/request.ts';
import {ApiError} from './contracts.ts';
import type {SessionClaims} from '../security/session.ts';
import {observeRequest} from '../observability/metrics.ts';

export async function readJson(request:Request,maxBytes=16384){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Usa application/json.');
 if(Number(request.headers.get('content-length'))>maxBytes)throw new ApiError(413,'BODY_TOO_LARGE','La petición supera el tamaño permitido.');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'INVALID_JSON','JSON no válido.');
 let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new ApiError(413,'BODY_TOO_LARGE','La petición supera el tamaño permitido.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new ApiError(400,'INVALID_JSON','JSON no válido.');}
}
export async function consumeQuota(key:string,limit=60,windowSeconds=60){
 const redis=await getRedis();const digest=createHash('sha256').update(key).digest('hex');
 const count=await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",{keys:[`revenia:quota:${digest}`],arguments:[String(windowSeconds)]});
 if(Number(count)>limit)throw new ApiError(429,'RATE_LIMITED','Demasiadas peticiones. Espera antes de reintentar.');
}
export function sessionToken(request:Request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('revenia_session='))?.slice('revenia_session='.length);}
type Context={session:SessionClaims;requestId:string};
export async function api(request:Request,route:string,permission:Permission,operation:(context:Context)=>Promise<unknown>,successStatus=200){
 const requestId=randomUUID();const started=performance.now();let status=successStatus;let body:unknown;
 try{
  const token=sessionToken(request);const session=token?await readStoredSession(token):null;
  if(!session)throw new ApiError(401,'UNAUTHENTICATED','Inicia sesión para continuar.');
  requirePermission(session.role,permission);
  if(!['GET','HEAD'].includes(request.method)&&!isTrustedOrigin(request))throw new ApiError(403,'INVALID_ORIGIN','Origen no permitido.');
  await consumeQuota(`api:${session.tenantId}:${session.userId}`,120);
  body=await operation({session,requestId});
 }catch(error){
  let code='SERVICE_UNAVAILABLE',message='El servicio no está disponible temporalmente.';status=503;
  if(error instanceof ApiError){status=error.status;code=error.code;message=error.detail;}
  else if(error instanceof AuthorizationError){status=403;code='FORBIDDEN';message='No tienes permiso para esta operación.';}
  else if(error instanceof z.ZodError){status=400;code='VALIDATION_ERROR';message='Revisa los campos y parámetros enviados.';}
  else if(error&&typeof error==='object'&&'code' in error){if(error.code==='23505'){status=409;code='DUPLICATE';message='Ya existe un registro con estos datos.';}else if(error.code==='23503'){status=400;code='INVALID_REFERENCE';message='La referencia no está disponible.';}}
  body={error:{code,message,requestId}};
 }
 const duration=Math.round(performance.now()-started);observeRequest(route,status,duration);
 console.info(JSON.stringify({time:new Date().toISOString(),event:'api.request',route,method:request.method,status,durationMs:duration,requestId}));
 return new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Request-Id':requestId,...(status===429?{'Retry-After':'60'}:{})}});
}
