import {z} from 'zod';
import {withTenant} from '../db/tenant-transaction.ts';
import {recordAudit} from '../db/audit-repository.ts';
import {requirePermission} from '../security/rbac.ts';
import type {SessionClaims} from '../security/session.ts';
import {ApiError,clientInput,clientPatch,clientOutput,listInput,taskInput,taskPatch,taskOutput} from '../api/contracts.ts';

type ClientRow={id:string;name:string;company:string;email:string;phone:string;status:string;value:string;version:number;updated_at:Date};
type TaskRow={id:string;title:string;client_id:string|null;invoice_id:string|null;channel:string;status:string;due_at:Date;version:number;updated_at:Date};
const clientColumns='id,name,company,email,phone,status,value,version,updated_at';
const taskColumns='id,title,client_id,invoice_id,channel,status,due_at,version,updated_at';
function clientDto(row:ClientRow){return clientOutput.parse({...row,updatedAt:row.updated_at.toISOString()});}
function taskDto(row:TaskRow){return taskOutput.parse({...row,clientId:row.client_id,invoiceId:row.invoice_id,dueAt:row.due_at.toISOString(),updatedAt:row.updated_at.toISOString()});}
const missing=()=>new ApiError(404,'NOT_FOUND','No se ha encontrado el recurso.');
const stale=()=>new ApiError(409,'VERSION_CONFLICT','El registro ha cambiado. Actualiza la página antes de guardar.');

export async function listClients(session:SessionClaims,input:unknown){
 requirePermission(session.role,'crm:read');const p=listInput.parse(input);
 return withTenant(session.tenantId,async db=>{
  const values=[`%${p.q}%`,p.limit,(p.page-1)*p.limit];
  const rows=await db.query<ClientRow>(`SELECT ${clientColumns} FROM clients WHERE archived_at IS NULL AND (name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1) ORDER BY updated_at DESC,id LIMIT $2 OFFSET $3`,values);
  const count=await db.query<{total:number}>('SELECT count(*)::int total FROM clients WHERE archived_at IS NULL AND (name ILIKE $1 OR company ILIKE $1 OR email ILIKE $1)',[values[0]]);
  return {data:rows.rows.map(clientDto),pagination:{page:p.page,limit:p.limit,total:count.rows[0]!.total}};
 },true);
}
export async function getClient(session:SessionClaims,id:string){
 requirePermission(session.role,'crm:read');z.uuid().parse(id);
 return withTenant(session.tenantId,async db=>{const r=await db.query<ClientRow>(`SELECT ${clientColumns} FROM clients WHERE id=$1 AND archived_at IS NULL`,[id]);if(!r.rows[0])throw missing();return clientDto(r.rows[0]);});
}
export async function addClient(session:SessionClaims,input:unknown){
 requirePermission(session.role,'crm:write');const p=clientInput.parse(input);
 return withTenant(session.tenantId,async db=>{
  const r=await db.query<ClientRow>(`INSERT INTO clients(tenant_id,name,company,email,phone,value,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${clientColumns}`,[session.tenantId,p.name,p.company,p.email,p.phone,p.value,p.status]);
  await recordAudit(db,session,'client.created','client',r.rows[0]!.id);return clientDto(r.rows[0]!);
 });
}
export async function editClient(session:SessionClaims,id:string,input:unknown){
 requirePermission(session.role,'crm:write');z.uuid().parse(id);const p=clientPatch.parse(input);
 return withTenant(session.tenantId,async db=>{
  const before=(await db.query<ClientRow>(`SELECT ${clientColumns} FROM clients WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,[id])).rows[0];
  if(!before)throw missing();if(before.version!==p.version)throw stale();
  const v={...before,...p};
  const r=await db.query<ClientRow>(`UPDATE clients SET name=$2,company=$3,email=$4,phone=$5,value=$6,status=$7 WHERE id=$1 RETURNING ${clientColumns}`,[id,v.name,v.company,v.email,v.phone,v.value,v.status]);
  await recordAudit(db,session,'client.updated','client',id,{version:r.rows[0]!.version});return clientDto(r.rows[0]!);
 });
}
export async function archiveClient(session:SessionClaims,id:string,version:number){
 requirePermission(session.role,'crm:write');z.uuid().parse(id);z.number().int().positive().parse(version);
 return withTenant(session.tenantId,async db=>{
  const row=(await db.query<{version:number}>('SELECT version FROM clients WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id])).rows[0];
  if(!row)throw missing();if(row.version!==version)throw stale();
  await db.query("UPDATE clients SET archived_at=now(),status='Inactivo' WHERE id=$1",[id]);
  await recordAudit(db,session,'client.archived','client',id);
 });
}
export async function listTasks(session:SessionClaims,input:unknown){
 requirePermission(session.role,'crm:read');const p=listInput.parse(input);
 return withTenant(session.tenantId,async db=>{
  const q=`%${p.q}%`;const r=await db.query<TaskRow>(`SELECT ${taskColumns} FROM tasks WHERE title ILIKE $1 ORDER BY updated_at DESC,id LIMIT $2 OFFSET $3`,[q,p.limit,(p.page-1)*p.limit]);
  const total=(await db.query<{total:number}>('SELECT count(*)::int total FROM tasks WHERE title ILIKE $1',[q])).rows[0]!.total;
  return {data:r.rows.map(taskDto),pagination:{page:p.page,limit:p.limit,total}};
 },true);
}
export async function addTask(session:SessionClaims,input:unknown){
 requirePermission(session.role,'crm:write');const p=taskInput.parse(input);
 return withTenant(session.tenantId,async db=>{
  if(p.clientId&&!(await db.query('SELECT id FROM clients WHERE id=$1 AND archived_at IS NULL',[p.clientId])).rowCount)throw missing();
  const r=await db.query<TaskRow>(`INSERT INTO tasks(tenant_id,title,client_id,channel,due_at,status,completed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='Completada' THEN now() END) RETURNING ${taskColumns}`,[session.tenantId,p.title,p.clientId,p.channel,p.dueAt,p.status]);
  await recordAudit(db,session,'task.created','task',r.rows[0]!.id);return taskDto(r.rows[0]!);
 });
}
export async function editTask(session:SessionClaims,id:string,input:unknown){
 requirePermission(session.role,'crm:write');z.uuid().parse(id);const p=taskPatch.parse(input);
 return withTenant(session.tenantId,async db=>{
  const before=(await db.query<TaskRow>(`SELECT ${taskColumns} FROM tasks WHERE id=$1 FOR UPDATE`,[id])).rows[0];
  if(!before)throw missing();if(before.version!==p.version)throw stale();
  if(p.clientId&&!(await db.query('SELECT id FROM clients WHERE id=$1 AND archived_at IS NULL',[p.clientId])).rowCount)throw missing();
  const v={...taskDto(before),...p};
  const r=await db.query<TaskRow>(`UPDATE tasks SET title=$2,client_id=$3,channel=$4,due_at=$5,status=$6,completed_at=CASE WHEN $6='Completada' THEN coalesce(completed_at,now()) END WHERE id=$1 RETURNING ${taskColumns}`,[id,v.title,v.clientId,v.channel,v.dueAt,v.status]);
  await recordAudit(db,session,'task.updated','task',id,{version:r.rows[0]!.version});return taskDto(r.rows[0]!);
 });
}
