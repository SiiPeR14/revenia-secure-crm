import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password.ts";
import { createSessionToken, verifySessionToken } from "./session.ts";
import { decryptValue, encryptValue } from "./encryption.ts";
import { appendAudit, verifyAuditChain, type AuditRecord } from "./audit-chain.ts";
import { can } from "./rbac.ts";
import { MemoryRateLimiter } from "./rate-limit.ts";
import { isTrustedOrigin } from "./request.ts";

describe("security primitives", () => {
  it("hashes and verifies passwords without storing the original", async () => {
    const hash = await hashPassword("StrongLocal!2026");
    assert.equal(hash.includes("StrongLocal!2026"), false);
    assert.equal(await verifyPassword("StrongLocal!2026", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });
  it("rejects modified or expired session tokens", () => {
    const token = createSessionToken({ userId: "u1", tenantId: "t1", role: "OWNER", sessionVersion: 1 });
    assert.equal(verifySessionToken(token)?.tenantId, "t1");
    assert.equal(verifySessionToken(`${token}x`), null);
    assert.equal(verifySessionToken(createSessionToken({ userId: "u1", tenantId: "t1", role: "OWNER", sessionVersion: 1 }, -1)), null);
  });
  it("binds encrypted data to its tenant context", () => {
    const key = "a".repeat(64);
    const encrypted = encryptValue("ES1200000000000000000000", key, "tenant-a:iban");
    assert.equal(decryptValue(encrypted, key, "tenant-a:iban"), "ES1200000000000000000000");
    assert.throws(() => decryptValue(encrypted, key, "tenant-b:iban"));
  });
  it("detects audit log tampering", () => {
    const chain: AuditRecord[] = [];
    chain.push(appendAudit(chain, { tenantId: "t1", actorId: "u1", action: "invoice.create", resourceId: "i1", timestamp: "2026-09-08T12:00:00Z" }));
    chain.push(appendAudit(chain, { tenantId: "t1", actorId: "u1", action: "invoice.pay", resourceId: "i1", timestamp: "2026-09-08T12:01:00Z" }));
    assert.equal(verifyAuditChain(chain), true);
    const altered = chain.map((item) => ({ ...item }));
    altered[0]!.action = "invoice.delete";
    assert.equal(verifyAuditChain(altered), false);
  });
  it("enforces the role matrix", () => {
    assert.equal(can("OWNER", "billing:manage"), true);
    assert.equal(can("SALES", "billing:manage"), false);
    assert.equal(can("VIEWER", "crm:write"), false);
  });
  it("blocks repeated login failures", () => {
    const limiter = new MemoryRateLimiter(3, 1_000);
    limiter.fail("key", 0); limiter.fail("key", 0);
    assert.equal(limiter.check("key", 0), true);
    limiter.fail("key", 0);
    assert.equal(limiter.check("key", 500), false);
    assert.equal(limiter.check("key", 1_001), true);
  });
  it("accepts same-origin requests and rejects external origins", () => {
    const sameOrigin = new Request("http://internal:3000/api/auth/login", { headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" } });
    const external = new Request("http://internal:3000/api/auth/login", { headers: { origin: "https://attacker.example", host: "127.0.0.1:3000" } });
    assert.equal(isTrustedOrigin(sameOrigin,'http://127.0.0.1:3000'), true);
    assert.equal(isTrustedOrigin(external,'http://127.0.0.1:3000'), false);
  });
  it('does not trust a forged forwarded host or a downgraded origin',()=>{
    const forged=new Request('https://crm.example.test/api/auth/login',{headers:{origin:'https://attacker.example','x-forwarded-host':'attacker.example'}});
    const downgraded=new Request('https://crm.example.test/api/auth/login',{headers:{origin:'http://crm.example.test'}});
    assert.equal(isTrustedOrigin(forged,'https://crm.example.test'),false);assert.equal(isTrustedOrigin(downgraded,'https://crm.example.test'),false);
  });
});
