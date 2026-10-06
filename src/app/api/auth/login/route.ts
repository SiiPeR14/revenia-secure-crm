import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/security/password";
import { isTrustedOrigin } from "@/lib/security/request";
import { findLoginUser } from "@/lib/db/auth-repository";
import { createStoredSession } from "@/lib/db/session-store";
import { consumeLoginAttempt, resetLoginAttempts } from "@/lib/redis/login-rate-limit";
import { getDemoPasswordHash } from "@/lib/auth/demo-user";

const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(12).max(200) }).strict();

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Formato no permitido" }, { status: 415 });

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Credenciales no válidas" }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const limit = await consumeLoginAttempt(email);
    if (!limit.allowed) return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });

    const user = await findLoginUser(email);
    const comparisonHash = user?.password_hash ?? await getDemoPasswordHash("Revenia-invalid-login-comparison-only");
    const validPassword = await verifyPassword(parsed.data.password, comparisonHash);
    if (!user || !validPassword) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
    }

    const { token } = await createStoredSession({
      userId: user.user_id,
      tenantId: user.tenant_id,
      role: user.role,
      sessionVersion: user.session_version,
    });
    await resetLoginAttempts(email);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("revenia_session", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
    return response;
  } catch {
    return NextResponse.json({ error: "El servicio de acceso no está disponible temporalmente. Inténtalo de nuevo en unos minutos." }, { status: 503 });
  }
}
