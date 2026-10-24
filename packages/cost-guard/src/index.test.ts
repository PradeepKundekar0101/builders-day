import { describe, it, expect } from "vitest";
import { CostGuard, MemoryStore } from "./index";
const actorId = "00000000-0000-4000-8000-000000000001";
function setup() {
  const store = new MemoryStore();
  store.create("build", 1000000);
  return { store, guard: new CostGuard(store) };
}
const reserve = { type: "reserve" as const, id: "call", taskId: "feature", maxMicros: 800000 };
describe("cost guard", () => {
  it("serializes competing reservations", async () => {
    const { guard } = setup();
    const outcomes = await Promise.all([
      guard.execute("build", reserve),
      guard.execute("build", { ...reserve, id: "other" }),
    ]);
    expect(outcomes.filter((o) => o.allowed)).toHaveLength(1);
    expect((await guard.status("build")).reservedMicros).toBe(800000);
  });
  it("duplicate reserve does not reserve twice; start is authorized once", async () => {
    const { guard } = setup();
    await guard.execute("build", reserve);
    await guard.execute("build", reserve);
    expect((await guard.status("build")).reservedMicros).toBe(800000);
    expect((await guard.execute("build", { type: "start", id: "call" })).allowed).toBe(true);
    expect((await guard.execute("build", { type: "start", id: "call" })).allowed).toBe(false);
    await expect(guard.execute("build", { ...reserve, maxMicros: 1 })).rejects.toThrow("reused");
  });
  it("reconciles once, releases unused reserve and rejects conflicting reports", async () => {
    const { guard } = setup();
    await guard.execute("build", reserve);
    await guard.execute("build", { type: "start", id: "call" });
    const usage = {
      type: "reconcile" as const,
      id: "call",
      actualMicros: 500000,
      inputTokens: 10,
      outputTokens: 20,
      pricingVersion: "p1",
    };
    await guard.execute("build", usage);
    await guard.execute("build", usage);
    expect(await guard.status("build")).toMatchObject({
      spentMicros: 500000,
      reservedMicros: 0,
      availableMicros: 500000,
    });
    await expect(guard.execute("build", { ...usage, actualMicros: 1 })).rejects.toThrow(
      "Conflicting",
    );
  });
  it("holds uncertain usage across service restart and forbids cancellation after start", async () => {
    const { guard, store } = setup();
    await guard.execute("build", reserve);
    await guard.execute("build", { type: "start", id: "call" });
    const restarted = new CostGuard(store);
    expect((await restarted.status("build")).reservedMicros).toBe(800000);
    await expect(restarted.execute("build", { type: "cancel", id: "call" })).rejects.toThrow(
      "reconciliation",
    );
  });
  it("cancels unstarted calls and does not resurrect cancelled ids", async () => {
    const { guard } = setup();
    await guard.execute("build", reserve);
    await guard.execute("build", { type: "cancel", id: "call" });
    expect((await guard.status("build")).availableMicros).toBe(1000000);
    expect((await guard.execute("build", reserve)).allowed).toBe(false);
  });
  it("records exact approval and blocks a stopped build", async () => {
    const { guard } = setup();
    await guard.execute("build", { ...reserve, maxMicros: 2000000 });
    const approval = { type: "approve" as const, id: "approval", actorId, newCapMicros: 2000000 };
    await guard.execute("build", approval);
    await guard.execute("build", approval);
    expect((await guard.status("build")).capMicros).toBe(2000000);
    await guard.execute("build", { type: "stop", id: "stop" });
    expect((await guard.execute("build", reserve)).allowed).toBe(false);
    await expect(
      guard.execute("build", { ...approval, id: "another", newCapMicros: 3000000 }),
    ).rejects.toThrow();
  });
  it("records provider overrun truthfully and freezes new spending", async () => {
    const { guard } = setup();
    await guard.execute("build", reserve);
    await guard.execute("build", { type: "start", id: "call" });
    await guard.execute("build", {
      type: "reconcile",
      id: "call",
      actualMicros: 1200000,
      inputTokens: 1,
      outputTokens: 1,
      pricingVersion: "p1",
    });
    expect(await guard.status("build")).toMatchObject({
      spentMicros: 1200000,
      breached: true,
      availableMicros: 0,
    });
    expect((await guard.execute("build", { ...reserve, id: "new" })).allowed).toBe(false);
  });
  it("rejects negative and noninteger amounts", async () => {
    const { guard } = setup();
    for (const maxMicros of [-1, 1.2, NaN, Infinity])
      await expect(guard.execute("build", { ...reserve, maxMicros })).rejects.toThrow();
  });
});

it("worker helper never dispatches a denied or duplicate call and holds failed usage", async () => {
  const { runBoundedCall } = await import("./index");
  const { guard } = setup();
  let calls = 0;
  const options = {
    guard,
    buildId: "build",
    callId: "helper",
    taskId: "feature",
    maxMicros: 800000,
    execute: async () => {
      calls++;
      return {
        value: "done",
        actualMicros: 500000,
        inputTokens: 1,
        outputTokens: 2,
        pricingVersion: "fixture",
      };
    },
  };
  expect((await runBoundedCall(options)).executed).toBe(true);
  expect((await runBoundedCall(options)).executed).toBe(false);
  expect((await runBoundedCall({ ...options, callId: "too-expensive" })).executed).toBe(false);
  expect(calls).toBe(1);
  await expect(
    runBoundedCall({
      ...options,
      callId: "uncertain",
      maxMicros: 400000,
      execute: async () => {
        throw new Error("timeout");
      },
    }),
  ).rejects.toThrow("timeout");
  expect((await guard.status("build")).reservedMicros).toBe(400000);
});
