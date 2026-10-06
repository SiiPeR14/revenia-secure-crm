import { database } from "./pool";
import { roleSchema, type Role } from "@/lib/security/rbac";

type LoginRow = { user_id: string; email: string; password_hash: string; session_version: number; tenant_id: string; role: string };

export async function findLoginUser(email: string) {
  const result = await database.query<LoginRow>("SELECT * FROM revenia_login_lookup($1)", [email]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, role: roleSchema.parse(row.role) } satisfies Omit<LoginRow, "role"> & { role: Role };
}
