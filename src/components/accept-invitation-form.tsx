'use client';
import Link from 'next/link';
import {useActionState,useEffect,useRef} from 'react';
import {acceptInvitationAction} from '@/app/invitation-actions';
import {SubmitButton} from './submit-button';

export function AcceptInvitationForm(){
  const tokenInput=useRef<HTMLInputElement>(null);const captured=useRef(false);
  const [state,action]=useActionState(acceptInvitationAction,{});
  useEffect(()=>{
    if(captured.current)return;captured.current=true;
    const token=new URLSearchParams(window.location.hash.slice(1)).get('token')??'';
    if(tokenInput.current){tokenInput.current.defaultValue=token;tokenInput.current.value=token;}
    window.history.replaceState(null,'',window.location.pathname);
  },[]);
  if(state.accepted)return <section className="login-card"><h1>Acceso al equipo preparado</h1><p>Entra con el correo al que iba dirigida la invitación y tu contraseña. Si ya perteneces a otra empresa, podrás elegir esta desde Mi cuenta.</p><Link className="primary-button button-link" href="/login">Ir al acceso</Link></section>;
  return <section className="login-card"><h1>Aceptar invitación</h1><p>Si ya tienes cuenta en Revenia, utiliza tu contraseña actual. Si es tu primera vez, elige una nueva.</p><form action={action}><input type="hidden" ref={tokenInput} name="token"/><label>Tu nombre<input name="name" autoComplete="name" minLength={2} maxLength={120} required/></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" minLength={12} maxLength={200} required/></label><label>Repetir contraseña<input name="confirmation" type="password" autoComplete="current-password" minLength={12} maxLength={200} required/></label>{state.error?<p role="alert" className="form-error">{state.error}</p>:null}<SubmitButton>Aceptar y preparar mi acceso</SubmitButton></form><p className="login-note">El enlace concede acceso al correo indicado por el propietario. No modifica la contraseña de una cuenta existente.</p></section>;
}
