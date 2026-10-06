import {z} from 'zod';
import {platformConfig,notificationConfig} from '../billing/stripe-platform.ts';

type Environment=Record<string,string|undefined>;
const exampleKey='cd2faefcf93779453bc60b54cb2fec09382ffedc37acb17e0c5997ee198c36ef';
export function deploymentIssues(env:Environment):string[]{
  const issues:string[]=[];
  const secret=env.SESSION_SECRET??'';const key=env.FIELD_ENCRYPTION_KEK??'';
  if(secret.length<64||/change-this|revenia-local|demo/i.test(secret))issues.push('SESSION_SECRET: genera un secreto nuevo de al menos 64 caracteres.');
  if(!/^[a-f0-9]{64}$/i.test(key)||key.toLowerCase()===exampleKey||new Set(key).size<8)issues.push('FIELD_ENCRYPTION_KEK: genera una clave nueva de 32 bytes; no uses la de ejemplo.');
  try{const u=new URL(env.APP_URL??'');if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||['localhost','127.0.0.1'].includes(u.hostname)||/\.(local|test)$/.test(u.hostname))throw new Error();}catch{issues.push('APP_URL: configura el origen HTTPS público definitivo.');}
  try{const u=new URL(env.DATABASE_URL??'');if(!['postgres:','postgresql:'].includes(u.protocol)||decodeURIComponent(u.username)!=='revenia_app'||!u.password||/revenia-local/i.test(decodeURIComponent(u.password))||!['verify-full','verify-ca'].includes(u.searchParams.get('sslmode')??''))throw new Error();}catch{issues.push('DATABASE_URL: usa revenia_app, una contraseña propia y TLS con verificación de certificado.');}
  try{const u=new URL(env.REDIS_URL??'');if(u.protocol!=='rediss:'||!u.password||/revenia-local/i.test(decodeURIComponent(u.password)))throw new Error();}catch{issues.push('REDIS_URL: configura Redis con autenticación y TLS (rediss).');}
  if(env.MIGRATION_DATABASE_URL||env.POSTGRES_PASSWORD||env.APP_DB_PASSWORD)issues.push('Retira las credenciales administradoras del entorno web/worker; las migraciones se ejecutan por separado.');
  if(env.DEV_OWNER_PASSWORD||env.DEV_OWNER_EMAIL)issues.push('Retira las variables de usuario de demostración.');
  const tenants=(env.WORKER_TENANT_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!tenants.length||tenants.some(id=>!z.uuid().safeParse(id).success||['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'].includes(id)))issues.push('WORKER_TENANT_IDS: configura las empresas reales que procesará el motor.');
  if(!['false','true'].includes(env.EXTERNAL_OPERATIONS_ENABLED??''))issues.push('EXTERNAL_OPERATIONS_ENABLED: establece false o true de forma explícita.');
  if(!/^\d+$/.test(env.ENGINE_DAILY_LIMIT??'')||Number(env.ENGINE_DAILY_LIMIT)<1||Number(env.ENGINE_DAILY_LIMIT)>1000)issues.push('ENGINE_DAILY_LIMIT: fija un límite entre 1 y 1000.');
  if(!['false','true'].includes(env.PLATFORM_BILLING_ENABLED??''))issues.push('PLATFORM_BILLING_ENABLED: declara explícitamente si está activa la suscripción de la plataforma.');
  if(env.PLATFORM_BILLING_ENABLED==='true'){
    try{platformConfig({...env,EXTERNAL_OPERATIONS_ENABLED:'true'});notificationConfig(env);}
    catch{issues.push('La facturación de plataforma requiere claves propias, modo coherente, precios autorizados y secreto para avisos.');}
  }
  return issues;
}
