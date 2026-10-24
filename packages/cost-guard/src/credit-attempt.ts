import type { CreditWallet } from "./credits";
/** Bound one build/repair cycle. Wrap every provider call inside execute with runBoundedCall.
 * An exception deliberately leaves the attempt pending: recover confirmed usage first.
 */
export async function runCreditAttempt<T>(input: {
  wallet: CreditWallet;
  accountId: string;
  runId: string;
  attemptId: string;
  execute: () => Promise<{ value: T; success: boolean; failureFingerprint?: string }>;
}) {
  const admission = await input.wallet.execute(input.accountId, {
    type: "beginAttempt",
    id: `begin:${input.attemptId}`,
    runId: input.runId,
    attemptId: input.attemptId,
  });
  if (!admission.allowed) return { executed: false as const, reason: admission.reason };
  const result = await input.execute();
  const status = await input.wallet.execute(input.accountId, {
    type: "reportAttempt",
    id: `report:${input.attemptId}`,
    runId: input.runId,
    attemptId: input.attemptId,
    success: result.success,
    failureFingerprint: result.failureFingerprint,
  });
  return { executed: true as const, value: result.value, status };
}
