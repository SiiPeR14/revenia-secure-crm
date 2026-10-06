export type TenantOwned = { tenantId: string };

export function assertTenantAccess<T extends TenantOwned>(contextTenantId: string, resource: T): T {
  if (!contextTenantId || contextTenantId !== resource.tenantId) throw new TenantIsolationError();
  return resource;
}

export function scopeToTenant<T extends TenantOwned>(contextTenantId: string, resources: readonly T[]): T[] {
  if (!contextTenantId) throw new TenantIsolationError();
  return resources.filter((resource) => resource.tenantId === contextTenantId);
}

export class TenantIsolationError extends Error { constructor() { super("Acceso cruzado entre empresas bloqueado"); this.name = "TenantIsolationError"; } }
