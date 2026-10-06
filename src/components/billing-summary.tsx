import Link from 'next/link';
import {billingOverview} from '@/lib/billing/usage';

const statuses:Record<string,string>={active:'Activa',trialing:'En prueba',past_due:'Pago pendiente',unpaid:'Sin pagar',canceled:'Cancelada',incomplete:'Alta pendiente',incomplete_expired:'Alta caducada',paused:'Pausada'};
const metrics:Record<string,string>={messages:'Mensajes preparados para envío',ai:'Solicitudes de IA',automations:'Seguimientos automáticos',checkouts:'Enlaces de pago preparados'};
export async function BillingSummary({tenantId}:{tenantId:string}){
  const {account,usage,required}=await billingOverview(tenantId);
  const valid=account?.access_allowed;
  return <section className="settings-grid">
    <article className="panel plan-detail"><p className="eyebrow">SUSCRIPCIÓN A REVENIA</p>
      <h2>{account?account.name:'Sin suscripción configurada'}</h2>
      <p>{account?`${statuses[account.status]??account.status}${!valid?' · Operaciones del motor bloqueadas':''}`:required?'Configura una suscripción antes de ejecutar operaciones del motor.':'Entorno de desarrollo: todavía no existe una suscripción comercial.'}</p>
      {account&&<><p>Personas en el equipo: <strong>{account.members} / {account.seats} licencias</strong></p><p>Verificación de acceso válida hasta {account.access_until.toLocaleString('es-ES',{timeZone:'Europe/Madrid'})} (Madrid). La sincronización debe renovarla periódicamente.</p><p>{account.cancel_at_period_end?'Cancelación prevista al finalizar el periodo.':'Sin cancelación al final del periodo registrada.'}</p><p>IA: {account.ai_enabled?'incluida en el plan':'no incluida en el plan'}.</p></>}
      <p>La contratación, los cambios de plan y el portal de cobro recurrente todavía están en preparación.</p>
      <p><Link href="/#demo" className="secondary-button button-link">Explorar los cuatro planes</Link></p>
      <p><Link href="/#planes">Ver precios orientativos y servicios</Link></p>
      <Link href="/cuenta" className="secondary-button button-link">Ver mi cuenta</Link>
    </article>
    <article className="panel"><h2>Uso del mes</h2><p>Mes natural en UTC. Email y WhatsApp comparten el cupo de mensajes.</p>
      {Object.entries(metrics).map(([key,label])=><p key={key}>{label}: <strong>{usage.find(item=>item.metric===key)?.used??0}{key==='messages'&&account?` / ${account.monthly_messages??'Sin límite de plan'}`:''}</strong></p>)}
      <p>Los reintentos conservan la misma reserva. Un envío fallido o con resultado incierto puede mantenerla; este contador no acredita entrega ni cobro.</p>
      {!account&&<p>El uso anterior a configurar una suscripción no se reconstruye en estos contadores.</p>}
      <Link href="/ejecuciones" className="secondary-button button-link">Ver ejecuciones</Link>
    </article>
    <article className="panel"><h2>Cobros de tus clientes</h2><p>Los pagos de tus facturas se gestionan de forma independiente a la suscripción de tu empresa a Revenia.</p><Link href="/pagos" className="secondary-button button-link">Ver pagos de facturas</Link></article>
  </section>;
}
