"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ProtectedError({ error, reset }: { error:Error & { digest?:string }; reset:()=>void }) {
  useEffect(() => { console.error("[REVENIA] Protected page failed", error.digest ?? error.name); }, [error]);
  return <main className="error-state panel"><span>!</span><p className="eyebrow">NO SE HA PODIDO COMPLETAR</p><h1>La operación no terminó correctamente</h1><p>Tus datos permanecen intactos. Puedes volver a intentarlo o regresar al panel.</p><div className="header-actions"><button className="primary-button" onClick={reset}>Reintentar</button><Link href="/dashboard" className="secondary-button button-link">Volver al inicio</Link></div></main>;
}
