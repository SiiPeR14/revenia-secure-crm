'use client';
import {useActionState} from 'react';
import {verifyAuditAction} from '@/app/audit-actions';
import {SubmitButton} from './submit-button';

export function AuditVerificationPanel(){
  const [state,action]=useActionState(verifyAuditAction,{});const result=state.result;
  const labels={verified:'Comprobación completada',legacy:'Comprobación con registros históricos',partial:'Comprobación parcial',broken:'Se ha detectado una discrepancia'};
  return <article className="panel account-panel"><h2>Verificar registros de auditoría</h2><p>Comprueba una instantánea de hasta 100.000 registros de tu empresa. La comprobación no modifica el historial.</p><form action={action}><SubmitButton pendingText="Comprobando…">Verificar auditoría</SubmitButton></form>{state.error?<p role="alert" className="form-error">{state.error}</p>:null}{result?<div className="invitation-result" role="status"><strong>{labels[result.status]}</strong><p>{result.checked} registros recorridos · {result.verified} con contenido verificado · {result.legacy} históricos con continuidad comprobada.</p>{result.legacy>0?<p>Los registros antiguos no conservan el formato necesario para reconstruir siempre su huella. Su contenido no se presenta como íntegramente verificado.</p>:null}{result.status==='partial'?<p>Se ha alcanzado el límite de esta comprobación. Quedan registros por revisar.</p>:null}{result.problemId?<p>Registro que requiere revisión: {result.problemId}. Contacta con el responsable de seguridad.</p>:null}<p>Instantánea: {new Date(result.at).toLocaleString('es-ES')}</p></div>:null}<p className="helper-text">La cadena detecta determinadas modificaciones; no sustituye una copia externa ni permite descartar que un administrador haya eliminado el final del historial.</p></article>;
}
