import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { z } from "zod";
import { database } from "./pool.ts";

const tenantIdSchema = z.uuid();

export type TenantDatabase = {
  query<T extends QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

export async function withTenant<T>(tenantId: string, operation: (db: TenantDatabase) => Promise<T>,snapshot=false): Promise<T> {
  const safeTenantId = tenantIdSchema.parse(tenantId);
  const client: PoolClient = await database.connect();
  try {
    await client.query(snapshot?"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY":"BEGIN");
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [safeTenantId]);
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const value = await operation({ query: (text, values) => client.query(text, values as unknown[] | undefined) });
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
