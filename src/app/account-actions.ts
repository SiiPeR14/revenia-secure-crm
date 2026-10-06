'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireSession} from '@/lib/auth/current-session';
import {AccountError,changeAccountPassword,revokeOtherSessions,updateTeamMember,switchWorkspace} from '@/lib/auth/account-service';

async function perform(path:string,operation:(token:string)=>Promise<void>){
  await requireSession();const token=(await cookies()).get('revenia_session')!.value;
  let error:string|undefined;
  try{await operation(token);}catch(problem){error=problem instanceof AccountError?problem.message:problem instanceof z.ZodError?'Revisa los campos. Las contraseñas deben tener entre 12 y 200 caracteres.':'No se ha podido completar la operación. Inténtalo de nuevo.';}
  if(error)redirect(`${path}?error=${encodeURIComponent(error)}`);
  revalidatePath('/','layout');
}
export async function changePasswordAction(form:FormData){
  await perform('/cuenta',async token=>{
    const p=z.object({currentPassword:z.string(),newPassword:z.string(),confirmation:z.string()}).parse(Object.fromEntries(form.entries()));
    if(p.newPassword!==p.confirmation)throw new AccountError('Las contraseñas nuevas no coinciden.');
    await changeAccountPassword(token,p.currentPassword,p.newPassword);
  });
  (await cookies()).delete('revenia_session');redirect('/login?cambiada=1');
}
export async function closeOtherSessionsAction(form:FormData){
  await perform('/cuenta',async token=>{await revokeOtherSessions(token,z.string().parse(form.get('currentPassword')));});
  redirect('/cuenta?guardado=1');
}
export async function updateMemberAction(form:FormData){
  await perform('/equipo',async token=>{
    const p=z.object({userId:z.uuid(),role:z.enum(['ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER']),currentPassword:z.string(),operation:z.enum(['role','remove'])}).parse(Object.fromEntries(form.entries()));
    await updateTeamMember(token,p.currentPassword,p.userId,p.operation==='remove'?null:p.role);
  });
  redirect('/equipo?guardado=1');
}
export async function switchWorkspaceAction(form:FormData){
  await perform('/cuenta',async token=>{
    const next=await switchWorkspace(token,z.uuid().parse(form.get('tenantId')));
    (await cookies()).set('revenia_session',next.token,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',path:'/',expires:next.expiresAt});
  });
  redirect('/dashboard');
}
