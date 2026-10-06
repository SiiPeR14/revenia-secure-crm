export function MetricCard({ icon, tone, label, value, trend, detail }: { icon: string; tone: string; label: string; value: string; trend?: string; detail: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>{trend ? <span className="trend">{trend}</span> : null}</article>;
}
