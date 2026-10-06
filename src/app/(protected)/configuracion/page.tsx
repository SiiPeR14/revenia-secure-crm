import Link from "next/link";
import {BillingSummary} from "@/components/billing-summary";
import { updatePreferences } from "@/app/actions";
import { PageFeedback } from "@/components/page-feedback";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getPreferences } from "@/lib/domain/operations-service";

export default async function SettingsPage({ searchParams }: { searchParams:Promise<{tab?:string;guardado?:string;error?:string}> }) {
  const [session,query]=await Promise.all([requireSession(),searchParams]); const preferences=await getPreferences(session.tenantId); const plan=query.tab==="plan";
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Espacio de trabajo</h1><p>Preferencias centralizadas para tu empresa.</p></div></header><PageFeedback error={query.error} success={query.guardado ? "Configuración guardada y registrada en la auditoría." : undefined}/><div className="settings-tabs"><Link className={!plan ? "active" : ""} href="/configuracion">Preferencias</Link><Link className={plan ? "active" : ""} href="/configuracion?tab=plan">Plan y uso</Link></div>{plan ? <BillingSummary tenantId={session.tenantId}/> : <article className="panel settings-form"><p className="helper-text">Estas preferencias se guardan para tu empresa. La traducción de la interfaz, la conversión de moneda y los avisos automáticos todavía están pendientes.</p><form action={updatePreferences} className="form-grid"><label>Zona horaria<select name="timezone" defaultValue={preferences.timezone}><option>Europe/Madrid</option><option>Atlantic/Canary</option><option>UTC</option></select></label><label>Idioma<select name="locale" defaultValue={preferences.locale}><option value="es-ES">Español</option><option value="en-GB">English</option></select></label><label>Moneda<select name="currency" defaultValue={preferences.currency}><option>EUR</option><option>USD</option><option>GBP</option></select></label><label className="check-row wide"><input type="checkbox" name="emailNotifications" defaultChecked={preferences.email_notifications}/> Avisos por correo</label><label className="check-row wide"><input type="checkbox" name="weeklyDigest" defaultChecked={preferences.weekly_digest}/> Resumen semanal</label><div className="form-footer wide"><SubmitButton>Guardar cambios</SubmitButton></div></form></article>}</main>;
}

