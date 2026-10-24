/**
 * How long the simulated build, attack and fix take. A real run takes minutes; the demo
 * compresses it to roughly 20 to 25 seconds per phase so it still feels like work is happening.
 */
export const DEMO_TIMING = {
  /** Pricing the plan line by line, from the answered brief to the totals. */
  estimateMs: 6_500,
  /** Whole simulated build, first step to the app appearing in the preview. */
  buildMs: 22_000,
  /** First attack run, first probe to the grade. */
  attackMs: 21_000,
  /** Writing, testing and redeploying the fix, before the re-attack starts. */
  fixMs: 9_000,
  /** Re-attack after a fix; the probes already have a warm target, so it runs faster. */
  reattackMs: 13_000,
} as const;

/**
 * Splits `totalMs` across `count` steps of uneven length, so a simulation does not tick like a
 * metronome. Returns when each step finishes, in milliseconds from the start; the last entry is
 * always `totalMs`. `weights` makes chosen steps longer (for example, tests or deploys).
 */
export function stepFinishTimes(
  totalMs: number,
  count: number,
  weights: (index: number) => number = () => 1,
  random: () => number = Math.random,
): number[] {
  if (count <= 0) return [];
  const sizes = Array.from({ length: count }, (_, i) => weights(i) * (0.7 + random() * 0.6));
  const sum = sizes.reduce((a, b) => a + b, 0);
  let elapsed = 0;
  return sizes.map((size, i) => {
    elapsed += size;
    return i === count - 1 ? totalMs : Math.round((elapsed / sum) * totalMs);
  });
}

export type AttackTick = { at: number; fixDone: number; shown: number };

/**
 * When each fix step and probe of a simulated attack finishes. A hardened run first applies the
 * fix, then re-attacks. The grade lands a beat after the last probe, at `doneAt`.
 */
export function attackSchedule(
  probeCount: number,
  fixCount: number,
  hardened: boolean,
  random: () => number = Math.random,
): { ticks: AttackTick[]; doneAt: number } {
  const gradeMs = 1_200;
  const fixMs = hardened && fixCount > 0 ? DEMO_TIMING.fixMs : 0;
  const probeMs = (hardened ? DEMO_TIMING.reattackMs : DEMO_TIMING.attackMs) - gradeMs;
  // Tests and redeploys take longer than writing the patch; the last probe is the slow brute-force one.
  const fixTimes = stepFinishTimes(fixMs, fixMs ? fixCount : 0, (i) => (i ? 1.4 : 1), random);
  const probeTimes = stepFinishTimes(
    probeMs,
    probeCount,
    (i) => (i === probeCount - 1 ? 2 : 1),
    random,
  );
  const ticks: AttackTick[] = [
    ...fixTimes.map((at, i) => ({ at, fixDone: i + 1, shown: 0 })),
    ...probeTimes.map((at, i) => ({ at: fixMs + at, fixDone: fixTimes.length, shown: i + 1 })),
  ];
  return { ticks, doneAt: fixMs + probeMs + gradeMs };
}
