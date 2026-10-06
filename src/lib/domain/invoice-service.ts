import { withTenant } from "@/lib/db/tenant-transaction";

type InvoiceRow = {
  id: string;
  tenant_id: string;
  number: string;
  customer: string;
  amount: string;
  status: string;
  issued_at: string;
  due_at: string;
  source: string;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export async function getInvoicesForTenant(tenantId: string, status?: string) {
  return withTenant(tenantId, async (db) => {
    const result = await db.query<InvoiceRow>(
      `SELECT id, tenant_id, number, customer, amount, status, issued_at::text, due_at::text, source
       FROM invoices
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY issued_at DESC, number ASC`,
      [status ?? null],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      number: row.number,
      customer: row.customer,
      amount: Number(row.amount),
      status: row.status,
      issuedAt: formatDate(row.issued_at),
      dueAt: formatDate(row.due_at),
      source: row.source,
    }));
  });
}
