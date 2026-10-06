import pg from "pg";

const { Pool } = pg;
const globalForDatabase = globalThis as unknown as { reveniaPool?: pg.Pool };

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está configurado");
  return url;
}

export const database = globalForDatabase.reveniaPool ?? new Pool({
  connectionString: databaseUrl(),
  max: 10,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 4_000,
  application_name: "revenia-web",
});

if (process.env.NODE_ENV !== "production") globalForDatabase.reveniaPool = database;

database.on("error", () => {
  // Deliberately omit connection details and credentials from logs.
  console.error("[DATABASE] An idle database connection failed");
});

export async function checkDatabase() {
  const result = await database.query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}

export async function closeDatabase() {
  await database.end();
  globalForDatabase.reveniaPool = undefined;
}
