import { it, expect } from "vitest";
import { estimate, estimateSpec, validatedInputFromSelection, type Selection } from "./index";
import type { Spec } from "@buildwise/shared";
const spec: Spec = {
  name: "Bookings",
  summary: "Bookings",
  pages: [{ name: "Home", purpose: "Landing", mustHave: true }],
  entities: [
    {
      name: "booking",
      mustHave: true,
      ownerScoped: true,
      fields: [{ name: "title", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [{ kind: "email", mustHave: false }],
};
const selection: Selection = {
  pages: ["Home"],
  entities: ["booking"],
  auth: true,
  integrations: ["email"],
};
it.each(["managed", "byok"] as const)(
  "keeps both estimator APIs equivalent for %s",
  (billingMode) => {
    const old = estimate(validatedInputFromSelection(spec, selection), undefined, billingMode);
    const revised = estimateSpec({
      spec,
      specRevision: "1",
      selection: {
        specRevision: "1",
        selectedIds: ["page:0", "entity:booking", "auth", "integration:email"],
      },
      billingMode,
    });
    for (const key of [
      "costUsd",
      "costCredits",
      "lowCredits",
      "highCredits",
      "modelBudgetUsd",
      "hours",
      "tokens",
    ] as const)
      expect(old[key]).toBe(revised[key]);
    expect(old.costCredits).toBe(old.costUsd * 100);
    if (billingMode === "byok") {
      expect(old.costCredits).toBe(0);
      expect(old.modelBudgetUsd).toBeGreaterThan(0);
    }
  },
);
it("rejects tampered executable selections and fractional counts", () => {
  expect(() => validatedInputFromSelection(spec, { ...selection, auth: false })).toThrow();
  expect(() =>
    validatedInputFromSelection(spec, { ...selection, pages: ["Home", "Home"] }),
  ).toThrow("Duplicate");
  expect(() => validatedInputFromSelection(spec, { ...selection, pages: ["unknown"] })).toThrow(
    "Unknown",
  );
  expect(() => estimate({ pages: 1.5, entities: 0, auth: false, integrations: [] })).toThrow();
});
