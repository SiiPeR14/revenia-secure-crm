import { withTenant } from "@/lib/db/tenant-transaction";

export type WorkspaceRow = { id: string; cells: string[]; status?: string; invoiceId?:string|null };

export const moduleDefinitions = {
  clientes: { eyebrow: "CRM", title: "Clientes", description: "Personas y empresas con todo su contexto comercial.", action: "Nuevo cliente", actionHref: "/clientes?nuevo=1", columns: ["Cliente", "Empresa", "Contacto", "Estado", "Valor"] },
  oportunidades: { eyebrow: "PIPELINE", title: "Oportunidades", description: "Controla cada negociación desde la prospección hasta el cierre.", action: "Nueva oportunidad", actionHref: "/oportunidades?nuevo=1", columns: ["Oportunidad", "Cliente", "Etapa", "Importe", "Probabilidad"] },
  presupuestos: { eyebrow: "VENTAS", title: "Presupuestos", description: "Crea, envía y recupera propuestas antes de que se enfríen.", action: "Nuevo presupuesto", actionHref: "/presupuestos?nuevo=1", columns: ["Número", "Cliente", "Importe", "Estado", "Caducidad"] },
  tareas: { eyebrow: "PRODUCTIVIDAD", title: "Tareas", description: "Organiza llamadas, mensajes y seguimientos del equipo.", action: "Nueva tarea", actionHref: "/tareas?nuevo=1", columns: ["Tarea", "Cliente", "Canal", "Estado", "Vencimiento"] },
  pagos: { eyebrow: "COBROS", title: "Pagos", description: "Supervisa cobros completados, pendientes y fallidos.", action: "Ver facturas", actionHref: "/facturas", columns: ["Referencia", "Factura", "Importe", "Estado", "Fecha"] },
} as const;

export type WorkspaceModule = keyof typeof moduleDefinitions;

const money = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const day = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" });

function date(value: string | Date | null) { return value ? day.format(new Date(value)) : "Sin fecha"; }

export async function getWorkspaceRows(tenantId: string, module: WorkspaceModule): Promise<WorkspaceRow[]> {
  return withTenant(tenantId, async (db) => {
    if (module === "clientes") {
      const result = await db.query<{ id:string; name:string; company:string; email:string; status:string; value:string }>("SELECT id,name,company,email,status,value FROM clients WHERE archived_at IS NULL ORDER BY updated_at DESC");
      return result.rows.map((row) => ({ id: row.id, cells: [row.name,row.company,row.email,row.status,money.format(Number(row.value))], status: row.status }));
    }
    if (module === "oportunidades") {
      const result = await db.query<{ id:string; title:string; client:string|null; stage:string; amount:string; probability:number }>("SELECT o.id,o.title,c.name client,o.stage,o.amount,o.probability FROM opportunities o LEFT JOIN clients c ON c.id=o.client_id ORDER BY o.updated_at DESC");
      return result.rows.map((row) => ({ id: row.id, cells: [row.title,row.client ?? "Sin cliente",row.stage,money.format(Number(row.amount)),`${row.probability}%`], status: row.stage }));
    }
    if (module === "presupuestos") {
      const result = await db.query<{ id:string; number:string; client:string|null; amount:string; status:string; expires_at:string }>("SELECT q.id,q.number,c.name client,q.amount,q.status,q.expires_at::text FROM quotes q LEFT JOIN clients c ON c.id=q.client_id ORDER BY q.updated_at DESC");
      return result.rows.map((row) => ({ id: row.id, cells: [row.number,row.client ?? "Sin cliente",money.format(Number(row.amount)),row.status,date(row.expires_at)], status: row.status }));
    }
    if (module === "tareas") {
      const result = await db.query<{ id:string; title:string; client:string|null; channel:string; status:string; due_at:Date; invoice_id:string|null }>("SELECT t.id,t.title,coalesce(c.name,i.customer) client,t.channel,t.status,t.due_at,t.invoice_id FROM tasks t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN invoices i ON i.id=t.invoice_id AND i.tenant_id=t.tenant_id ORDER BY t.status DESC,t.due_at ASC");
      return result.rows.map((row) => ({ id: row.id, cells: [row.title,row.client ?? "General",row.channel,row.status,date(row.due_at)], status: row.status, invoiceId:row.invoice_id }));
    }
    const result = await db.query<{ id:string; reference:string; invoice:string|null; amount:string; status:string; paid_at:Date|null; created_at:Date }>("SELECT p.id,p.reference,i.number invoice,p.amount,p.status,p.paid_at,p.created_at FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id ORDER BY p.created_at DESC");
    return result.rows.map((row) => ({ id: row.id, cells: [row.reference,row.invoice ?? "Sin factura",money.format(Number(row.amount)),row.status,date(row.paid_at ?? row.created_at)], status: row.status }));
  });
}

export async function getClientOptions(tenantId: string) {
  return withTenant(tenantId, async (db) => (await db.query<{ id:string; name:string }>("SELECT id,name FROM clients WHERE archived_at IS NULL ORDER BY name")).rows);
}

export async function searchWorkspace(tenantId: string, query: string) {
  const safeQuery = query.trim().slice(0, 100);
  if (safeQuery.length < 2) return [];
  return withTenant(tenantId, async (db) => {
    const pattern = `%${safeQuery}%`;
    const result = await db.query<{ type:string; title:string; detail:string; href:string }>(
      `SELECT 'Cliente' type,name title,company detail,'/clientes' href FROM clients WHERE archived_at IS NULL AND (name ILIKE $1 OR company ILIKE $1)
       UNION ALL SELECT 'Oportunidad',title,stage,'/oportunidades' FROM opportunities WHERE title ILIKE $1
       UNION ALL SELECT 'Presupuesto',number,status,'/presupuestos' FROM quotes WHERE number ILIKE $1
       UNION ALL SELECT 'Factura',number,customer,'/facturas' FROM invoices WHERE number ILIKE $1 OR customer ILIKE $1
       LIMIT 30`, [pattern],
    );
    return result.rows;
  });
}
