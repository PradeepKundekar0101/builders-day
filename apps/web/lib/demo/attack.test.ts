import { describe, expect, test } from "vitest";
import { runAttack } from "./attack";
import { planFromIdea } from "./plan";

const paid = planFromIdea(
  "A tiffin order tracker. Customers sign in, pick meals for the week and pay online.",
);
const plain = planFromIdea(
  "A simple journal where I write short notes about my day and look back at them.",
);

describe("runAttack", () => {
  test("probes match the app: payment tampering only when it takes payments", () => {
    expect(runAttack(paid, false).probes.map((p) => p.id)).toContain("payment-tamper");
    expect(runAttack(plain, false).probes.map((p) => p.id)).not.toContain("payment-tamper");
  });

  test("the first run finds exactly one issue", () => {
    const { probes, grade } = runAttack(paid, false);
    expect(probes.filter((p) => p.outcome === "found")).toHaveLength(1);
    expect(grade).toBe("B");
  });

  test("after the fix every probe is blocked", () => {
    const { probes, grade } = runAttack(paid, true);
    expect(probes.every((p) => p.outcome === "blocked")).toBe(true);
    expect(grade).toBe("A");
  });

  test("sign-in apps are tested for credential stuffing, others for form spam", () => {
    expect(runAttack(paid, false).probes.find((p) => p.outcome === "found")?.id).toBe(
      "credential-stuffing",
    );
    expect(runAttack(plain, false).probes.find((p) => p.outcome === "found")?.id).toBe("form-spam");
  });
});
