import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("La contraseña debe tener al menos 12 caracteres");
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, saltText, expectedText] = encoded.split("$");
    if (algorithm !== "scrypt" || !saltText || !expectedText) return false;
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(expectedText, "base64url");
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
