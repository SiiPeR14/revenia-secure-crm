import { dashboard } from "./fixtures.ts";
import { assertTenantAccess } from "../security/tenant.ts";
export function getDashboardForTenant(tenantId: string) { return assertTenantAccess(tenantId, dashboard); }
