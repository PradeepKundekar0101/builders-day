import { describe, expect, test } from "vitest";
import { flagReasons, type Spec } from "./index";

const base: Spec = {
  name: "Notes",
  summary: "Personal notes",
  pages: [{ name: "Home", purpose: "List", mustHave: true }],
  entities: [
    {
      name: "note",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "body", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
};

describe("flagReasons", () => {
  test("a plain spec under the threshold is not flagged", () => {
    expect(flagReasons(base, 4.96)).toEqual([]);
  });

  test("Pine Labs payment is flagged even as a nice-to-have", () => {
    const spec = {
      ...base,
      integrations: [{ kind: "payment_pinelabs" as const, mustHave: false }],
    };
    expect(flagReasons(spec, 4.96)).toEqual(["payment"]);
  });

  test.each([
    ["email", "text", "contact"],
    ["text", "text", "customer_phone"],
    ["text", "text", "home_address"],
    ["date", "date", "date_of_birth"],
    ["text", "text", "aadhaar_number"],
    ["text", "text", "pan_card"],
  ] as const)("field %s/%s %s counts as personal data", (type, _t, name) => {
    const spec: Spec = {
      ...base,
      entities: [{ ...base.entities[0]!, fields: [{ name, type, required: true }] }],
    };
    expect(flagReasons(spec, 4.96)).toEqual(["third_party_personal_data"]);
  });

  test("ordinary field names are not personal data", () => {
    const spec: Spec = {
      ...base,
      entities: [
        {
          ...base.entities[0]!,
          fields: [
            { name: "company_name", type: "text", required: true },
            { name: "span_minutes", type: "number", required: false },
          ],
        },
      ],
    };
    expect(flagReasons(spec, 4.96)).toEqual([]);
  });

  test("an estimate above $25 is flagged, exactly $25 is not", () => {
    expect(flagReasons(base, 25.01)).toEqual(["over_budget_threshold"]);
    expect(flagReasons(base, 25)).toEqual([]);
  });
});
