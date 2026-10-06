"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {can,type Role} from '@/lib/security/rbac';

const navigation = [
  ["⌂", "Inicio", "/dashboard"], ["♙", "Clientes", "/clientes"], ["↗", "Oportunidades", "/oportunidades"], ["▧", "Presupuestos", "/presupuestos"],
  ["✉", "Inbox", "/inbox"], ["☑", "Tareas", "/tareas"], ["◉", "Recovery Center", "/recovery"], ["⚡", "Automatizaciones", "/automatizaciones"], ["◎", "Intelligence", "/intelligence"], ["⌁", "Analytics", "/analytics"],
  ["▣", "Pagos", "/pagos"], ["▤", "Facturas", "/facturas"], ["⌘", "Integraciones", "/integraciones"], ["↻", "Ejecuciones", "/ejecuciones"], ["✓", "Permisos de contacto", "/permisos-contacto"], ["♢", "Seguridad", "/seguridad"], ["⌘", "API y contratos", "/api-docs"], ["⚙", "Configuración", "/configuracion"],
] as const;

export function Navigation({ unreadMessages,role }: { unreadMessages: number; role:Role }) {
  const pathname = usePathname();
  return <nav aria-label="Navegación principal">{navigation.map(([icon,label,href]) => {
    if(href==='/seguridad'&&!can(role,'security:read'))return null;
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={label} href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><span aria-hidden>{icon}</span>{label}{label === "Inbox" && unreadMessages > 0 ? <em>{unreadMessages}</em> : null}</Link>;
  })}<Link href="/cuenta" className={`nav-link${pathname==='/cuenta'?' active':''}`} aria-current={pathname==='/cuenta'?'page':undefined}><span aria-hidden>◉</span>Mi cuenta</Link>{can(role,'user:manage')?<Link href="/equipo" className={`nav-link${pathname==='/equipo'?' active':''}`} aria-current={pathname==='/equipo'?'page':undefined}><span aria-hidden>♙</span>Equipo</Link>:null}</nav>;
}
