import Link from 'next/link';
import {z} from 'zod';
import {requireSession} from '@/lib/auth/current-session';
import {withTenant} from '@/lib/db/tenant-transaction';
import {cancelQueuedJob,runLocalRules,reconcileReceipt} from '@/app/engine-actions';
import {SubmitButton} from '@/components/submit-button';
import {PageFeedback} from '@/components/page-feedback';
import {can} from '@/lib/security/rbac';

type JobRow={id:string;kind:string;status:string;attempts:number;error_code:string|null;result:{text?:string;model?:string;complete?:boolean;usage?:{input_tokens:number;output_tokens:number};estimatedCostUsd?:number};created_at:Date;first_attempt_at:Date|null};
const columns='id,kind,status,attempts,error_code,result,created_at,first_attempt_at';
const statuses:Record<string,string>={queued:'En cola',running:'En curso',succeeded:'Completada',failed:'Fallida',uncertain:'Requiere revisión',cancelled:'Cancelada'};
const billingErrors:Record<string,string>={SUBSCRIPTION_REQUIRED:'Esta empresa necesita una suscripción.',SUBSCRIPTION_INACTIVE:'La suscripción está inactiva o debe verificarse de nuevo.',PLAN_MESSAGE_LIMIT:'Se ha alcanzado el cupo mensual de mensajes.',PLAN_FEATURE_UNAVAILABLE:'Esta función no está incluida en el plan.',PLAN_SEAT_LIMIT:'Hay más personas que licencias contratadas.'};
const kinds:Record<string,string>={task:'Seguimiento',email:'Email',whatsapp:'WhatsApp',ai:'Borrador IA',checkout:'Enlace de cobro'};

export default async function JobsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const [session,query]=await Promise.all([requireSession(),searchParams]);
  const selectedId=z.uuid().safeParse(query.id);
  const data=await withTenant(session.tenantId,async db=>({
    jobs:(await db.query<JobRow>(`SELECT ${columns} FROM engine_jobs ORDER BY created_at DESC LIMIT 100`)).rows,
    selected:selectedId.success?(await db.query<JobRow>(`SELECT ${columns} FROM engine_jobs WHERE id=$1`,[selectedId.data])).rows[0]:undefined,
    links:(await db.query<{job_id:string;checkout_url:string;state:string}>("SELECT job_id,checkout_url,state FROM checkout_links WHERE checkout_url IS NOT NULL AND job_id IN (SELECT id FROM engine_jobs ORDER BY created_at DESC LIMIT 100)")).rows,
    heartbeat:(await db.query<{last_seen_at:Date}>('SELECT last_seen_at FROM engine_heartbeat')).rows[0],
    events:(await db.query<{provider:string;event_id:string;error_code:string|null;attempts:number;quarantined_at:Date|null}>("SELECT provider,event_id,error_code,attempts,quarantined_at FROM webhook_receipts WHERE processed_at IS NULL ORDER BY quarantined_at NULLS LAST,received_at LIMIT 50")).rows
  }));
  const selected=data.selected;const manage=can(session.role,'tenant:manage');
  return <main className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">OPERACIONES</p><h1>Ejecuciones</h1><p>Estado de tareas, mensajes, IA y solicitudes de cobro. Últimas 100 operaciones.</p></div><div className="header-actions"><Link className="secondary-button button-link" href="/ejecuciones">Actualizar</Link>{can(session.role,'crm:write')?<form action={runLocalRules}><SubmitButton>Procesar reglas locales</SubmitButton></form>:null}</div></header>
    <PageFeedback error={query.error} success={query.guardado?'Operación registrada.':undefined}/>
    <p className="secure-note">{data.heartbeat?`Última actividad del motor: ${data.heartbeat.last_seen_at.toLocaleString('es-ES')}`:'El motor todavía no ha registrado actividad.'} Las ejecuciones inciertas no se repiten automáticamente; revisa el proveedor antes de tomar otra acción.</p>
    {selected?.result.text?<article className="panel generated-result"><h2>Borrador generado</h2><p className="helper-text">{selected.result.model} · Entrada: {selected.result.usage?.input_tokens??0} tokens · Salida: {selected.result.usage?.output_tokens??0} tokens · Estimación: {selected.result.estimatedCostUsd?.toFixed(5)} USD</p>{selected.result.complete===false?<p className="secure-note">El proveedor no completó la generación. Este borrador puede estar incompleto.</p>:null}<p style={{whiteSpace:'pre-wrap'}}>{selected.result.text}</p><p className="secure-note">Revisa los hechos y el tono antes de usar este texto. No se ha enviado al cliente.</p></article>:null}
    {query.id&&!selected?<p className="secure-note">La operación solicitada no está disponible para esta empresa.</p>:null}
    <article className="panel table-scroll"><table><thead><tr><th>Tipo</th><th>Estado</th><th>Intentos</th><th>Fecha</th><th>Detalle</th><th>Acción</th></tr></thead><tbody>{data.jobs.map(job=><tr key={job.id}>
      <td>{kinds[job.kind]??job.kind}</td><td>{statuses[job.status]}</td><td>{job.attempts}</td><td>{job.created_at.toLocaleString('es-ES')}</td><td>{job.error_code&&billingErrors[job.error_code]?<p>{billingErrors[job.error_code]} <Link href="/configuracion?tab=plan">Revisar plan</Link></p>:null}{job.error_code?<details><summary>Información de soporte</summary><code>{job.error_code}</code></details>:'—'}</td><td><div className="row-actions">
        {job.result.text?<Link href={`/ejecuciones?id=${job.id}`}>Ver borrador</Link>:null}
        {data.links.filter(link=>link.job_id===job.id&&link.state==='open').map(link=><a key={link.job_id} href={link.checkout_url} target="_blank" rel="noopener noreferrer">Abrir enlace de cobro</a>)}
        {job.status==='queued'&&!job.first_attempt_at&&manage?<form action={cancelQueuedJob}><input type="hidden" name="id" value={job.id}/><SubmitButton className="table-action">Cancelar</SubmitButton></form>:null}
      </div></td></tr>)}</tbody></table>{!data.jobs.length?<p className="empty-state">No hay ejecuciones todavía.</p>:null}</article>
    {data.events.length?<article className="panel generated-result"><h2>Avisos pendientes de conciliar</h2><p className="helper-text">Se muestran hasta 50 avisos. Volver a conciliarlos comprueba el estado recibido; no vuelve a enviar mensajes ni crea cobros.</p>{data.events.map(event=><div className="receipt-row" key={`${event.provider}:${event.event_id}`}><div><strong>{event.provider}</strong><p>{event.quarantined_at?'Revisión necesaria':'Reintento programado'} · {event.attempts} intentos</p><details><summary>Información de soporte</summary><code>{event.error_code??'Pendiente'}</code></details></div>{event.quarantined_at&&manage?<form action={reconcileReceipt}><input type="hidden" name="provider" value={event.provider}/><input type="hidden" name="eventId" value={event.event_id}/><SubmitButton className="secondary-button">Volver a conciliar</SubmitButton></form>:null}</div>)}</article>:null}
  </main>;
}
