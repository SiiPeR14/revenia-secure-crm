import Link from "next/link";
import { markNotificationsRead } from "@/app/actions";
import { PageFeedback } from "@/components/page-feedback";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getNotifications } from "@/lib/domain/operations-service";

export default async function NotificationsPage({ searchParams }: { searchParams:Promise<Record<string,string|undefined>> }) {
  const [session,query]=await Promise.all([requireSession(),searchParams]); const notifications=await getNotifications(session.tenantId); const unread=notifications.filter((item)=>item.unread).length;
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">ACTIVIDAD</p><h1>Notificaciones</h1><p>{unread} pendientes de revisar.</p></div>{unread > 0 ? <form action={markNotificationsRead}><SubmitButton className="secondary-button" pendingText="Marcando…">Marcar todas como leídas</SubmitButton></form> : <span className="badge success">Todo al día</span>}</header><PageFeedback success={query.leidas ? "Todas las notificaciones están al día." : undefined}/><article className="panel notification-list">{notifications.map((item)=><Link href={item.href} className={`notification-item${item.unread ? " unread" : ""}`} key={item.id}><span>{item.unread ? "●" : "✓"}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.createdAt}</time></Link>)}</article></main>;
}
