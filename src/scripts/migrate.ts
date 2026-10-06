import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL no está configurado");
const appPassword = process.env.APP_DB_PASSWORD;
if (!appPassword || appPassword.length < 16 || appPassword.length > 200 || appPassword.includes("\0")) {
  throw new Error("APP_DB_PASSWORD debe tener entre 16 y 200 caracteres");
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

const client = new Client({ connectionString, application_name: "revenia-migrations" });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(827364921)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const directory = path.resolve("database/migrations");
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(directory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[DATABASE] Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  await client.query(`ALTER ROLE revenia_app PASSWORD ${sqlLiteral(appPassword)}`);
} finally {
  await client.query("SELECT pg_advisory_unlock(827364921)").catch(() => undefined);
  await client.end();
}
