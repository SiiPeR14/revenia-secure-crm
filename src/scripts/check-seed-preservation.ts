import pg from "pg";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
await db.connect();
try {
  const tables = ["tenants","users","memberships","clients","opportunities","quotes","tasks","invoices","payments","conversations","automations","integrations","notifications","tenant_preferences"];
  const state:Record<string,string> = {};
  for (const table of tables) {
    const rows = await db.query(`SELECT to_jsonb(t)::text value FROM ${table} t ORDER BY to_jsonb(t)::text`);
    state[table] = createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
  }
  const file = process.argv[3];
  if (!file) throw new Error("Provide a snapshot path");
  if (process.argv[2] === "capture") await writeFile(file, JSON.stringify(state));
  else assert.deepEqual(state, JSON.parse(await readFile(file,"utf8")), "Seed must preserve existing data");
  console.log("Seed preservation: " + (process.argv[2] === "capture" ? "snapshot captured" : "14 tables unchanged"));
} finally { await db.end(); }
