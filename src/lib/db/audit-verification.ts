import {createHash} from 'node:crypto';
import {withTenant} from './tenant-transaction.ts';
import {canonicalJson} from '../security/canonical-json.ts';

type Row={id:string;tenant_id:string;actor_id:string|null;action:string;resource_type:string;resource_id:string;previous_hash:string;hash:string;metadata:unknown;created_at:Date;hash_version:number};
export type AuditVerification={status:'verified'|'legacy'|'partial'|'broken';checked:number;legacy:number;verified:number;at:string;problemId?:string};
export async function verifyStoredAudit(tenantId:string,maximum=100000):Promise<AuditVerification>{
  const limit=Math.max(1,Math.min(100000,Math.floor(maximum)||1));
  return withTenant(tenantId,async db=>{
    const at=(await db.query<{at:Date}>('SELECT now() at')).rows[0]!.at.toISOString();
    let previous='0'.repeat(64),cursor='0',checked=0,legacy=0,verified=0;
    for(;;){
      const rows=(await db.query<Row>('SELECT id::text,tenant_id,actor_id,action,resource_type,resource_id,previous_hash,hash,metadata,created_at,hash_version FROM audit_logs WHERE id>$1 ORDER BY audit_logs.id LIMIT $2',[cursor,Math.min(500,limit-checked+1)])).rows;
      if(!rows.length)return {status:legacy?'legacy':'verified',checked,legacy,verified,at};
      for(const row of rows){
        if(checked>=limit)return {status:'partial',checked,legacy,verified,at};
        if(row.previous_hash!==previous)return {status:'broken',checked,legacy,verified,at,problemId:row.id};
        if(row.hash_version===2){
          const expected=createHash('sha256').update(canonicalJson({version:2,tenantId:row.tenant_id,userId:row.actor_id,action:row.action,resourceType:row.resource_type,resourceId:row.resource_id,metadata:row.metadata,createdAt:row.created_at.toISOString(),previousHash:previous})).digest('hex');
          if(expected!==row.hash)return {status:'broken',checked,legacy,verified,at,problemId:row.id};
          verified++;
        }else legacy++;
        checked++;previous=row.hash;cursor=row.id;
      }
    }
  },true);
}
