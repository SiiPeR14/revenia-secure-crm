import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionClaims } from "@/lib/security/session";
import { readStoredSession } from "@/lib/db/session-store";

export async function getCurrentSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get("revenia_session")?.value;
  return token ? readStoredSession(token) : null;
}

export async function requireSession(): Promise<SessionClaims> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}
