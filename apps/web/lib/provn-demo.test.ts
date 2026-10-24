import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROFILE,
  INITIAL_DEMO,
  demoTransition,
  demoRoutes,
  type DemoContext,
  type DemoAction,
} from "./provn-demo";
const context = (): DemoContext => ({
  fingerprint: "brief-1",
  reviewed: true,
  profile: { ...DEFAULT_PROFILE },
  scope: "standard",
});
describe("PROVN frontend demo safety gates", () => {
  it("requires reviewed scope and explicit quote approval before a run", () => {
    expect(() =>
      demoTransition(INITIAL_DEMO, "approve", { ...context(), reviewed: false }),
    ).toThrow(/Review/);
    expect(() => demoTransition(INITIAL_DEMO, "build", context())).toThrow();
    const approved = demoTransition(INITIAL_DEMO, "approve", context());
    expect(approved.reserved).toBe(180);
    expect(approved.spent).toBe(0);
    expect(demoTransition(approved, "build", context()).spent).toBe(180);
  });
  it("enforces hard caps, wallet balance and free frontier restrictions", () => {
    expect(() =>
      demoTransition(INITIAL_DEMO, "approve", {
        ...context(),
        profile: { ...DEFAULT_PROFILE, budgetCap: 100 },
      }),
    ).toThrow(/hard cap/);
    expect(() => demoTransition({ ...INITIAL_DEMO, spent: 250 }, "approve", context())).toThrow(
      /credits/,
    );
    expect(() =>
      demoTransition(INITIAL_DEMO, "approve", {
        ...context(),
        scope: "max",
        profile: { ...DEFAULT_PROFILE, budgetCap: 300 },
      }),
    ).toThrow(/Free/);
  });
  it("invalidates approval when inputs change and prevents duplicate charging", () => {
    const approved = demoTransition(INITIAL_DEMO, "approve", context());
    expect(() =>
      demoTransition(approved, "build", { ...context(), fingerprint: "changed" }),
    ).toThrow(/changed/);
    const built = demoTransition(approved, "build", context());
    expect(() => demoTransition(built, "build", context())).toThrow(/Approve/);
  });
  it("requires Guild review, remediation and smoke success for proof", () => {
    let state = INITIAL_DEMO;
    for (const action of ["approve", "build", "deploy", "attack"] as DemoAction[])
      state = demoTransition(state, action, context());
    expect(state.criticalOpen).toBe(1);
    expect(state.highOpen).toBe(1);
    expect(() => demoTransition(state, "smoke-pass", context())).toThrow();
    expect(() => demoTransition(state, "fix", context())).toThrow();
    state = demoTransition(state, "triage", context());
    state = demoTransition(state, "fix", context());
    state = demoTransition(state, "smoke-fail", context());
    expect(state.phase).toBe("fixed");
    expect(state.smoke).toBe("fail");
    state = demoTransition(state, "smoke-pass", context());
    expect(state.phase).toBe("proven");
    expect(state.spent).toBe(168);
    expect(state.refund).toBe(12);
    expect(() => demoTransition(state, "smoke-pass", context())).toThrow();
  });
  it("stops platform loops and refunds only once", () => {
    let state = demoTransition(
      demoTransition(INITIAL_DEMO, "approve", context()),
      "build",
      context(),
    );
    state = demoTransition(state, "platform-failure", context());
    expect(state.spent).toBe(0);
    expect(state.refund).toBe(180);
    expect(state.retries).toBe(3);
    expect(() => demoTransition(state, "platform-failure", context())).toThrow();
  });
  it("private routing always stays local, including Max quality", () => {
    expect(
      demoRoutes({ ...DEFAULT_PROFILE, privateMode: true, plan: "pro" }, "max").every((r) =>
        r.library.startsWith("Lib 3"),
      ),
    ).toBe(true);
    expect(demoRoutes(DEFAULT_PROFILE, "max").some((r) => r.library.startsWith("Lib 1"))).toBe(
      false,
    );
    expect(
      demoRoutes({ ...DEFAULT_PROFILE, plan: "pro" }, "max").some((r) =>
        r.library.startsWith("Lib 1"),
      ),
    ).toBe(true);
  });
});
