'use server';
import {cookies} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {requireSession} from '@/lib/auth/current-session';
import {AccountError} from '@/lib/auth/account-service';
import {acceptInvitation,createInvitation,revokeInvitation} from '@/lib/auth/invitation-service';

type InviteState={error?:string;url?:string;accepted?:boolean};
function friendly(error:unknown){if(error&&typeof error==='object'&&'code' in error&&error.code==='P0001'&&'message' in error){if(error.message==='PLAN_SEAT_LIMIT')return 'No quedan licencias disponibles. El propietario debe revisar el plan antes de añadir personas.';if(error.message==='SUBSCRIPTION_INACTIVE')return 'La suscripción de esta empresa no está activa. Contacta con su propietario.';}return error instanceof AccountError?error.message:error instanceof z.ZodError?'Revisa los campos y utiliza una contraseña de entre 12 y 200 caracteres.':'No se ha podido completar la operación. Inténtalo de nuevo.';}
export async function createInvitationAction(_previous:InviteState,form:FormData):Promise<InviteState>{
  await requireSession();const token=(await cookies()).get('revenia_session')!.value;
  try{
    const p=z.object({email:z.string(),role:z.string(),currentPassword:z.string()}).parse(Object.fromEntries(form.entries()));
    const url=await createInvitation(token,p.currentPassword,p.email,p.role);revalidatePath('/equipo');return {url};
  }catch(error){return {error:friendly(error)};}
}
export async function acceptInvitationAction(_previous:InviteState,form:FormData):Promise<InviteState>{
  try{
    const p=z.object({token:z.string(),name:z.string(),password:z.string(),confirmation:z.string()}).parse(Object.fromEntries(form.entries()));
    if(p.password!==p.confirmation)throw new AccountError('Las contraseñas no coinciden.');
    await acceptInvitation(p.token,p.name,p.password);return {accepted:true};
  }catch(error){return {error:friendly(error)};}
}
export async function revokeInvitationAction(form:FormData){
  await requireSession();const token=(await cookies()).get('revenia_session')!.value;let error:string|undefined;
  try{await revokeInvitation(token,z.string().parse(form.get('currentPassword')),z.uuid().parse(form.get('id')));}catch(problem){error=friendly(problem);}
  revalidatePath('/equipo');redirect(error?`/equipo?error=${encodeURIComponent(error)}`:'/equipo?invitacionRetirada=1');
}
