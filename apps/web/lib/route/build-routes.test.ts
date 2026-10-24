import { describe, expect, test } from "vitest";
import { planFromIdea } from "@/lib/demo/plan";
import { DEFAULT_PROFILE } from "@/lib/provn-demo";
import { buildTasks, routeBuild, routeMode, routingSavings } from "./build-routes";

const booking = planFromIdea(
  "A booking portal for independent fitness coaches. Clients sign in, book classes and pay online.",
);
const journal = planFromIdea(
  "A simple journal where I write short notes about my day and look back at them.",
);
const pro = { ...DEFAULT_PROFILE, plan: "pro" as const };
const find = (routes: ReturnType<typeof routeBuild>, task: string) =>
  routes.find((r) => r.task === task)!;

describe("routeBuild", () => {
  test("the security review is high impact and goes to a frontier model, even on Free", () => {
    const review = find(routeBuild(booking, DEFAULT_PROFILE, "standard"), "Security review");
    expect(review.tier).toBe("frontier");
    expect(review.library).toBe("Lib 1 · frontier");
    expect(Number(review.impact[0])).toBeGreaterThanOrEqual(4);
    expect(review.guardrails).toContain("Flag for human review before this reaches production.");
  });

  test("payments stay on frontier and carry the Pine Labs guardrails", () => {
    const payments = find(routeBuild(booking, DEFAULT_PROFILE, "lean"), "Payments");
    expect(payments.tier).toBe("frontier");
    expect(payments.guardrails.join(" ")).toMatch(/Pine Labs sandbox/);
  });

  test("light, low-risk work drops to a cheap tier", () => {
    const routes = routeBuild(booking, DEFAULT_PROFILE, "standard");
    expect(find(routes, "Sample data").tier).not.toBe("frontier");
    expect(find(routes, "Landing copy").tier).not.toBe("frontier");
  });

  test("tasks follow the plan's features", () => {
    expect(buildTasks(booking).map((t) => t.task)).toEqual(
      expect.arrayContaining(["Sign-in & permissions", "Payments"]),
    );
    expect(buildTasks(journal).map((t) => t.task)).not.toContain("Payments");
  });

  test("private mode keeps every task local, including Max quality on a paid plan", () => {
    const routes = routeBuild(booking, { ...pro, privateMode: true }, "max");
    expect(routes.every((r) => r.tier === "local")).toBe(true);
  });

  test("Max quality escalates only on a paid plan", () => {
    const free = routeBuild(booking, DEFAULT_PROFILE, "max");
    const paid = routeBuild(booking, pro, "max");
    expect(find(free, "Sample data").tier).not.toBe("frontier");
    expect(paid.every((r) => r.tier === "frontier")).toBe(true);
  });

  test("routing costs less than sending everything to the frontier baseline", () => {
    const { routed, baseline, savedPct } = routingSavings(
      routeBuild(booking, DEFAULT_PROFILE, "standard"),
    );
    expect(routed).toBeLessThan(baseline);
    expect(savedPct).toBeGreaterThan(0);
  });
});

describe("routeMode", () => {
  test("maps builder settings to router modes", () => {
    expect(routeMode(DEFAULT_PROFILE, "standard")).toBe("auto");
    expect(routeMode(DEFAULT_PROFILE, "lean")).toBe("saver");
    expect(routeMode(DEFAULT_PROFILE, "max")).toBe("auto");
    expect(routeMode(pro, "max")).toBe("quality");
    expect(routeMode({ ...pro, privateMode: true }, "max")).toBe("private");
  });
});
