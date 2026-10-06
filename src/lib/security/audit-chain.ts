import { createHash, timingSafeEqual } from "node:crypto";

export type AuditInput = { tenantId: string; actorId: string; action: string; resourceId: string; timestamp: string };
export type AuditRecord = AuditInput & { previousHash: string; hash: string };

function digest(input: AuditInput, previousHash: string) { return createHash("sha256").update(JSON.stringify(input)).update("|").update(previousHash).digest("hex"); }
export function appendAudit(chain: readonly AuditRecord[], input: AuditInput): AuditRecord { const previousHash = chain.at(-1)?.hash ?? "GENESIS"; return { ...input, previousHash, hash: digest(input, previousHash) }; }
export function verifyAuditChain(chain: readonly AuditRecord[]): boolean { let previous = "GENESIS"; for (const record of chain) { const { hash, previousHash, ...input } = record; const expected = Buffer.from(digest(input, previous), "hex"); const supplied = Buffer.from(hash, "hex"); if (previousHash !== previous || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false; previous = hash; } return true; }
