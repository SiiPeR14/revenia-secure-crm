import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { invoices } from "./fixtures.ts";
import { getDashboardForTenant } from "./dashboard-service.ts";
import { scopeToTenant } from "../security/tenant.ts";

const NOVATECH = "11111111-1111-4111-8111-111111111111";
const RIVAL = "22222222-2222-4222-8222-222222222222";

describe("tenant isolation", () => {
  it("never returns another company's invoices", () => {
    const records = scopeToTenant(NOVATECH, invoices);
    assert.equal(records.length > 0, true);
    assert.equal(records.every((record) => record.tenantId === NOVATECH), true);
    assert.equal(records.some((record) => record.number === "FAC-PRIVATE-001"), false);
  });
  it("blocks a tenant requesting another dashboard", () => {
    assert.throws(() => getDashboardForTenant(RIVAL), /Acceso cruzado/);
  });
});
