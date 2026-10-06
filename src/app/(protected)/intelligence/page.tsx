import {queueAi} from "@/app/engine-actions";
import Link from "next/link";
import { createRecommendedTask } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getAnalytics, getRecoveryOpportunities } from "@/lib/domain/operations-service";

export default async function IntelligencePage() {
  const session=await requireSession(); const [analytics,recovery]=await Promise.all([getAnalytics(session.tenantId),getRecoveryOpportunities(session.tenantId)]);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">INTELLIGENCE</p><h1>Recomendaciones explicables</h1><p>Priorización local. La generación de borradores con IA envía el título, la etapa y el importe de la oportunidad al proveedor configurado.</p></div></header><section className="intelligence-hero panel"><div><span className="ai-orb">IA</span></div><div><h2>Plan comercial de hoy</h2><p>Hay {recovery.length} oportunidades abiertas por {analytics.pipeline}. El forecast ponderado es {analytics.forecast}.</p></div></section><section className="recommendation-cards">{recovery.slice(0,3).map((item,index)=><article className="panel" key={item.id}><span className="priority-number">0{index+1}</span><h2>{item.title}</h2><p>{item.probability}% de probabilidad · {item.formattedAmount}</p><p className="explanation">Recomendación: contactar hoy y confirmar el siguiente compromiso comercial.</p><form action={createRecommendedTask}><input type="hidden" name="title" value={`Acción prioritaria: ${item.title}`}/><input type="hidden" name="channel" value={index===0 ? "WhatsApp" : "Llamada"}/><SubmitButton pendingText="Creando…">Añadir a tareas</SubmitButton></form><form action={queueAi}><input type="hidden" name="id" value={item.id}/><SubmitButton className="secondary-button">Generar borrador con IA</SubmitButton></form><Link href="/ejecuciones">Ver generaciones</Link></article>)}</section></main>;
}
