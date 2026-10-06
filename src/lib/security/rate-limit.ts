type Attempt = { failures: number; blockedUntil: number };
export class MemoryRateLimiter {
  private attempts = new Map<string, Attempt>();
  constructor(private maxFailures = 5, private blockMs = 15 * 60_000) {}
  check(key: string, now = Date.now()) { const state = this.attempts.get(key); return !state || state.blockedUntil <= now; }
  fail(key: string, now = Date.now()) { const current = this.attempts.get(key) ?? { failures: 0, blockedUntil: 0 }; const failures = current.failures + 1; this.attempts.set(key, { failures, blockedUntil: failures >= this.maxFailures ? now + this.blockMs : 0 }); }
  success(key: string) { this.attempts.delete(key); }
}
export const loginLimiter = new MemoryRateLimiter();
