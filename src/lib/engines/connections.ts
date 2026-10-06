import { withTenant } from '../db/tenant-transaction.ts';
import { encryptValue, decryptValue } from '../security/encryption.ts';
import { credentialsSchema, EngineError, type Provider, type Credentials } from './contracts.ts';

export function encryptionKey() {
  const key=process.env.FIELD_ENCRYPTION_KEK;
  if(!key || !/^[a-f0-9]{64}$/i.test(key)) throw new EngineError('ENCRYPTION_KEY_MISSING');
  return key;
}
export function sealCredentials(tenantId:string, credentials:Credentials) {
  return encryptValue(JSON.stringify(credentialsSchema.parse(credentials)),encryptionKey(),`provider:${tenantId}:${credentials.provider}`);
}
export async function getCredentials(tenantId:string,provider:Provider,requireEnabled=true,expectedVersion?:string|null):Promise<Credentials> {
  return withTenant(tenantId,async db=>{
    const row=(await db.query<{credentials:ReturnType<typeof encryptValue>;enabled:boolean;version:string}>('SELECT credentials,enabled,version FROM provider_connections WHERE provider=$1',[provider])).rows[0];
    if(!row || (requireEnabled&&!row.enabled))throw new EngineError('PROVIDER_NOT_CONFIGURED');
    if(expectedVersion&&row.version!==expectedVersion)throw new EngineError('CONNECTION_CHANGED');
    return credentialsSchema.parse(JSON.parse(decryptValue(row.credentials,encryptionKey(),`provider:${tenantId}:${provider}`)));
  });
}
export async function connectionSummaries(tenantId:string) {
  return withTenant(tenantId,async db=>(await db.query<{provider:Provider;enabled:boolean;updated_at:Date}>('SELECT provider,enabled,updated_at FROM provider_connections ORDER BY provider')).rows);
}
export function externalEnabled(){return process.env.EXTERNAL_OPERATIONS_ENABLED==='true';}
export function publicOrigin(){
  const url=new URL(process.env.APP_URL??'http://localhost:3000');
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new EngineError('APP_URL_INVALID');
  if(url.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw new EngineError('APP_URL_REQUIRES_HTTPS');
  return url.origin;
}
