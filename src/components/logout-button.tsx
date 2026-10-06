"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/login"); router.refresh();
    } catch {
      setError("No se pudo cerrar la sesión. Vuelve a intentarlo.");
    } finally {
      setPending(false);
    }
  }
  return <><button className="logout" onClick={logout} disabled={pending} aria-label="Cerrar sesión">{pending ? "Saliendo…" : "Salir"}</button>{error ? <span role="alert">{error}</span> : null}</>;
}
