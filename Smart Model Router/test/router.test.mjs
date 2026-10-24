import test from "node:test";
import assert from "node:assert/strict";
import { route } from "../public/core/router.js";

const pick = (prompt, opts) => route({ prompt }, opts);

test("payments work stays on a top frontier model", () => {
  const d = pick(
    "Build an end-to-end checkout with Pine Labs payments, refunds and webhook handling in Next.js",
  );
  assert.equal(d.analysis.category, "commerce");
  assert.equal(d.tier, "frontier");
  assert.ok(d.chosen.quality >= 9.5);
  assert.ok(d.guardrails.some((g) => g.includes("Pine Labs")));
});

test("mechanical grunt work goes local", () => {
  const d = pick("Rename all variables in this file to camelCase");
  assert.equal(d.analysis.category, "grunt");
  assert.equal(d.tier, "local");
  assert.equal(d.cost.estimate, 0);
});

test("research prefers a research-strong model", () => {
  const d = pick(
    "Research and compare the top 5 vector databases for a startup, with pros and cons",
  );
  assert.equal(d.analysis.category, "research");
  assert.ok(d.chosen.fit >= 9);
});

test("multi-step code changes are not sent to small models", () => {
  const d = pick("Refactor our React dashboard component to use hooks and add unit tests");
  assert.equal(d.analysis.category, "dev");
  assert.equal(d.tier, "frontier");
});

test("private mode only uses local models", () => {
  const d = pick("Design a multi-tenant architecture with auth and billing", { mode: "private" });
  assert.equal(d.chosen.tier, "local");
});

test("override is honoured and flagged", () => {
  const d = pick("Add Pine Labs refunds to checkout", { override: { model: "local-gemma3-4b" } });
  assert.equal(d.chosen.id, "local-gemma3-4b");
  assert.ok(d.override.warnings.length > 0);
  assert.notEqual(d.recommended.id, "local-gemma3-4b");
});

test("falls back to a connected provider", () => {
  const d = pick("Research and compare cloud GPU providers", { available: ["anthropic"] });
  assert.equal(d.executing.runtime, "anthropic");
  if (d.chosen.runtime !== "anthropic") assert.ok(d.executingReason);
});

test("fallback chain uses other labs", () => {
  const d = pick("Research and compare cloud GPU providers");
  const labs = [
    d.executing.lab,
    ...d.fallbacks.map((id) => d.alternatives.find((a) => a.id === id).lab),
  ];
  assert.equal(new Set(labs).size, labs.length);
});

test("PII on a light task is kept local in auto mode", () => {
  const d = pick("Extract name and email into JSON: Asha Rao, asha@acme.in");
  assert.ok(d.analysis.pii.found);
  assert.equal(d.tier, "local");
});
