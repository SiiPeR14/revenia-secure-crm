import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { withTenant } from "./tenant-transaction.ts";
import { closeDatabase } from "./pool.ts";

const NOVATECH = "11111111-1111-4111-8111-111111111111";
const RIVAL = "22222222-2222-4222-8222-222222222222";

after(async () => closeDatabase());

describe("PostgreSQL row level security", () => {
  it("returns only the current tenant invoices", async () => {
    const rows = await withTenant(NOVATECH, async (db) => (await db.query<{ tenant_id: string; number: string }>("SELECT tenant_id, number FROM invoices ORDER BY number")).rows);
    assert.ok(rows.length >= 5, "The seeded invoices remain present alongside user-created invoices");
    assert.equal(rows.every((row) => row.tenant_id === NOVATECH), true);
    assert.equal(rows.some((row) => row.number === "FAC-PRIVATE-001"), false);
  });
  it("cannot select or insert another tenant through the app role", async () => {
    const rows = await withTenant(NOVATECH, async (db) => (await db.query("SELECT id FROM invoices WHERE tenant_id = $1", [RIVAL])).rows);
    assert.equal(rows.length, 0);
    await assert.rejects(() => withTenant(NOVATECH, async (db) => db.query("INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES (gen_random_uuid(),$1,'ATTACK-1','Blocked',1,'Pendiente',CURRENT_DATE,CURRENT_DATE,'test')", [RIVAL])));
  });
  it("app credentials are not database administrators", async () => {
    const { Client } = pg;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query<{ rolsuper: boolean; rolcreaterole: boolean }>("SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user");
      assert.equal(result.rows[0]?.rolsuper, false);
      assert.equal(result.rows[0]?.rolcreaterole, false);
    } finally { await client.end(); }
  });
  it("denies direct access to identities and stored sessions", async () => {
    const { Client } = pg;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(() => client.query("SELECT email FROM users"), /permission denied/i);
      await assert.rejects(() => client.query("SELECT token_hash FROM sessions"), /permission denied/i);
    } finally { await client.end(); }
  });
  it("blocks relationships that point to a different tenant", async () => {
    await assert.rejects(() => withTenant(NOVATECH, async (db) => db.query(
      "INSERT INTO opportunities(tenant_id,client_id,title,stage,amount,probability) VALUES ($1,$2,'Cross tenant','Prospección',100,10)",
      [NOVATECH,"39999999-0000-4000-8000-000000000001"],
    )), /foreign key/i);
  });
  it("isolates workspace preferences with row level security", async () => {
    const own = await withTenant(NOVATECH, async (db) => (await db.query("SELECT tenant_id FROM tenant_preferences")).rows);
    const other = await withTenant(RIVAL, async (db) => (await db.query("SELECT tenant_id FROM tenant_preferences")).rows);
    assert.equal(own.length, 1);
    assert.equal(other.length, 0);
  });
});
