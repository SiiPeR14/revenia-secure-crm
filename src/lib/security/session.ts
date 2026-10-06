import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./rbac";

export type SessionClaims = { userId: string; tenantId: string; role: Role; sessionVersion: number; issuedAt: number; expiresAt: number };
type NewSession = Omit<SessionClaims, "issuedAt" | "expiresAt">;

function secret() {
  const value = process.env.SESSION_SECRET ?? "development-only-session-secret-that-must-be-replaced-before-production";
  if (process.env.NODE_ENV === "production" && value.includes("development-only")) throw new Error("SESSION_SECRET no configurado");
  return value;
}

function sign(payload: string) { return createHmac("sha256", secret()).update(payload).digest("base64url"); }

export function createSessionToken(input: NewSession, ttlSeconds = 28_800): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ ...input, issuedAt: now, expiresAt: now + ttlSeconds })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const [payload, suppliedSignature, extra] = token.split(".");
    if (!payload || !suppliedSignature || extra) return null;
    const expected = Buffer.from(sign(payload), "base64url");
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (!claims.userId || !claims.tenantId || !claims.role || claims.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}
