import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deliverRecovery } from "@/lib/auth/recovery-service";
import { recoveryAvailable, sendRecovery } from "@/lib/auth/recovery-delivery";
import { syncPlatformBilling } from "@/lib/billing/reconcile";
import { claimJob, processJob, scheduleRules } from "@/lib/engines/queue";
import { processWebhookInbox } from "@/lib/engines/events";
import { withTenant } from "@/lib/db/tenant-transaction";

export const runtime = "nodejs";
export const maxDuration = 60;

const tenantIds = z.array(z.uuid()).min(1);

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function heartbeat(tenant: string) {
  await withTenant(tenant, (db) => db.query(
    "INSERT INTO engine_heartbeat(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO UPDATE SET last_seen_at=now()",
    [tenant],
  ));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = tenantIds.safeParse((process.env.WORKER_TENANT_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (!parsed.success) return Response.json({ error: "Worker is not configured" }, { status: 503 });

  const summary: Array<{ tenant: string; scheduled: number; processed: number; webhooks: string; billing: string }> = [];
  try {
    let recovery = 0;
    if (process.env.RECOVERY_MAIL_PROVIDER && recoveryAvailable()) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!await deliverRecovery(sendRecovery)) break;
        recovery += 1;
      }
    }

    for (const tenant of parsed.data) {
      await heartbeat(tenant);
      const billing = await syncPlatformBilling(tenant);
      const webhooks = await processWebhookInbox(tenant, () => false, () => heartbeat(tenant));
      const scheduled = await scheduleRules(tenant);
      let processed = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const job = await claimJob(tenant);
        if (!job) break;
        await processJob(job);
        processed += 1;
        await heartbeat(tenant);
      }
      summary.push({ tenant, scheduled, processed, webhooks: String(webhooks), billing: String(billing) });
    }

    return Response.json({ ok: true, recovery, tenants: summary }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Worker cycle failed", partial: summary.length }, { status: 503 });
  }
}
