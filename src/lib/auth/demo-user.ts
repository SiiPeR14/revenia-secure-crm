import { hashPassword } from "@/lib/security/password";

const hashes = new Map<string, Promise<string>>();

export function getDemoPasswordHash(password: string) {
  const existing = hashes.get(password);
  if (existing) return existing;
  const created = hashPassword(password);
  hashes.set(password, created);
  return created;
}
