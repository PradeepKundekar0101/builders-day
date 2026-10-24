import { describe, expect, test } from "vitest";
import { luhnValid, mask, unmask, verhoeffValid } from "./index";

describe("checksums", () => {
  test("luhn", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
  });
  test("verhoeff", () => {
    expect(verhoeffValid("234123412346")).toBe(true);
    expect(verhoeffValid("234123412347")).toBe(false);
  });
});

describe("mask", () => {
  test.each([
    ["email", "Mail me at asha.rao@example.com today", "{{PII_EMAIL_1}}"],
    ["Indian mobile", "Call +91 98765 43210 after 6", "{{PII_PHONE_1}}"],
    ["10-digit mobile", "Call 9876543210 please", "{{PII_PHONE_1}}"],
    ["card", "Card 4111 1111 1111 1111 on file", "{{PII_CARD_1}}"],
    ["aadhaar", "Aadhaar 2341 2341 2346 is mine", "{{PII_AADHAAR_1}}"],
    ["openai-style key", "key sk-proj-abcdEFGH1234ijklMNOP5678", "{{SECRET_1}}"],
    ["stripe key", "use sk_live_51Habcdefghijklmnop", "{{SECRET_1}}"],
    ["aws key", "AKIAIOSFODNN7EXAMPLE is the id", "{{SECRET_1}}"],
    ["github token", "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ here", "{{SECRET_1}}"],
    ["google key", "AIzaSyA1234567890abcdefghijklmnopqrstuv", "{{SECRET_1}}"],
    ["jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXZhbHVl", "{{SECRET_1}}"],
    ["key=value secret", "api_key=Zx9Qw8Er7Ty6Ui5Op4 in env", "api_key={{SECRET_1}}"],
  ])("masks %s", (_name, input, placeholder) => {
    const { text, map } = mask(input);
    expect(text).toContain(placeholder);
    expect(Object.keys(map)).toHaveLength(1);
    expect(unmask(text, map)).toBe(input);
  });

  test.each([
    "Price is 4999 rupees for 12 items",
    "Founded in 2026, open 9 to 5",
    "Order #123456 ships in 3 days",
    "Invoice 1234567890123456 total",
    "Reference 234123412347 is not an id",
  ])("leaves ordinary numbers alone: %s", (input) => {
    expect(mask(input)).toEqual({ text: input, map: {} });
  });

  test("the same value gets the same placeholder", () => {
    const { text, map } = mask("a@b.co then a@b.co and c@d.co");
    expect(text).toBe("{{PII_EMAIL_1}} then {{PII_EMAIL_1}} and {{PII_EMAIL_2}}");
    expect(map).toEqual({ "{{PII_EMAIL_1}}": "a@b.co", "{{PII_EMAIL_2}}": "c@d.co" });
  });

  test("an existing map keeps numbering stable across calls", () => {
    const first = mask("a@b.co");
    const second = mask("c@d.co and a@b.co", first.map);
    expect(second.text).toBe("{{PII_EMAIL_2}} and {{PII_EMAIL_1}}");
  });

  test("mixed text round-trips", () => {
    const input = "Email asha@x.in, phone 9876543210, key sk_test_51Habcdefghijklmnop.";
    const { text, map } = mask(input);
    expect(text).not.toMatch(/asha@|9876543210|sk_test/);
    expect(unmask(text, map)).toBe(input);
  });
});
