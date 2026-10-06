"use client";

import { useEffect, useRef } from "react";

export function GlobalSearch() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return <form className="search" action="/buscar"><span aria-hidden>⌕</span><input ref={input} name="q" aria-label="Buscar" placeholder="Buscar clientes, oportunidades, presupuestos…" minLength={2}/><kbd>Ctrl K</kbd></form>;
}
