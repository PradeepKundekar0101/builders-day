import { describe, expect, test } from "vitest";
import { estimate, FEATURES_V1 } from "./index";

describe("estimate", () => {
  test("anchor: 2 pages + auth + 3 entities + payment", () => {
    const result = estimate({
      pages: 2,
      entities: 3,
      auth: true,
      integrations: ["payment_pinelabs"],
    });
    expect(result.tokens).toBe(330_000);
    expect(result.modelUsd).toBe(1.98);
    expect(result.modelBudgetUsd).toBe(1.98);
    expect(result.costUsd).toBe(4.96);
    expect(result.lowUsd).toBe(3.47);
    expect(result.highUsd).toBe(6.45);
    expect(result.hours).toBe(4.25);
    expect(result.version).toBe("v1");
  });

  test("empty input costs only the deploy and never NaN", () => {
    const result = estimate({ pages: 0, entities: 0, auth: false, integrations: [] });
    expect(result).toMatchObject({ tokens: 0, costUsd: 1, lowUsd: 0.7, highUsd: 1.3, hours: 0 });
    expect(result.lineItems).toEqual([]);
  });

  test.each([
    ["file_upload", 35_000, 0.5],
    ["payment_pinelabs", 80_000, 1],
    ["email", 30_000, 0.5],
    ["ai_feature", 50_000, 0.75],
    ["admin_dashboard", 70_000, 1],
  ] as const)("integration %s alone", (kind, tokens, hours) => {
    const result = estimate({ pages: 0, entities: 0, auth: false, integrations: [kind] });
    expect(result.tokens).toBe(tokens);
    expect(result.hours).toBe(hours);
    expect(result.costUsd).toBe(Math.round((2 * tokens * 6e-6 + 1) * 100) / 100);
  });

  test("pages and entities scale per unit", () => {
    const result = estimate({ pages: 4, entities: 2, auth: false, integrations: [] });
    expect(result.tokens).toBe(4 * 15_000 + 2 * 60_000);
    expect(result.hours).toBe(4 * 0.25 + 2 * 0.75);
    expect(result.lineItems.map((item) => [item.key, item.quantity])).toEqual([
      ["static_page", 4],
      ["crud_entity", 2],
    ]);
  });

  test("drivers add up to the cost", () => {
    const result = estimate({ pages: 2, entities: 3, auth: true, integrations: ["email"] });
    const sum = result.drivers.reduce((total, driver) => total + driver.usd, 0);
    expect(Math.round(sum * 100) / 100).toBe(result.costUsd);
    expect(result.drivers.map((d) => d.key)).toEqual(["model", "deploy", "integrations"]);
  });

  test("feature table matches the PRD", () => {
    expect(FEATURES_V1.auth).toMatchObject({ tokens: 40_000, hours: 0.5 });
    expect(FEATURES_V1.crud_entity).toMatchObject({ tokens: 60_000, hours: 0.75 });
    expect(FEATURES_V1.static_page).toMatchObject({ tokens: 15_000, hours: 0.25 });
  });
});
