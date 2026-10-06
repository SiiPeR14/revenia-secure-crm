import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {database} from '../db/pool.ts';
import {hashPassword} from '../security/password.ts';
import {encryptValue,decryptValue} from '../security/encryption.ts';
import {encryptionKey,publicOrigin} from '../engines/connections.ts';
export const recoveryRequest=z.object({email:z.email().trim().toLowerCase().max(200)}).strict();
export const recoveryReset=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:z.string().min(12).max(200)}).strict();
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const context='revenia:password-recovery:v1';
export async function requestRecovery(input:unknown){
 const {email}=recoveryRequest.parse(input);const token=randomBytes(32).toString('base64url');
 const payload=encryptValue(JSON.stringify({email,link:publicOrigin()+'/restablecer-acceso#'+token}),encryptionKey(),context);
 await database.query('SELECT revenia_recovery_issue($1,$2,$3)',[email,digest(token),JSON.stringify(payload)]);
}
export async function resetPassword(input:unknown){
 const {token,password}=recoveryReset.parse(input);const encoded=await hashPassword(password);
 return (await database.query<{ok:boolean}>('SELECT revenia_recovery_consume($1,$2) ok',[digest(token),encoded])).rows[0]!.ok;
}
// Outbox transport is injected: production must configure and verify its delivery adapter.
export async function deliverRecovery(send:(message:{email:string;link:string;id:string})=>Promise<void>,id?:string){
 type Item={id:string;payload:ReturnType<typeof encryptValue>;eligible:boolean;lease_id:string};
 const row=(await database.query<Item>('SELECT * FROM revenia_recovery_claim($1)',[id??null])).rows[0];if(!row)return false;
 try{
  if(row.eligible){const message=z.object({email:z.email(),link:z.url()}).strict().parse(JSON.parse(decryptValue(row.payload,encryptionKey(),context)));await send({...message,id:row.id});}
  await database.query('SELECT revenia_recovery_delivered($1,$2,true)',[row.id,row.lease_id]);return true;
 }catch{await database.query('SELECT revenia_recovery_delivered($1,$2,false)',[row.id,row.lease_id]);throw new Error('RECOVERY_DELIVERY_FAILED');}
}
