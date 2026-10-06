import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

type EncryptedValue = { version: 1; algorithm: "aes-256-gcm"; iv: string; tag: string; ciphertext: string };

function keyFromHex(hex: string) { const key = Buffer.from(hex, "hex"); if (key.length !== 32) throw new Error("La clave debe tener 32 bytes"); return key; }
export function encryptValue(plaintext: string, keyHex: string, context: string): EncryptedValue {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", keyFromHex(keyHex), iv); cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { version: 1, algorithm: "aes-256-gcm", iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}
export function decryptValue(value: EncryptedValue, keyHex: string, context: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFromHex(keyHex), Buffer.from(value.iv, "base64url"));
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
