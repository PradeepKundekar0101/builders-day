import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("encryptJson", () => {
  test("round-trips a value", () => {
    const value = { "{{PII_EMAIL_1}}": "asha@x.in" };
    expect(decryptJson(encryptJson(value, key), key)).toEqual(value);
  });

  test("never contains the plaintext", () => {
    expect(encryptJson({ a: "asha@x.in" }, key)).not.toContain("asha");
  });

  test("uses a fresh nonce each time", () => {
    expect(encryptJson({ a: 1 }, key)).not.toBe(encryptJson({ a: 1 }, key));
  });

  test("rejects a tampered ciphertext", () => {
    const sealed = encryptJson({ a: 1 }, key);
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptJson(tampered, key)).toThrow();
  });

  test("rejects a key that is not 32 bytes", () => {
    expect(() => encryptJson({}, randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
