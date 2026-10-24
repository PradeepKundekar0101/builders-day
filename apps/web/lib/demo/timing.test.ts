import { describe, expect, test } from "vitest";
import { attackSchedule, DEMO_TIMING, stepFinishTimes } from "./timing";

describe("stepFinishTimes", () => {
  test("ends exactly at the total and only moves forward", () => {
    const times = stepFinishTimes(22_000, 9);
    expect(times).toHaveLength(9);
    expect(times.at(-1)).toBe(22_000);
    times.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(times[i]));
  });

  test("weighted steps take longer", () => {
    const times = stepFinishTimes(
      10_000,
      2,
      (i) => (i === 1 ? 4 : 1),
      () => 0.5,
    );
    expect(times).toEqual([2_000, 10_000]);
  });

  test("no steps, no times", () => {
    expect(stepFinishTimes(1_000, 0)).toEqual([]);
  });

  test("each phase lasts 20 to 25 seconds", () => {
    expect(DEMO_TIMING.buildMs).toBeGreaterThanOrEqual(20_000);
    expect(DEMO_TIMING.buildMs).toBeLessThanOrEqual(25_000);
    expect(DEMO_TIMING.attackMs).toBeGreaterThanOrEqual(20_000);
    expect(DEMO_TIMING.attackMs).toBeLessThanOrEqual(25_000);
    const fix = DEMO_TIMING.fixMs + DEMO_TIMING.reattackMs;
    expect(fix).toBeGreaterThanOrEqual(20_000);
    expect(fix).toBeLessThanOrEqual(25_000);
  });
});

describe("attackSchedule", () => {
  test("first attack: probes one by one, grade at the end of the attack phase", () => {
    const { ticks, doneAt } = attackSchedule(5, 3, false);
    expect(ticks.map((t) => t.shown)).toEqual([1, 2, 3, 4, 5]);
    expect(ticks.every((t) => t.fixDone === 0)).toBe(true);
    expect(doneAt).toBe(DEMO_TIMING.attackMs);
    expect(ticks.at(-1)!.at).toBeLessThan(doneAt);
  });

  test("fix and re-attack: fix steps first, then probes", () => {
    const { ticks, doneAt } = attackSchedule(4, 3, true);
    expect(ticks.map((t) => [t.fixDone, t.shown])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
    expect(ticks[2].at).toBe(DEMO_TIMING.fixMs);
    expect(doneAt).toBe(DEMO_TIMING.fixMs + DEMO_TIMING.reattackMs);
    ticks.slice(1).forEach((t, i) => expect(t.at).toBeGreaterThan(ticks[i].at));
  });
});
