import { it, expect, vi } from "vitest";
import { CreditWallet, MemoryWalletStore, runCreditAttempt } from "./index";
it("never dispatches duplicate attempts and holds uncertain failures for reconciliation", async () => {
  const wallet = new CreditWallet(new MemoryWalletStore());
  await wallet.execute("a", {
    type: "quote",
    id: "q",
    runId: "r",
    specRevision: "1",
    capUnits: 0,
    category: "build",
  });
  await wallet.execute("a", { type: "start", id: "s", runId: "r" });
  const execute = vi.fn().mockRejectedValue(new Error("network timeout"));
  const input = { wallet, accountId: "a", runId: "r", attemptId: "one", execute };
  await expect(runCreditAttempt(input)).rejects.toThrow("timeout");
  expect((await runCreditAttempt(input)).executed).toBe(false);
  expect((await runCreditAttempt({ ...input, attemptId: "two" })).executed).toBe(false);
  expect(execute).toHaveBeenCalledTimes(1);
  await wallet.execute("a", {
    type: "reportAttempt",
    id: "recovered",
    runId: "r",
    attemptId: "one",
    success: true,
  });
  execute.mockResolvedValue({ value: "done", success: true });
  expect((await runCreditAttempt({ ...input, attemptId: "two" })).executed).toBe(true);
});
