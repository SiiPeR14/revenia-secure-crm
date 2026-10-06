import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isTrustedOrigin } from "@/lib/security/request";
import { revokeStoredSession } from "@/lib/db/session-store";

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const token = (await cookies()).get("revenia_session")?.value;
  if (token) {
    try {
      await revokeStoredSession(token);
    } catch {
      return NextResponse.json({ error: "No se pudo cerrar la sesión de forma segura. Inténtalo de nuevo." }, { status: 503 });
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("revenia_session", "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
