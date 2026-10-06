import Link from "next/link";
import { createRecommendedTask } from "@/app/actions";
import { MetricCard } from "@/components/metric-card";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getAnalytics, getAutomations, getInbox, getRecoveryOpportunities, getPipelineStages } from "@/lib/domain/operations-service";

export default async function DashboardPage() {
  const session = await requireSession();
  const [metrics, recovery, inbox, rules, pipeline] = await Promise.all([getAnalytics(session.tenantId), getRecoveryOpportunities(session.tenantId), getInbox(session.tenantId), getAutomations(session.tenantId), getPipelineStages(session.tenantId)]);
  const money = new Intl.NumberFormat("es-ES", {style:"currency",currency:"EUR"});
  const stages = ["Prospección", "Calificación", "Propuesta", "Negociación", "Ganada"];
  const data = {
    recommendations: recovery.slice(0,3).map(item => ({id:item.id,customer:item.client ?? item.title,action:"Revisar",reason:item.title + " · " + item.formattedAmount,channel:"Email",priority:item.probability < 40 ? "Alta" : "Media",cta:"Crear tarea"})),
    conversations: inbox.messages.slice(0,3).map(item => ({id:item.id,customer:item.client ?? "General",initials:(item.client ?? "R").slice(0,2),company:item.company ?? "",channel:item.channel,preview:item.body})),
    automations: rules.filter(item => item.enabled && item.trigger_type).slice(0,4).map(item => ({name:item.name,detail:item.trigger_name}))
  };

  return (
    <main className="page-stack">
      <header className="hero-row">
        <div>
          <p className="eyebrow">INICIO</p>
          <h1>Tu actividad comercial <span aria-hidden>☀️</span></h1>
          <p>Hay {metrics.opportunities} oportunidades que merecen una acción hoy.</p>
        </div>
        <div className="hero-quote">“Cada conversación recuperada es una venta más cerca.”</div>
      </header>

      <section className="metrics-grid" aria-label="Resumen comercial">
        <MetricCard icon="⌁" tone="green" label="Facturado" value={metrics.invoiced} detail="Facturas registradas" />
        <MetricCard icon="↻" tone="violet" label="Cobrado" value={metrics.collected} detail="Facturas marcadas como pagadas" />
        <MetricCard icon="!" tone="orange" label="Vencido" value={metrics.overdue} detail="Facturas pendientes de seguimiento" />
        <MetricCard icon="⌁" tone="blue" label="Previsión ponderada" value={metrics.forecast} detail="Importe × probabilidad registrada" />
        <MetricCard icon="◔" tone="violet" label="Conversión" value={`${metrics.conversion}%`} detail="Presupuestos aceptados sobre el total" />
      </section>

      <section className="dashboard-grid">
        <article className="panel recommendations">
          <div className="panel-heading"><div><h2>🎯 Recomendaciones de hoy</h2><p>Seguimientos ordenados por importe y probabilidad registrada.</p></div><span className="badge danger">{data.recommendations.length} sugerencias</span></div>
          <div className="recommendation-list">
            {data.recommendations.map((item) => (
              <div className="recommendation" key={item.id}>
                <span className={`round-icon ${item.channel === "WhatsApp" ? "green" : "blue"}`}>{item.channel === "WhatsApp" ? "◉" : "✉"}</span>
                <div><strong>{item.action} {item.customer}</strong><small>{item.reason}</small></div>
                <span className={`badge ${item.priority === "Alta" ? "danger" : "warning"}`}>{item.priority}</span>
                <form action={createRecommendedTask}><input type="hidden" name="title" value={`${item.action} ${item.customer}`}/><input type="hidden" name="channel" value={item.channel}/><SubmitButton className="soft-button" pendingText="Creando…">{item.cta}</SubmitButton></form>
              </div>
            ))}
          </div>
        </article>

        <article className="panel recovery-panel">
          <div className="panel-heading"><div><h2>🛟 Recovery Center</h2><p>Oportunidades en riesgo que todavía puedes recuperar.</p></div><Link href="/recovery">Ver todas →</Link></div>
          <div className="recovery-content">
            <div><p className="eyebrow">PIPELINE ABIERTO</p><h2>{metrics.pipeline}</h2><p>{metrics.opportunities} oportunidades</p></div>
            <div className="legend"><p>Probabilidad ≥70% <strong>{money.format(recovery.filter(item=>item.probability>=70).reduce((sum,item)=>sum+Number(item.amount),0))}</strong></p><p>Probabilidad &lt;70% <strong>{money.format(recovery.filter(item=>item.probability<70).reduce((sum,item)=>sum+Number(item.amount),0))}</strong></p></div>
          </div>
        </article>

        <article className="panel" id="pipeline">
          <div className="panel-heading"><div><h2>Pipeline comercial</h2><p>{metrics.pipeline} · {metrics.opportunities} abiertas</p></div><Link href="/oportunidades">Ver pipeline →</Link></div>
          <div className="pipeline-bar" aria-hidden>{stages.map(stage=><span key={stage} style={{flex:pipeline.find(row=>row.stage===stage)?.count ?? 0}}/>)}</div>
          <div className="pipeline-labels">{stages.map(stage=><p key={stage}>{stage}<strong>{pipeline.find(row=>row.stage===stage)?.count ?? 0}</strong></p>)}</div>
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Conversaciones recientes</h2><p>Respuestas y señales de compra.</p></div><Link href="/inbox">Ver inbox →</Link></div>
          {data.conversations.map((chat) => <div className="chat-row" key={chat.id}><span className="avatar">{chat.initials}</span><div><strong>{chat.customer}</strong><small>{chat.company} · {chat.channel}</small></div><p>{chat.preview}</p></div>)}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>Reglas habilitadas</h2><p>Seguimientos programados por inactividad.</p></div><Link href="/automatizaciones">Ver todas →</Link></div>
          {data.automations.map((automation) => <Link href="/automatizaciones" className="automation-row" key={automation.name}><span>⚡</span><div><strong>{automation.name}</strong><small>Guardada · {automation.detail}</small></div><span className="switch" aria-label="Gestionar automatización"/></Link>)}
        </article>
      </section>

      <section className="bottom-grid">
        <Link href="/configuracion?tab=plan" className="panel plan-card panel-link"><div><p className="eyebrow">TU PLAN Y SERVICIOS</p><h2>Plan y uso <span className="badge">Consultar</span></h2></div><div className="quota"><span>Clientes<strong>{metrics.clients}</strong></span><span>Presupuestos<strong>{metrics.quotes}</strong></span><span>Tareas pendientes<strong>{metrics.pendingTasks}</strong></span></div></Link>
        <Link href="/seguridad" className="panel security-summary panel-link"><div className="score">✓</div><div><p className="eyebrow">SEGURIDAD Y CUMPLIMIENTO</p><h2>Controles y auditoría</h2><p>Consulta los controles implementados y la actividad de tu empresa.</p></div></Link>
      </section>
    </main>
  );
}
