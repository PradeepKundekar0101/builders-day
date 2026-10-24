import { describe, expect, test } from "vitest";
import { planFromIdea } from "./plan";

const TIFFIN =
  "A tiffin order tracker for my home kitchen. Customers sign in, pick meals for the week and pay online; I see each day's orders.";

describe("planFromIdea", () => {
  test("detects features from plain words and prices them", () => {
    const plan = planFromIdea(TIFFIN);
    expect(plan.features.map((f) => f.key)).toEqual(["pages", "data", "auth", "payments"]);
    expect(plan.costUsd).toBeGreaterThan(1);
    expect(plan.lowUsd).toBeLessThan(plan.costUsd);
    expect(plan.highUsd).toBeGreaterThan(plan.costUsd);
    expect(plan.hours).toBe(plan.features.reduce((sum, f) => sum + f.hours, 0));
  });

  test("the cost is the sum of feature costs plus deploy", () => {
    const plan = planFromIdea(TIFFIN);
    const sum = plan.features.reduce((total, f) => total + f.usd, 0) + plan.deployUsd;
    expect(plan.costUsd).toBeCloseTo(sum, 2);
  });

  test("names the app from the idea", () => {
    expect(planFromIdea(TIFFIN).name).toBe("Tiffin Order Tracker");
    expect(
      planFromIdea("A booking platform for yoga classes where students reserve a spot online.")
        .name,
    ).toBe("Booking Platform");
  });

  test.each([
    ["Build a private client portal for a small design agency.", "Private Client Portal"],
    ["I want to create an invoice tracker for freelancers.", "Invoice Tracker"],
    ["Make a recipe box that saves my favourite dishes.", "Recipe Box"],
  ])("skips leading verbs: %s", (idea, name) => {
    expect(planFromIdea(idea).name).toBe(name);
  });

  test("a plain idea gets pages and data only", () => {
    const plan = planFromIdea(
      "A simple journal where I write short notes about my day and look back at them.",
    );
    expect(plan.features.map((f) => f.key)).toEqual(["pages", "data"]);
  });

  test("pages always include a home page and reflect features", () => {
    const plan = planFromIdea(TIFFIN);
    expect(plan.pages[0]).toBe("Home");
    expect(plan.pages).toContain("Checkout");
  });

  test("the same idea always gives the same plan", () => {
    expect(planFromIdea(TIFFIN)).toEqual(planFromIdea(TIFFIN));
  });
});
