import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes, base64-encoded");
  return key;
}

/** AES-256-GCM; output is base64(nonce | tag | ciphertext). */
export function encryptJson(value: unknown, base64Key: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(base64Key), nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptJson<T>(sealed: string, base64Key: string): T {
  const bytes = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(base64Key), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
