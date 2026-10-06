import Link from "next/link";
import { requireSession } from "@/lib/auth/current-session";
import { searchWorkspace } from "@/lib/domain/workspace-service";

export default async function SearchPage({ searchParams }: { searchParams:Promise<{q?:string|string[]}> }) {
  const [session,params]=await Promise.all([requireSession(),searchParams]); const raw=Array.isArray(params.q) ? params.q[0] : params.q; const query=(raw ?? "").trim().slice(0,100); const results=await searchWorkspace(session.tenantId,query);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">BÚSQUEDA GLOBAL</p><h1>Resultados</h1><p>{query.length>=2 ? `${results.length} coincidencias para “${query}”` : "Escribe al menos dos caracteres en el buscador superior."}</p></div></header><article className="panel search-results">{results.map((result,index)=><Link href={result.href} className="search-result" key={`${result.type}-${result.title}-${index}`}><span>{result.type.slice(0,1)}</span><div><strong>{result.title}</strong><p>{result.type} · {result.detail}</p></div><b>Ver →</b></Link>)}{query.length>=2 && !results.length ? <div className="empty-state"><strong>No encontramos coincidencias</strong><span>Prueba con un cliente, empresa, presupuesto o factura.</span></div> : null}</article></main>;
}
