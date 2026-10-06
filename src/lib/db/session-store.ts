import { createHash, randomBytes } from "node:crypto";
import { database } from "./pool.ts";
import type { SessionClaims } from "../security/session.ts";
import { roleSchema } from "../security/rbac.ts";

type StoredSession = { user_id: string; tenant_id: string; role: SessionClaims["role"]; session_version: number; expires_at: Date };

function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function createStoredSession(input: Omit<SessionClaims, "issuedAt" | "expiresAt">, ttlSeconds = 28_800) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);
  await database.query("SELECT revenia_create_session($1, $2, $3, $4, $5, $6)", [hashToken(token), input.userId, input.tenantId, input.role, input.sessionVersion, expiresAt]);
  return { token, expiresAt };
}

export async function readStoredSession(token: string): Promise<SessionClaims | null> {
  if (token.length < 40 || token.length > 100) return null;
  const result = await database.query<StoredSession>("SELECT * FROM revenia_session_lookup($1)", [hashToken(token)]);
  const row = result.rows[0];
  if (!row) return null;
  const role = roleSchema.safeParse(row.role);
  if (!role.success) return null;
  return { userId: row.user_id, tenantId: row.tenant_id, role: role.data, sessionVersion: row.session_version, issuedAt: 0, expiresAt: Math.floor(row.expires_at.getTime() / 1_000) };
}

export async function revokeStoredSession(token: string) {
  if (token.length >= 40 && token.length <= 100) await database.query("SELECT revenia_revoke_session($1)", [hashToken(token)]);
}
