import { createHash } from "node:crypto";
import type { TenantDatabase } from "./tenant-transaction.ts";
import {canonicalJson} from '../security/canonical-json.ts';

type AuditContext = { tenantId: string; userId: string|null };

export async function recordAudit(
  db: TenantDatabase,
  context: AuditContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [context.tenantId]);
  const previous = await db.query<{ hash: string }>("SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1");
  const previousHash = previous.rows[0]?.hash ?? "0".repeat(64);
  const createdAt = new Date().toISOString();
  const hash = createHash("sha256").update(canonicalJson({ version:2,tenantId: context.tenantId, userId: context.userId, action, resourceType, resourceId, metadata, createdAt, previousHash })).digest("hex");
  await db.query(
    "INSERT INTO audit_logs(tenant_id,actor_id,action,resource_type,resource_id,previous_hash,hash,metadata,created_at,hash_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,2)",
    [context.tenantId, context.userId, action, resourceType, resourceId, previousHash, hash, JSON.stringify(metadata), createdAt],
  );
}
