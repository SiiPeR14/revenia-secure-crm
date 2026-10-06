'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
export function RecoveryForm({reset=false}:{reset?:boolean}){
 const token=useRef('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 useEffect(()=>{if(reset){if(window.location.hash)token.current=window.location.hash.slice(1);window.history.replaceState(null,'',window.location.pathname);}},[reset]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const fields=new FormData(event.currentTarget);setBusy(true);setMessage('');
  try{
   if(reset&&fields.get('password')!==fields.get('confirm')){setMessage('Las contraseñas no coinciden.');return;}
   const response=await fetch(reset?'/api/auth/reset':'/api/auth/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reset?{token:token.current,password:String(fields.get('password'))}:{email:String(fields.get('email'))})});
   const result=await response.json();setMessage(result.message);setDone(response.ok);
  }catch{setMessage('No se ha podido conectar. Inténtalo de nuevo.');}finally{setBusy(false);}
 }
 return <section className="panel"><p className="eyebrow">REVENIA · ACCESO SEGURO</p><h1>{reset?'Nueva contraseña':'Recuperar acceso'}</h1><p>{reset?'El enlace caduca a los 30 minutos y solo puede utilizarse una vez.':'Introduce el correo con el que accedes a Revenia.'}</p><form onSubmit={submit} className="form-grid">{reset?<><label className="wide">Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required disabled={done}/></label><label className="wide">Repetir contraseña<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={200} required disabled={done}/></label></>:<label className="wide">Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={200} required disabled={done}/></label>}<button className="primary-button" disabled={busy||done}>{busy?'Procesando…':reset?'Cambiar contraseña':'Enviar enlace'}</button></form><p role="status" aria-live="polite">{message}</p><Link href="/login">Volver a iniciar sesión</Link></section>;
}
