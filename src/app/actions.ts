"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/current-session";
import { withTenant } from "@/lib/db/tenant-transaction";
import { recordAudit } from "@/lib/db/audit-repository";
import { requirePermission } from "@/lib/security/rbac";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const email = z.string().trim().toLowerCase().email().max(200);
const amount = z.string().trim().regex(/^\d{1,11}(?:[.,]\d{1,2})?$/).transform((value) => Number(value.replace(",", ".")));
const uuid = z.uuid();

function data(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function validated<T>(schema: z.ZodType<T>, formData: FormData, returnTo: string): T {
  const result = schema.safeParse(data(formData));
  if (!result.success) {
    const separator = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${separator}error=${encodeURIComponent("Revisa los campos indicados e inténtalo de nuevo.")}`);
  }
  return result.data;
}

export async function createClient(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ name: text(2,120), company: text(2,160), email, phone: z.string().trim().max(40), value: amount }), formData, "/clientes?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO clients(tenant_id,name,company,email,phone,value) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [session.tenantId,input.name,input.company,input.email,input.phone,input.value]);
    await recordAudit(db, session, "client.created", "client", result.rows[0]!.id, { name: input.name });
  });
  revalidatePath("/clientes");
  redirect("/clientes?creado=1");
}

export async function createOpportunity(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ title:text(2,160), clientId:z.union([uuid,z.literal("")]), stage:z.enum(["Prospección","Calificación","Propuesta","Negociación"]), amount, probability:z.coerce.number().int().min(0).max(100) }), formData, "/oportunidades?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO opportunities(tenant_id,client_id,title,stage,amount,probability,next_action_at) VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,now()+interval '1 day') RETURNING id", [session.tenantId,input.clientId,input.title,input.stage,input.amount,input.probability]);
    await recordAudit(db, session, "opportunity.created", "opportunity", result.rows[0]!.id, { title: input.title, stage: input.stage });
  });
  revalidatePath("/oportunidades"); revalidatePath("/dashboard");
  redirect("/oportunidades?creado=1");
}

export async function createQuote(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ number:text(1,50), clientId:z.union([uuid,z.literal("")]), amount, status:z.enum(["Borrador","Enviado","Visto","Seguimiento"]), issuedAt:z.iso.date(), expiresAt:z.iso.date() }).refine((value) => value.expiresAt >= value.issuedAt, { message:"La caducidad debe ser posterior" }), formData, "/presupuestos?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO quotes(tenant_id,client_id,number,amount,status,issued_at,expires_at) VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5,$6,$7) RETURNING id", [session.tenantId,input.clientId,input.number,input.amount,input.status,input.issuedAt,input.expiresAt]);
    await recordAudit(db, session, "quote.created", "quote", result.rows[0]!.id, { number: input.number });
  });
  revalidatePath("/presupuestos");
  redirect("/presupuestos?creado=1");
}

export async function createTask(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ title:text(2,200), clientId:z.union([uuid,z.literal("")]), channel:z.enum(["Tarea","Llamada","Email","WhatsApp"]), dueAt:z.string().datetime({ local:true }) }), formData, "/tareas?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO tasks(tenant_id,client_id,title,channel,due_at) VALUES ($1,NULLIF($2,'')::uuid,$3,$4,$5) RETURNING id", [session.tenantId,input.clientId,input.title,input.channel,input.dueAt]);
    await recordAudit(db, session, "task.created", "task", result.rows[0]!.id, { title: input.title });
  });
  revalidatePath("/tareas");
  redirect("/tareas?creado=1");
}

export async function createInvoice(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "invoice:write");
  const input = validated(z.object({ number:text(1,50), customer:text(2,160), amount, status:z.enum(["Borrador","Pendiente","Pagada","Vencida","En revisión"]), issuedAt:z.iso.date(), dueAt:z.iso.date(), source:text(1,80) }).refine((value) => value.dueAt >= value.issuedAt, { message:"El vencimiento debe ser posterior" }), formData, "/facturas?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [session.tenantId,input.number,input.customer,input.amount,input.status,input.issuedAt,input.dueAt,input.source]);
    await recordAudit(db, session, "invoice.created", "invoice", result.rows[0]!.id, { number: input.number });
  });
  revalidatePath("/facturas");
  redirect("/facturas?creada=1");
}

export async function toggleAutomation(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ id:uuid, enabled:z.enum(["true","false"]) }), formData, "/automatizaciones");
  const enabled = input.enabled === "true";
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("UPDATE automations SET enabled=$1,updated_at=now() WHERE id=$2 RETURNING id", [enabled,input.id]);
    if (!result.rowCount) throw new Error("Automatización no encontrada");
    await recordAudit(db, session, enabled ? "automation.enabled" : "automation.disabled", "automation", input.id);
  });
  revalidatePath("/automatizaciones"); revalidatePath("/dashboard");
  redirect("/automatizaciones?actualizado=1");
}

export async function completeTask(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ id:uuid }), formData, "/tareas");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query("UPDATE tasks SET status='Completada',completed_at=now(),updated_at=now() WHERE id=$1 RETURNING id", [input.id]);
    if (!result.rowCount) throw new Error("Tarea no encontrada");
    await recordAudit(db, session, "task.completed", "task", input.id);
  });
  revalidatePath("/tareas"); revalidatePath("/dashboard");
  redirect("/tareas?actualizado=1");
}

export async function advanceOpportunity(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ id:uuid }), formData, "/oportunidades");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ stage:string }>(`UPDATE opportunities SET stage=CASE stage WHEN 'Prospección' THEN 'Calificación' WHEN 'Calificación' THEN 'Propuesta' WHEN 'Propuesta' THEN 'Negociación' WHEN 'Negociación' THEN 'Ganada' ELSE stage END,probability=CASE stage WHEN 'Prospección' THEN 45 WHEN 'Calificación' THEN 65 WHEN 'Propuesta' THEN 80 WHEN 'Negociación' THEN 100 ELSE probability END,updated_at=now() WHERE id=$1 RETURNING stage`, [input.id]);
    if (!result.rowCount) throw new Error("Oportunidad no encontrada");
    await recordAudit(db, session, "opportunity.advanced", "opportunity", input.id, { stage: result.rows[0]!.stage });
  });
  revalidatePath("/oportunidades"); revalidatePath("/dashboard"); revalidatePath("/recovery");
  redirect("/oportunidades?actualizado=1");
}

export async function acceptQuote(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ id:uuid }), formData, "/presupuestos");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query("UPDATE quotes SET status='Aceptado',updated_at=now() WHERE id=$1 RETURNING id", [input.id]);
    if (!result.rowCount) throw new Error("Presupuesto no encontrado");
    await recordAudit(db, session, "quote.accepted", "quote", input.id);
  });
  revalidatePath("/presupuestos"); revalidatePath("/analytics");
  redirect("/presupuestos?actualizado=1");
}

export async function createRecommendedTask(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ title:text(2,200), channel:z.enum(["Llamada","Email","WhatsApp"]) }), formData, "/dashboard");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO tasks(tenant_id,title,channel,due_at) VALUES ($1,$2,$3,now()) RETURNING id", [session.tenantId,input.title,input.channel]);
    await recordAudit(db, session, "recommendation.accepted", "task", result.rows[0]!.id, { channel: input.channel });
  });
  revalidatePath("/tareas");
  redirect("/tareas?recomendada=1");
}

export async function createAutomation(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ name:text(2,160), triggerName:text(2,160) }), formData, "/automatizaciones?nueva=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO automations(tenant_id,name,trigger_name,enabled) VALUES ($1,$2,$3,true) RETURNING id", [session.tenantId,input.name,input.triggerName]);
    await recordAudit(db, session, "automation.created", "automation", result.rows[0]!.id, { name: input.name });
  });
  revalidatePath("/automatizaciones");
  redirect("/automatizaciones?creado=1");
}

export async function setIntegrationStatus(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "tenant:manage");
  const input = validated(z.object({ id:uuid, connected:z.enum(["true","false"]) }), formData, "/integraciones");
  const connected = input.connected === "true";
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query("UPDATE integrations SET status=$1,last_synced_at=CASE WHEN $1='Conectado' THEN now() ELSE NULL END,updated_at=now() WHERE id=$2 RETURNING provider", [connected ? "Conectado" : "Disponible",input.id]);
    if (!result.rowCount) throw new Error("Integración no encontrada");
    await recordAudit(db, session, connected ? "integration.connected" : "integration.disconnected", "integration", input.id);
  });
  revalidatePath("/integraciones");
  redirect("/integraciones?actualizado=1");
}

export async function sendMessage(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "crm:write");
  const input = validated(z.object({ clientId:uuid, channel:z.enum(["Email","WhatsApp"]), body:text(1,4000), subject:text(1,200).default("Seguimiento comercial") }), formData, "/inbox?nuevo=1");
  await withTenant(session.tenantId, async (db) => {
    const result = await db.query<{ id:string }>("INSERT INTO conversations(tenant_id,client_id,channel,direction,body,read_at,subject) VALUES ($1,$2,$3,'Salida',$4,now(),$5) RETURNING id", [session.tenantId,input.clientId,input.channel,input.body,input.subject]);
    await recordAudit(db, session, "message.draft_saved", "conversation", result.rows[0]!.id, { channel: input.channel });
  });
  revalidatePath("/inbox");
  redirect("/inbox?enviado=1");
}

export async function markInboxRead() {
  const session = await requireSession();
  requirePermission(session.role, "crm:read");
  await withTenant(session.tenantId, async (db) => {
    await db.query("UPDATE conversations SET read_at=now() WHERE direction='Entrada' AND read_at IS NULL");
    await recordAudit(db, session, "inbox.read", "conversation", "all");
  });
  revalidatePath("/", "layout");
  redirect("/inbox?leido=1");
}

export async function updatePreferences(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "tenant:manage");
  const input = validated(z.object({ timezone:z.enum(["Europe/Madrid","Atlantic/Canary","UTC"]), locale:z.enum(["es-ES","en-GB"]), currency:z.enum(["EUR","USD","GBP"]), emailNotifications:z.enum(["on"]).optional(), weeklyDigest:z.enum(["on"]).optional() }), formData, "/configuracion");
  await withTenant(session.tenantId, async (db) => {
    await db.query(`INSERT INTO tenant_preferences(tenant_id,timezone,locale,currency,email_notifications,weekly_digest) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tenant_id) DO UPDATE SET timezone=EXCLUDED.timezone,locale=EXCLUDED.locale,currency=EXCLUDED.currency,email_notifications=EXCLUDED.email_notifications,weekly_digest=EXCLUDED.weekly_digest,updated_at=now()`,
      [session.tenantId,input.timezone,input.locale,input.currency,Boolean(input.emailNotifications),Boolean(input.weeklyDigest)]);
    await recordAudit(db, session, "preferences.updated", "tenant", session.tenantId);
  });
  revalidatePath("/configuracion");
  redirect("/configuracion?guardado=1");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { cell += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += character;
  }
  cells.push(cell.trim());
  if (quoted) throw new Error("CSV con comillas sin cerrar");
  return cells;
}

export async function importInvoices(formData: FormData) {
  const session = await requireSession();
  requirePermission(session.role, "invoice:write");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size || file.size > 1_000_000 || !file.name.toLowerCase().endsWith(".csv")) redirect("/facturas?importar=1&error=Selecciona+un+CSV+de+menos+de+1+MB");
  const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || lines.length > 501) redirect("/facturas?importar=1&error=El+CSV+debe+contener+entre+1+y+500+facturas");
  const expected = ["number","customer","amount","status","issuedAt","dueAt","source"];
  if (JSON.stringify(parseCsvLine(lines[0]!)) !== JSON.stringify(expected)) redirect("/facturas?importar=1&error=Las+columnas+del+CSV+no+son+válidas");
  const rowSchema = z.tuple([text(1,50),text(2,160),amount,z.enum(["Borrador","Pendiente","Pagada","Vencida","En revisión"]),z.iso.date(),z.iso.date(),text(1,80)]).refine((row) => row[5] >= row[4], { message:"Fecha de vencimiento no válida" });
  const parsedRows = z.array(rowSchema).safeParse(lines.slice(1).map((line) => parseCsvLine(line)));
  if (!parsedRows.success) redirect("/facturas?importar=1&error=Alguna+fila+contiene+datos+o+fechas+no+válidos");
  const rows = parsedRows.data;
  await withTenant(session.tenantId, async (db) => {
    for (const row of rows) {
      await db.query(`INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (tenant_id,number) DO UPDATE SET customer=EXCLUDED.customer,amount=EXCLUDED.amount,status=EXCLUDED.status,issued_at=EXCLUDED.issued_at,due_at=EXCLUDED.due_at,source=EXCLUDED.source,updated_at=now()`,
        [session.tenantId,...row]);
    }
    await recordAudit(db, session, "invoice.csv_imported", "invoice", "batch", { count: rows.length });
  });
  revalidatePath("/facturas");
  redirect(`/facturas?importadas=${rows.length}`);
}

export async function markNotificationsRead() {
  const session = await requireSession();
  requirePermission(session.role, "crm:read");
  await withTenant(session.tenantId, async (db) => {
    await db.query("UPDATE notifications SET read_at=now() WHERE read_at IS NULL");
    await recordAudit(db, session, "notifications.read", "notification", "all");
  });
  revalidatePath("/", "layout");
  redirect("/notificaciones?leidas=1");
}
