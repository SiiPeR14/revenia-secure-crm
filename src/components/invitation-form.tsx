'use client';
import {useActionState} from 'react';
import {createInvitationAction} from '@/app/invitation-actions';
import {SubmitButton} from './submit-button';

export function InvitationForm(){
  const [state,action]=useActionState(createInvitationAction,{});
  return <article className="panel account-panel"><h2>Invitar a una persona</h2><p>El enlace caduca en 72 horas y solo puede utilizarse una vez. No se envía ningún correo automáticamente.</p><form action={action} className="form-grid"><label className="wide">Correo de la persona invitada<input name="email" type="email" required maxLength={200}/></label><label>Rol inicial<select name="role" defaultValue="VIEWER"><option value="VIEWER">Solo lectura</option><option value="EMPLOYEE">Empleado</option><option value="SALES">Comercial</option><option value="MANAGER">Responsable comercial</option><option value="ADMIN">Administrador</option></select></label><label>Tu contraseña actual<input name="currentPassword" type="password" autoComplete="current-password" minLength={12} maxLength={200} required/></label><div className="wide"><SubmitButton>Crear invitación</SubmitButton></div></form>{state.error?<p role="alert" className="form-error">{state.error}</p>:null}{state.url?<div className="invitation-result" role="status"><strong>Invitación creada</strong><p>Copia el enlace y compártelo únicamente con esa persona por un canal de confianza. Se muestra ahora; para sustituirlo, crea una nueva invitación.</p><label>Enlace privado<input value={state.url} readOnly onFocus={event=>event.currentTarget.select()}/></label></div>:null}</article>;
}
