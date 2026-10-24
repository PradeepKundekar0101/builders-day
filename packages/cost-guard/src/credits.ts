import { z } from "zod";

/** One unit = $0.000001 = 0.0001 credit. Integer arithmetic throughout the ledger. */
export const UNITS_PER_CREDIT = 10_000;
export const DEFAULT_APPROVAL_CREDITS = 50;
export const MONTHLY_CREDITS = { free: 300, builder: 2500, pro: 7000 } as const;
const units = z.number().int().nonnegative().max(9_000_000_000_000);
const id = z.string().min(1).max(200);
export function creditsToUnits(credits: number) {
  z.number().finite().nonnegative().parse(credits);
  const exact = credits * UNITS_PER_CREDIT,
    rounded = Math.round(exact);
  if (Math.abs(exact - rounded) > 0.00001)
    throw new Error("Credits support at most four decimal places");
  return units.parse(rounded);
}
export const unitsToCredits = (value: number) => units.parse(value) / UNITS_PER_CREDIT;
export const WalletCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("topup"), id, units: units.min(1_000_000), paymentRef: id }),
  z.object({
    type: z.literal("allowance"),
    id,
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    plan: z.enum(["free", "builder", "pro"]),
  }),
  z.object({
    type: z.literal("threshold"),
    id,
    credits: z.number().finite().nonnegative().max(900_000_000),
  }),
  z.object({
    type: z.literal("quote"),
    id,
    runId: id,
    quoteId: z.string().uuid().optional(),
    specRevision: id,
    capUnits: units,
    category: z.enum(["build", "security", "guild", "domain"]),
  }),
  z.object({ type: z.literal("approve"), id, runId: id, capUnits: units.positive(), actorId: id }),
  z.object({ type: z.literal("start"), id, runId: id }),
  z.object({ type: z.literal("beginAttempt"), id, runId: id, attemptId: id }),
  z.object({
    type: z.literal("reportAttempt"),
    id,
    runId: id,
    attemptId: id,
    success: z.boolean(),
    failureFingerprint: id.optional(),
  }),
  z.object({
    type: z.literal("resume"),
    id,
    runId: id,
    actorId: id,
    extraAttempts: z.number().int().min(1).max(3),
  }),
  z.object({
    type: z.literal("finish"),
    id,
    runId: id,
    outcome: z.enum(["success", "user_cancel", "platform_failure", "unknown_failure"]),
    chargeUnits: units,
    evidenceRef: id.optional(),
  }),
  z.object({
    type: z.literal("refund"),
    id,
    runId: id,
    cause: z.literal("platform"),
    evidenceRef: id,
    actorId: id,
  }),
]);
export type WalletCommand = z.infer<typeof WalletCommandSchema>;
export type CreditRun = {
  id: string;
  quoteId?: string;
  specRevision: string;
  category: string;
  capUnits: number;
  phase: "awaiting_approval" | "ready" | "running" | "paused" | "completed" | "failed";
  approvedBy?: string;
  heldPaid: number;
  heldMonthly: number;
  heldPeriod: string | null;
  chargeUnits: number;
  refundedUnits: number;
  failureEvidence?: string;
  attempts: { id: string; success?: boolean; fingerprint?: string }[];
  maxAttempts: number;
  consecutiveFailures: number;
  lastFailure?: string;
  pauseReason?: string;
};
export type WalletState = {
  accountId: string;
  version: number;
  paidUnits: number;
  monthlyUnits: number;
  period: string | null;
  plan: string;
  thresholdCredits: number;
  runs: CreditRun[];
  receipts: { id: string; fingerprint: string }[];
  fundingRefs: { ref: string; units: number }[];
};
export function initialWallet(accountId: string): WalletState {
  return {
    accountId,
    version: 0,
    paidUnits: 0,
    monthlyUnits: 0,
    period: null,
    plan: "payg",
    thresholdCredits: 50,
    runs: [],
    receipts: [],
    fundingRefs: [],
  };
}
export function walletStatus(s: WalletState) {
  const heldUnits = s.runs.reduce((n, r) => n + r.heldPaid + r.heldMonthly, 0);
  return {
    accountId: s.accountId,
    version: s.version,
    availableCredits: unitsToCredits(s.paidUnits + s.monthlyUnits),
    reservedCredits: unitsToCredits(heldUnits),
    chargedCredits: unitsToCredits(s.runs.reduce((n, r) => n + r.chargeUnits, 0)),
    refundedCredits: unitsToCredits(s.runs.reduce((n, r) => n + r.refundedUnits, 0)),
    thresholdCredits: s.thresholdCredits,
    plan: s.plan,
    period: s.period,
    runs: s.runs.map((r) => ({ ...r, capCredits: unitsToCredits(r.capUnits) })),
  };
}
/** Trusted-server commands only. Funding/refunds must never be passed through from clients. */
export function walletTransition(previous: WalletState, raw: WalletCommand) {
  const c = WalletCommandSchema.parse(raw),
    s = structuredClone(previous),
    fingerprint = JSON.stringify(c);
  const replay = s.receipts.find((r) => r.id === c.id);
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new Error("Conflicting wallet command replay");
    return { state: previous, allowed: false, reason: "already_applied", replayed: true };
  }
  let allowed = true,
    reason = "ok";
  const run = "runId" in c ? s.runs.find((r) => r.id === c.runId) : undefined;
  if (c.type === "topup") {
    const old = s.fundingRefs.find((f) => f.ref === c.paymentRef);
    if (old) {
      if (old.units !== c.units) throw new Error("Conflicting payment reference");
      return { state: previous, allowed: false, reason: "already_funded", replayed: true };
    }
    s.paidUnits = units.parse(s.paidUnits + c.units);
    s.fundingRefs.push({ ref: c.paymentRef, units: c.units });
  } else if (c.type === "allowance") {
    if (s.period && c.period <= s.period)
      throw new Error("Allowance period already granted or stale");
    s.monthlyUnits = creditsToUnits(MONTHLY_CREDITS[c.plan]);
    s.period = c.period;
    s.plan = c.plan;
  } else if (c.type === "threshold") s.thresholdCredits = c.credits;
  else if (c.type === "quote") {
    if (run) throw new Error("Run already exists");
    s.runs.push({
      id: c.runId,
      quoteId: c.quoteId,
      specRevision: c.specRevision,
      category: c.category,
      capUnits: c.capUnits,
      phase: unitsToCredits(c.capUnits) > s.thresholdCredits ? "awaiting_approval" : "ready",
      heldPaid: 0,
      heldMonthly: 0,
      heldPeriod: null,
      chargeUnits: 0,
      refundedUnits: 0,
      attempts: [],
      maxAttempts: 3,
      consecutiveFailures: 0,
    });
  } else {
    if (!run) throw new Error("Unknown credit run");
    if (c.type === "approve") {
      if (run.phase !== "awaiting_approval" || c.capUnits !== run.capUnits)
        throw new Error("Approval must match the pending quote exactly");
      run.approvedBy = c.actorId;
      run.phase = "ready";
    } else if (c.type === "start") {
      if (run.phase !== "ready") {
        allowed = false;
        reason = run.phase === "awaiting_approval" ? "approval_required" : "not_startable";
      } else if (run.capUnits > s.paidUnits + s.monthlyUnits) {
        allowed = false;
        reason = "insufficient_credits";
      } else {
        run.heldMonthly = Math.min(s.monthlyUnits, run.capUnits);
        run.heldPaid = run.capUnits - run.heldMonthly;
        run.heldPeriod = s.period;
        s.monthlyUnits -= run.heldMonthly;
        s.paidUnits -= run.heldPaid;
        run.phase = "running";
      }
    } else if (c.type === "beginAttempt") {
      if (run.phase !== "running") {
        allowed = false;
        reason = run.pauseReason ?? "not_running";
      } else if (run.attempts.some((a) => a.id === c.attemptId)) {
        allowed = false;
        reason = "attempt_already_started";
      } else if (run.attempts.some((a) => a.success === undefined)) {
        allowed = false;
        reason = "attempt_usage_pending";
      } else if (run.attempts.length >= run.maxAttempts) {
        run.phase = "paused";
        run.pauseReason = "attempt_limit";
        allowed = false;
        reason = "attempt_limit";
      } else run.attempts.push({ id: c.attemptId });
    } else if (c.type === "reportAttempt") {
      const attempt = run.attempts.find((a) => a.id === c.attemptId);
      if (!attempt) throw new Error("Unknown attempt");
      if (attempt.success !== undefined) {
        if (attempt.success !== c.success || attempt.fingerprint !== c.failureFingerprint)
          throw new Error("Conflicting attempt report");
      } else {
        if (!c.success && !c.failureFingerprint) throw new Error("Failure fingerprint required");
        attempt.success = c.success;
        attempt.fingerprint = c.failureFingerprint;
        run.consecutiveFailures = c.success
          ? 0
          : run.lastFailure === c.failureFingerprint
            ? run.consecutiveFailures + 1
            : 1;
        run.lastFailure = c.failureFingerprint;
        if (run.consecutiveFailures >= 2) {
          run.phase = "paused";
          run.pauseReason = "repeated_failure";
        }
      }
    } else if (c.type === "resume") {
      if (
        run.phase !== "paused" ||
        !["attempt_limit", "repeated_failure"].includes(run.pauseReason ?? "") ||
        run.attempts.some((a) => a.success === undefined)
      )
        throw new Error("Run cannot resume until unresolved work is settled");
      run.maxAttempts = run.attempts.length + c.extraAttempts;
      run.consecutiveFailures = 0;
      run.phase = "running";
      run.pauseReason = undefined;
    } else if (c.type === "finish") {
      if (!["running", "paused"].includes(run.phase)) throw new Error("Run is not active");
      if (c.outcome === "unknown_failure") {
        run.phase = "paused";
        run.pauseReason = "failure_review";
        allowed = false;
        reason = "failure_review";
      } else {
        if (run.attempts.some((a) => a.success === undefined))
          throw new Error("Reconcile in-flight attempts before finishing");
        if (c.chargeUnits > run.capUnits) throw new Error("Charge exceeds authorized cap");
        if (c.outcome === "platform_failure" && (!c.evidenceRef || c.chargeUnits !== 0))
          throw new Error("Platform failure requires evidence and zero customer charge");
        const chargedMonthly = Math.min(c.chargeUnits, run.heldMonthly),
          chargedPaid = c.chargeUnits - chargedMonthly;
        const unusedMonthly = run.heldMonthly - chargedMonthly,
          unusedPaid = run.heldPaid - chargedPaid;
        if (c.outcome === "platform_failure")
          s.paidUnits = units.parse(s.paidUnits + unusedMonthly + unusedPaid);
        else {
          s.paidUnits = units.parse(s.paidUnits + unusedPaid);
          if (run.heldPeriod === s.period)
            s.monthlyUnits = units.parse(s.monthlyUnits + unusedMonthly);
        }
        run.heldMonthly = 0;
        run.heldPaid = 0;
        run.chargeUnits = c.chargeUnits;
        run.failureEvidence = c.evidenceRef;
        run.phase = c.outcome === "success" ? "completed" : "failed";
        run.pauseReason = undefined;
      }
    } else if (c.type === "refund") {
      if (!["completed", "failed"].includes(run.phase))
        throw new Error("Finish the run before refunding");
      const returned = run.chargeUnits - run.refundedUnits;
      s.paidUnits = units.parse(s.paidUnits + returned);
      run.refundedUnits += returned;
      run.failureEvidence = c.evidenceRef;
    }
  }
  if (allowed) s.receipts.push({ id: c.id, fingerprint });
  s.version++;
  return { state: s, allowed, reason, replayed: false };
}
export interface WalletStore {
  read(accountId: string): Promise<WalletState>;
  compareAndSwap(version: number, next: WalletState, command: WalletCommand): Promise<boolean>;
}
export class CreditWallet {
  constructor(private store: WalletStore) {}
  async status(id: string) {
    return walletStatus(await this.store.read(id));
  }
  async execute(id: string, raw: WalletCommand) {
    const command = WalletCommandSchema.parse(raw);
    for (let i = 0; i < 30; i++) {
      const state = await this.store.read(id),
        result = walletTransition(state, command);
      if (
        result.replayed ||
        (await this.store.compareAndSwap(state.version, result.state, command))
      )
        return {
          ...walletStatus(result.state),
          allowed: result.allowed,
          reason: result.reason,
          replayed: result.replayed,
        };
    }
    throw new Error("Wallet contention; retry the same command ID");
  }
}
export class MemoryWalletStore implements WalletStore {
  private states = new Map<string, WalletState>();
  async read(id: string) {
    return structuredClone(this.states.get(id) ?? initialWallet(id));
  }
  async compareAndSwap(version: number, next: WalletState) {
    if ((this.states.get(next.accountId)?.version ?? 0) !== version) return false;
    this.states.set(next.accountId, structuredClone(next));
    return true;
  }
}
