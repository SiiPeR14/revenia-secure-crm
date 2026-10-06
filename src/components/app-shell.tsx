import Link from "next/link";
import {can} from "@/lib/security/rbac";
import { LogoutButton } from "./logout-button";
import { Navigation } from "./navigation";
import { GlobalSearch } from "./global-search";
import type { SessionClaims } from "@/lib/security/session";

export function AppShell({ session, counts, children, identity }: { session: SessionClaims; identity?:{display_name:string;tenant_name:string}; counts: { messages:number; notifications:number }; children: React.ReactNode }) {
  return <div className="app-shell"><aside className="sidebar"><Link href="/dashboard" className="logo"><span className="brand-mark">R</span><strong>Revenia</strong></Link><Link href="/configuracion" className="workspace"><span className="workspace-icon">{identity?.tenant_name.slice(0,1)??'R'}</span><div><strong>{identity?.tenant_name??'Tu empresa'}</strong><small>{session.role}</small></div><span>›</span></Link><div className="desktop-navigation"><Navigation unreadMessages={counts.messages} role={session.role}/></div><details className="mobile-navigation"><summary>Menú de navegación</summary><Navigation unreadMessages={counts.messages} role={session.role}/></details><Link href="/configuracion?tab=plan" className="sidebar-plan"><span>♛</span><div><strong>Plan y uso</strong><small>Consultar suscripción</small></div></Link></aside><section className="main-area"><header className="topbar"><GlobalSearch/>{can(session.role,'crm:write')?<details className="new-menu"><summary className="primary-button">＋ Nuevo</summary><div><Link href="/clientes?nuevo=1">Cliente</Link><Link href="/oportunidades?nuevo=1">Oportunidad</Link><Link href="/presupuestos?nuevo=1">Presupuesto</Link><Link href="/facturas?nuevo=1">Factura</Link><Link href="/tareas?nuevo=1">Tarea</Link></div></details>:null}<Link href="/notificaciones" className="bell" aria-label={`Notificaciones: ${counts.notifications} sin leer`}>♧{counts.notifications > 0 ? <i/> : null}</Link><span className="user-avatar">{identity?.display_name.slice(0,2).toUpperCase()??'R'}</span><Link href="/cuenta" className="user-name"><strong>{identity?.display_name??'Mi cuenta'}</strong><small>{identity?.tenant_name??'Tu empresa'}</small></Link><LogoutButton /></header><div className="content">{children}</div></section></div>;
}


