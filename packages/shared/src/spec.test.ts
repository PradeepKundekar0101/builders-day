import { describe, expect, test } from "vitest";
import { SpecSchema, type Spec } from "./index";

const valid: Spec = {
  name: "Tiffin Tracker",
  summary: "Track tiffin orders",
  pages: [{ name: "Home", purpose: "Landing", mustHave: true }],
  entities: [
    {
      name: "order",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "customer_name", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email", "google"] },
  integrations: [{ kind: "payment_pinelabs", mustHave: true }],
};

const entity = valid.entities[0]!;

describe("SpecSchema", () => {
  test("accepts a valid spec", () => {
    expect(SpecSchema.parse(valid)).toEqual(valid);
  });

  test("rejects entity names that are not snake_case identifiers", () => {
    expect(() =>
      SpecSchema.parse({ ...valid, entities: [{ ...entity, name: "Order Items" }] }),
    ).toThrow();
  });

  test.each(["id", "user_id", "created_at"])("rejects reserved field name %s", (name) => {
    const fields = [{ name, type: "text", required: true }];
    expect(() => SpecSchema.parse({ ...valid, entities: [{ ...entity, fields }] })).toThrow();
  });

  test("rejects duplicate entity names", () => {
    expect(() => SpecSchema.parse({ ...valid, entities: [entity, entity] })).toThrow();
  });

  test("rejects auth.enabled with empty providers", () => {
    expect(() => SpecSchema.parse({ ...valid, auth: { enabled: true, providers: [] } })).toThrow();
  });

  test("rejects ownerScoped: false", () => {
    expect(() =>
      SpecSchema.parse({ ...valid, entities: [{ ...entity, ownerScoped: false }] }),
    ).toThrow();
  });

  test("rejects empty pages array", () => {
    expect(() => SpecSchema.parse({ ...valid, pages: [] })).toThrow();
  });

  test("rejects sampleData over 10000 chars", () => {
    expect(() => SpecSchema.parse({ ...valid, sampleData: "x".repeat(10_001) })).toThrow();
  });
});
