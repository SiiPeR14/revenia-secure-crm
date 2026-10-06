import { advanceOpportunity, createRecommendedTask } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getRecoveryOpportunities } from "@/lib/domain/operations-service";

export default async function RecoveryPage() {
  const session=await requireSession(); const opportunities=await getRecoveryOpportunities(session.tenantId);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">RECOVERY CENTER</p><h1>Oportunidades recuperables</h1><p>Prioridad calculada con importe, probabilidad y siguiente acción.</p></div></header><section className="recovery-grid">{opportunities.map((item)=><article className="panel recovery-card" key={item.id}><div className="risk-score">{100-item.probability}<small>riesgo</small></div><div className="grow"><span className="badge warning">{item.stage}</span><h2>{item.title}</h2><p>{item.client ?? "Sin cliente"} · siguiente acción: {item.nextAction}</p><strong>{item.formattedAmount}</strong></div><div className="stack-actions"><form action={createRecommendedTask}><input type="hidden" name="title" value={`Seguimiento: ${item.title}`}/><input type="hidden" name="channel" value="Llamada"/><SubmitButton className="secondary-button" pendingText="Creando…">Crear tarea</SubmitButton></form><form action={advanceOpportunity}><input type="hidden" name="id" value={item.id}/><SubmitButton pendingText="Actualizando…">Avanzar etapa</SubmitButton></form></div></article>)}</section></main>;
}
