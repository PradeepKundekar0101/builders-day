import { describe, it, expect } from "vitest";
import {
  estimateSpec as estimate,
  catalog,
  defaultSpecSelection as defaultSelection,
  suggestAlternatives,
  DEFAULT_PRICING,
} from "./index";
import type { Spec } from "@buildwise/shared";
const spec: Spec = {
  name: "Booking",
  summary: "Booking system",
  pages: [
    { name: "Home", purpose: "Home", mustHave: true },
    { name: "About", purpose: "About", mustHave: true },
  ],
  entities: ["services", "bookings", "customers"].map((name) => ({
    name,
    fields: [{ name: "name", type: "text", required: true }],
    ownerScoped: true,
    mustHave: true,
  })),
  auth: { enabled: true, providers: ["email"] },
  integrations: [{ kind: "payment_pinelabs", mustHave: true }],
};
const input = { spec, specRevision: "1" };
describe("estimator", () => {
  it("matches the repository anchor and separates model budget", () => {
    expect(estimate(input)).toMatchObject({
      tokens: 330000,
      costUsd: 4.96,
      modelBudgetUsd: 1.98,
      hours: 4.25,
      lowUsd: 3.47,
      highUsd: 6.45,
    });
  });
  it("rejects stale, duplicate, unknown and missing required selections", () => {
    const selected = defaultSelection(spec, "1");
    for (const selection of [
      { ...selected, specRevision: "0" },
      { ...selected, selectedIds: [...selected.selectedIds, "unknown"] },
      { ...selected, selectedIds: [...selected.selectedIds, selected.selectedIds[0]!] },
      { ...selected, selectedIds: [] },
    ])
      expect(() => estimate({ ...input, selection })).toThrow();
  });
  it("requires auth for owner-scoped CRUD", () =>
    expect(() =>
      estimate({ ...input, spec: { ...spec, auth: { enabled: false, providers: [] } } }),
    ).toThrow("dependency"));
  it("prices every integration and rejects duplicates", () => {
    for (const kind of [
      "file_upload",
      "payment_pinelabs",
      "email",
      "ai_feature",
      "admin_dashboard",
    ] as const) {
      const s = { ...spec, integrations: [{ kind, mustHave: true }] };
      expect(estimate({ ...input, spec: s }).tokens).toBe(
        250000 + DEFAULT_PRICING.features[kind].tokens,
      );
    }
    expect(() =>
      catalog({ ...spec, integrations: [...spec.integrations, ...spec.integrations] }),
    ).toThrow("Duplicate");
  });
  it("offers only valid optional removals, recomputes savings and flags impossible target", () => {
    const s = {
      ...spec,
      integrations: [...spec.integrations, { kind: "admin_dashboard" as const, mustHave: false }],
    };
    const selection = { specRevision: "1", selectedIds: catalog(s).map((f) => f.id) };
    const result = suggestAlternatives({ ...input, spec: s, selection }, 5);
    expect(result.achievable).toBe(true);
    expect(result.suggestions[0]).toMatchObject({
      savingsUsd: 0.84,
      removedIds: ["integration:admin_dashboard"],
    });
    expect(suggestAlternatives({ ...input, spec: s, selection }, 1).achievable).toBe(false);
  });
  it("does not mutate input and validates pricing", () => {
    const before = JSON.stringify(DEFAULT_PRICING);
    estimate(input);
    expect(JSON.stringify(DEFAULT_PRICING)).toBe(before);
    expect(() => estimate({ ...input, pricing: { ...DEFAULT_PRICING, margin: -1 } })).toThrow();
  });
});
