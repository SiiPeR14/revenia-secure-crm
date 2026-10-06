'use server';
import {z} from 'zod';import {revalidatePath} from 'next/cache';import {redirect} from 'next/navigation';
import {requireSession} from '@/lib/auth/current-session';import {addClient,editClient,archiveClient,addTask,editTask} from '@/lib/domain/crm-service';import {ApiError} from '@/lib/api/contracts';
function feedback(error:unknown){if(error instanceof ApiError)return error.detail;if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')return 'Ya existe un cliente con ese correo en tu empresa.';return 'Revisa los campos. No se ha guardado la operación.';}
export async function saveClientAction(form:FormData){
 const session=await requireSession();const id=String(form.get('id')??'');let error='';
 const input={name:form.get('name'),company:form.get('company'),email:form.get('email'),phone:form.get('phone'),value:String(form.get('value')??'0').replace(',','.'),status:form.get('status')};
 try{if(id)await editClient(session,id,{...input,version:z.coerce.number().int().positive().parse(form.get('version'))});else await addClient(session,input);}catch(e){error=feedback(e);}
 revalidatePath('/clientes');redirect(error?'/clientes?error='+encodeURIComponent(error)+(id?'&editar='+id:'&nuevo=1'):'/clientes?guardado=1');
}
export async function archiveClientAction(form:FormData){
 const session=await requireSession();let error='';
 try{z.literal('on').parse(form.get('confirm'));await archiveClient(session,z.uuid().parse(form.get('id')),z.coerce.number().int().positive().parse(form.get('version')));}catch(e){error=feedback(e);}
 revalidatePath('/clientes');redirect(error?'/clientes?error='+encodeURIComponent(error):'/clientes?archivado=1');
}
export async function saveTaskAction(form:FormData){
 const session=await requireSession();const id=String(form.get('id')??'');let error='';
 try{if(id)await editTask(session,id,{title:form.get('title'),status:form.get('status'),version:z.coerce.number().int().positive().parse(form.get('version'))});
 else await addTask(session,{title:form.get('title'),clientId:form.get('clientId')||null,channel:form.get('channel'),dueAt:String(form.get('dueAt'))+':00Z'});}catch(e){error=feedback(e);}
 revalidatePath('/tareas');revalidatePath('/dashboard');redirect(error?'/tareas?error='+encodeURIComponent(error):'/tareas?guardado=1');
}

