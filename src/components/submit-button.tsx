"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "primary-button", pendingText = "Guardando…", name, value }: { children: React.ReactNode; className?: string; pendingText?: string; name?:string; value?:string }) {
  const { pending } = useFormStatus();
  return <button type="submit" name={name} value={value} className={className} disabled={pending} aria-busy={pending}>{pending ? pendingText : children}</button>;
}
