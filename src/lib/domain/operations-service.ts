import { withTenant } from "@/lib/db/tenant-transaction";

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

export async function getNavigationCounts(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ messages:number; notifications:number }>(
    `SELECT (SELECT count(*)::int FROM conversations WHERE direction='Entrada' AND read_at IS NULL) messages,
            (SELECT count(*)::int FROM notifications WHERE read_at IS NULL) notifications`,
  )).rows[0]!);
}

export async function getPipelineStages(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ stage:string; count:number; amount:string }>(
    "SELECT stage,count(*)::int count,coalesce(sum(amount),0)::text amount FROM opportunities GROUP BY stage",
  )).rows);
}

export async function getInbox(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const messages = await
      db.query<{ id:string; client_id:string|null; client:string|null; company:string|null; channel:string; direction:string; body:string; delivery_status:string; subject:string; sender_address:string|null; read_at:Date|null; created_at:Date }>(
        "SELECT m.id,m.client_id,c.name client,c.company,m.channel,m.direction,m.body,m.delivery_status,m.subject,m.sender_address,m.read_at,m.created_at FROM conversations m LEFT JOIN clients c ON c.id=m.client_id ORDER BY m.created_at DESC LIMIT 100",
      );
    const clients = await db.query<{ id:string; name:string; company:string }>("SELECT id,name,company FROM clients WHERE archived_at IS NULL ORDER BY name");
    return {
      clients: clients.rows,
      messages: messages.rows.map((row) => ({ ...row, createdAt: dateTime.format(row.created_at), unread: !row.read_at && row.direction === "Entrada" })),
    };
  });
}

export async function getAutomations(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; name:string; trigger_name:string; enabled:boolean; executions:number; trigger_type:string|null; delay_days:number; updated_at:Date }>(
    "SELECT id,name,trigger_name,enabled,executions,trigger_type,delay_days,updated_at FROM automations ORDER BY name",
  )).rows);
}

export async function getIntegrations(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; provider:string; status:string; last_synced_at:Date|null }>(
    "SELECT id,provider,status,last_synced_at FROM integrations ORDER BY provider",
  )).rows.map((row) => ({ ...row, lastSync: row.last_synced_at ? dateTime.format(row.last_synced_at) : "Nunca" })));
}

export async function getNotifications(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; title:string; detail:string; href:string; read_at:Date|null; created_at:Date }>(
    "SELECT id,title,detail,href,read_at,created_at FROM notifications ORDER BY created_at DESC LIMIT 100",
  )).rows.map((row) => ({ ...row, createdAt: dateTime.format(row.created_at), unread: !row.read_at })));
}

export async function getRecoveryOpportunities(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; title:string; client:string|null; amount:string; probability:number; stage:string; next_action_at:Date|null }>(
    `SELECT o.id,o.title,c.name client,o.amount,o.probability,o.stage,o.next_action_at
     FROM opportunities o LEFT JOIN clients c ON c.id=o.client_id
     WHERE o.stage NOT IN ('Ganada','Perdida')
     ORDER BY (o.amount * (100-o.probability)) DESC`,
  )).rows.map((row) => ({ ...row, formattedAmount: money.format(Number(row.amount)), nextAction: row.next_action_at ? dateTime.format(row.next_action_at) : "Sin programar" })));
}

export async function getAnalytics(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const clients = await db.query<{ total:string }>("SELECT count(*) total FROM clients WHERE archived_at IS NULL");
    const opportunities = await db.query<{ count:string; total:string; weighted:string }>("SELECT count(*) count,coalesce(sum(amount),0) total,coalesce(sum(amount*probability/100),0) weighted FROM opportunities WHERE stage NOT IN ('Ganada','Perdida')");
    const quotes = await db.query<{ count:string; accepted:string; total:string }>("SELECT count(*) count,count(*) FILTER (WHERE status='Aceptado') accepted,coalesce(sum(amount),0) total FROM quotes");
    const invoices = await db.query<{ total:string; paid:string; overdue:string }>("SELECT coalesce(sum(amount),0) total,coalesce(sum(amount) FILTER (WHERE status='Pagada'),0) paid,coalesce(sum(amount) FILTER (WHERE status='Vencida'),0) overdue FROM invoices");
    const tasks = await db.query<{ pending:string; completed:string }>("SELECT count(*) FILTER (WHERE status='Pendiente') pending,count(*) FILTER (WHERE status='Completada') completed FROM tasks");
    const quoteCount = Number(quotes.rows[0]?.count ?? 0);
    const accepted = Number(quotes.rows[0]?.accepted ?? 0);
    return {
      clients: Number(clients.rows[0]?.total ?? 0),
      opportunities: Number(opportunities.rows[0]?.count ?? 0),
      pipeline: money.format(Number(opportunities.rows[0]?.total ?? 0)),
      forecast: money.format(Number(opportunities.rows[0]?.weighted ?? 0)),
      quotes: quoteCount,
      conversion: quoteCount ? Math.round((accepted / quoteCount) * 100) : 0,
      invoiced: money.format(Number(invoices.rows[0]?.total ?? 0)),
      collected: money.format(Number(invoices.rows[0]?.paid ?? 0)),
      overdue: money.format(Number(invoices.rows[0]?.overdue ?? 0)),
      pendingTasks: Number(tasks.rows[0]?.pending ?? 0),
      completedTasks: Number(tasks.rows[0]?.completed ?? 0),
    };
  });
}

export async function getPreferences(tenantId: string) {
  return withTenant(tenantId, async (db) => {
    const result = await db.query<{ timezone:string; locale:string; currency:string; email_notifications:boolean; weekly_digest:boolean }>(
      "SELECT timezone,locale,currency,email_notifications,weekly_digest FROM tenant_preferences LIMIT 1",
    );
    return result.rows[0] ?? { timezone: "Europe/Madrid", locale: "es-ES", currency: "EUR", email_notifications: true, weekly_digest: true };
  });
}

export async function getAuditEvents(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; action:string; resource_type:string; resource_id:string; created_at:Date }>(
    "SELECT id::text,action,resource_type,resource_id,created_at FROM audit_logs ORDER BY id DESC LIMIT 20",
  )).rows.map((row) => ({ ...row, createdAt: dateTime.format(row.created_at) })));
}
