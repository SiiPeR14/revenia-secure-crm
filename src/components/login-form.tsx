"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recoveryAvailable } from "@/lib/auth/recovery-delivery";

export function LoginForm({demo}:{demo?:{email:string;password:string}}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true); setError("");
    try {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setPending(false);
    if (!response.ok) { setError(body.error ?? "No se pudo iniciar sesión"); return; }
    router.replace("/dashboard"); router.refresh();
    } catch {
      setError("No se pudo conectar con Revenia. Comprueba la conexión e inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return <section className="login-card"><div><p className="eyebrow">{demo?'ACCESO LOCAL SEGURO':'ACCESO A REVENIA'}</p><h2>Bienvenido de nuevo</h2><p>{demo?'Accede al entorno de demostración de NovaTech Solutions.':'Accede al espacio de trabajo de tu empresa.'}</p></div><form action={submit}><label>Correo electrónico<input name="email" type="email" defaultValue={demo?.email??''} autoComplete="username" required /></label><label>Contraseña<input name="password" type="password" defaultValue={demo?.password??''} autoComplete="current-password" minLength={12} required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="primary-button login-button" disabled={pending}>{pending ? "Verificando…" : "Entrar en Revenia →"}</button></form>{demo?<p className="login-note">Credenciales ficticias válidas solo en este entorno local.</p>:null}{recoveryAvailable()?<Link className="login-recovery-link" href="/recuperar-acceso">¿Has olvidado tu contraseña?</Link>:null}</section>;
}
