import { it, expect } from "vitest";
import { CreditWallet, MemoryWalletStore, creditsToUnits as U } from "./credits";
const owner = "00000000-0000-4000-8000-000000000001";
async function setup(credits = 300) {
  const store = new MemoryWalletStore(),
    wallet = new CreditWallet(store);
  await wallet.execute(owner, {
    type: "topup",
    id: "fund",
    units: U(credits),
    paymentRef: "verified-payment",
  });
  return { wallet, store };
}
async function quote(wallet: CreditWallet, runId = "run", credits = 100) {
  await wallet.execute(owner, {
    type: "quote",
    id: `quote-${runId}`,
    runId,
    capUnits: U(credits),
    specRevision: "spec:1",
    category: "build",
  });
}
async function start(wallet: CreditWallet, runId = "run", credits = 100) {
  await quote(wallet, runId, credits);
  if (credits > 50)
    await wallet.execute(owner, {
      type: "approve",
      id: `approve-${runId}`,
      runId,
      capUnits: U(credits),
      actorId: owner,
    });
  return wallet.execute(owner, { type: "start", id: `start-${runId}`, runId });
}
it("requires explicit approval above 50, accepts exactly 50, and rejects mismatched approval", async () => {
  const { wallet } = await setup();
  await quote(wallet);
  expect((await wallet.execute(owner, { type: "start", id: "blocked", runId: "run" })).reason).toBe(
    "approval_required",
  );
  await expect(
    wallet.execute(owner, {
      type: "approve",
      id: "bad",
      runId: "run",
      capUnits: U(99),
      actorId: owner,
    }),
  ).rejects.toThrow("exactly");
  expect((await start(wallet, "small", 50)).allowed).toBe(true);
});
it("serializes shared-wallet reservations and survives service reconstruction", async () => {
  const { wallet, store } = await setup();
  await quote(wallet, "a", 200);
  await quote(wallet, "b", 200);
  for (const runId of ["a", "b"])
    await wallet.execute(owner, {
      type: "approve",
      id: `approve${runId}`,
      runId,
      capUnits: U(200),
      actorId: owner,
    });
  const results = await Promise.all(
    ["a", "b"].map((runId) => wallet.execute(owner, { type: "start", id: `start${runId}`, runId })),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(1);
  expect(await new CreditWallet(store).status(owner)).toMatchObject({
    availableCredits: 100,
    reservedCredits: 200,
  });
});
it("deduplicates verified payment references across different command IDs", async () => {
  const { wallet } = await setup();
  await wallet.execute(owner, {
    type: "topup",
    id: "replay",
    units: U(300),
    paymentRef: "verified-payment",
  });
  expect((await wallet.status(owner)).availableCredits).toBe(300);
  await expect(
    wallet.execute(owner, {
      type: "topup",
      id: "changed",
      units: U(301),
      paymentRef: "verified-payment",
    }),
  ).rejects.toThrow();
});
it("monthly allowances reset unreserved monthly credits, retain paid topups and reject duplicate periods", async () => {
  const { wallet } = await setup(100);
  await wallet.execute(owner, { type: "allowance", id: "oct", period: "2026-10", plan: "free" });
  await start(wallet, "old", 200);
  await wallet.execute(owner, { type: "allowance", id: "nov", period: "2026-11", plan: "free" });
  expect((await wallet.status(owner)).availableCredits).toBe(400);
  await expect(
    wallet.execute(owner, { type: "allowance", id: "again", period: "2026-11", plan: "pro" }),
  ).rejects.toThrow();
  await wallet.execute(owner, {
    type: "finish",
    id: "done",
    runId: "old",
    outcome: "user_cancel",
    chargeUnits: 0,
  });
  expect((await wallet.status(owner)).availableCredits).toBe(400);
});
it("breaks repeated failures before another attempt and requires explicit bounded resume", async () => {
  const { wallet } = await setup();
  await start(wallet);
  for (const attemptId of ["a", "b"]) {
    await wallet.execute(owner, {
      type: "beginAttempt",
      id: `begin${attemptId}`,
      runId: "run",
      attemptId,
    });
    await wallet.execute(owner, {
      type: "reportAttempt",
      id: `report${attemptId}`,
      runId: "run",
      attemptId,
      success: false,
      failureFingerprint: "same-error",
    });
  }
  expect(
    (
      await wallet.execute(owner, {
        type: "beginAttempt",
        id: "next",
        runId: "run",
        attemptId: "c",
      })
    ).reason,
  ).toBe("repeated_failure");
  await wallet.execute(owner, {
    type: "resume",
    id: "resume",
    runId: "run",
    actorId: owner,
    extraAttempts: 1,
  });
  expect(
    (
      await wallet.execute(owner, {
        type: "beginAttempt",
        id: "next",
        runId: "run",
        attemptId: "c",
      })
    ).allowed,
  ).toBe(true);
});
it("breaks after three attempts even when failure signatures differ", async () => {
  const { wallet } = await setup();
  await start(wallet);
  for (let i = 0; i < 3; i++) {
    await wallet.execute(owner, {
      type: "beginAttempt",
      id: `b${i}`,
      runId: "run",
      attemptId: String(i),
    });
    await wallet.execute(owner, {
      type: "reportAttempt",
      id: `r${i}`,
      runId: "run",
      attemptId: String(i),
      success: false,
      failureFingerprint: `e${i}`,
    });
  }
  expect(
    (
      await wallet.execute(owner, {
        type: "beginAttempt",
        id: "fourth",
        runId: "run",
        attemptId: "4",
      })
    ).reason,
  ).toBe("attempt_limit");
});
it("does not restart an in-flight or replayed attempt", async () => {
  const { wallet } = await setup();
  await start(wallet);
  const cmd = { type: "beginAttempt" as const, id: "begin", runId: "run", attemptId: "a" };
  expect((await wallet.execute(owner, cmd)).allowed).toBe(true);
  expect((await wallet.execute(owner, cmd)).allowed).toBe(false);
  expect((await wallet.execute(owner, { ...cmd, id: "new", attemptId: "b" })).reason).toBe(
    "attempt_usage_pending",
  );
  await expect(
    wallet.execute(owner, {
      type: "finish",
      id: "finish",
      runId: "run",
      outcome: "platform_failure",
      chargeUnits: 0,
      evidenceRef: "verified",
    }),
  ).rejects.toThrow("in-flight");
});
it("returns full held credits for evidenced platform failure without charging", async () => {
  const { wallet } = await setup();
  await start(wallet);
  await wallet.execute(owner, {
    type: "finish",
    id: "failed",
    runId: "run",
    outcome: "platform_failure",
    chargeUnits: 0,
    evidenceRef: "incident-123",
  });
  expect(await wallet.status(owner)).toMatchObject({
    availableCredits: 300,
    reservedCredits: 0,
    chargedCredits: 0,
  });
});
it("refunds an already charged platform failure exactly once while keeping charge history", async () => {
  const { wallet } = await setup();
  await start(wallet);
  await wallet.execute(owner, {
    type: "finish",
    id: "done",
    runId: "run",
    outcome: "success",
    chargeUnits: U(100),
  });
  for (const id of ["refund1", "refund2"])
    await wallet.execute(owner, {
      type: "refund",
      id,
      runId: "run",
      cause: "platform",
      actorId: owner,
      evidenceRef: "verified-incident",
    });
  expect(await wallet.status(owner)).toMatchObject({
    availableCredits: 300,
    chargedCredits: 100,
    refundedCredits: 100,
  });
});
it("holds unknown failures for review and forbids overspending", async () => {
  const { wallet } = await setup();
  await start(wallet);
  await expect(
    wallet.execute(owner, {
      type: "finish",
      id: "too-much",
      runId: "run",
      outcome: "success",
      chargeUnits: U(101),
    }),
  ).rejects.toThrow("cap");
  await wallet.execute(owner, {
    type: "finish",
    id: "unclear",
    runId: "run",
    outcome: "unknown_failure",
    chargeUnits: 0,
  });
  expect(await wallet.status(owner)).toMatchObject({ reservedCredits: 100, availableCredits: 200 });
});
it("represents fractional credits exactly and rejects excess precision", () => {
  expect(U(0.0001)).toBe(1);
  expect(U(1)).toBe(10000);
  expect(() => U(0.00001)).toThrow();
  expect(() => U(-1)).toThrow();
});
