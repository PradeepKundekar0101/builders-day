import { describe, expect, test } from "vitest";
import type { Spec } from "@buildwise/shared";
import { defaultSelection, inputFromSelection } from "./index";

const spec: Spec = {
  name: "Tiffin",
  summary: "Orders",
  pages: [
    { name: "Home", purpose: "Landing", mustHave: true },
    { name: "About", purpose: "Story", mustHave: false },
  ],
  entities: [
    {
      name: "order",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "item", type: "text", required: true }],
    },
    {
      name: "review",
      ownerScoped: true,
      mustHave: false,
      fields: [{ name: "body", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [
    { kind: "payment_pinelabs", mustHave: true },
    { kind: "email", mustHave: false },
  ],
};

describe("selection", () => {
  test("default selection turns on must-haves only", () => {
    expect(defaultSelection(spec)).toEqual({
      pages: ["Home"],
      entities: ["order"],
      auth: true,
      integrations: ["payment_pinelabs"],
    });
  });

  test("input counts only selected items that exist in the spec", () => {
    expect(
      inputFromSelection(spec, {
        pages: ["Home", "About", "Ghost"],
        entities: ["review", "ghost"],
        auth: false,
        integrations: ["email", "ai_feature"],
      }),
    ).toEqual({ pages: 2, entities: 1, auth: false, integrations: ["email"] });
  });

  test("auth cannot be selected when the spec has none", () => {
    const noAuth = { ...spec, auth: { enabled: false, providers: [] } };
    expect(inputFromSelection(noAuth, { ...defaultSelection(spec), auth: true }).auth).toBe(false);
  });
});
