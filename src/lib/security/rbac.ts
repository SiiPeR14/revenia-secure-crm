import { z } from "zod";

export const roles = ["OWNER", "ADMIN", "MANAGER", "SALES", "EMPLOYEE", "VIEWER"] as const;
export const roleSchema = z.enum(roles);
export type Role = typeof roles[number];
export type Permission = "tenant:manage" | "user:manage" | "crm:read" | "crm:write" | "invoice:read" | "invoice:write" | "billing:manage" | "security:read";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(["tenant:manage", "user:manage", "crm:read", "crm:write", "invoice:read", "invoice:write", "billing:manage", "security:read"]),
  ADMIN: new Set(["user:manage", "crm:read", "crm:write", "invoice:read", "invoice:write", "security:read"]),
  MANAGER: new Set(["crm:read", "crm:write", "invoice:read", "invoice:write"]),
  SALES: new Set(["crm:read", "crm:write", "invoice:read"]),
  EMPLOYEE: new Set(["crm:read", "invoice:read"]),
  VIEWER: new Set(["crm:read", "invoice:read"]),
};

export function can(role: Role, permission: Permission) { return permissions[role].has(permission); }
export function requirePermission(role: Role, permission: Permission) { if (!can(role, permission)) throw new AuthorizationError(permission); }
export class AuthorizationError extends Error { constructor(permission: Permission) { super(`Permiso denegado: ${permission}`); this.name = "AuthorizationError"; } }
