import { z } from "zod";

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const key = z.string().min(1).max(200);
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reserve"), id: key, taskId: key, maxMicros: amount.positive() }),
  z.object({ type: z.literal("start"), id: key }),
  z.object({
    type: z.literal("reconcile"),
    id: key,
    actualMicros: amount,
    inputTokens: amount,
    outputTokens: amount,
    pricingVersion: key,
  }),
  z.object({ type: z.literal("cancel"), id: key }),
  z.object({
    type: z.literal("approve"),
    id: key,
    actorId: z.string().uuid(),
    newCapMicros: amount.positive(),
  }),
  z.object({ type: z.literal("stop"), id: key }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Reservation = {
  id: string;
  taskId: string;
  maxMicros: number;
  status: "reserved" | "started" | "settled" | "cancelled";
  usage?: {
    actualMicros: number;
    inputTokens: number;
    outputTokens: number;
    pricingVersion: string;
  };
};
export type BudgetState = {
  buildId: string;
  version: number;
  initialCapMicros: number;
  capMicros: number;
  spentMicros: number;
  stopped: boolean;
  breached: boolean;
  paused: boolean;
  reservations: Reservation[];
  approvals: { id: string; actorId: string; newCapMicros: number }[];
};
export function initialState(buildId: string, capMicros: number): BudgetState {
  key.parse(buildId);
  amount.positive().parse(capMicros);
  return {
    buildId,
    version: 0,
    initialCapMicros: capMicros,
    capMicros,
    spentMicros: 0,
    stopped: false,
    breached: false,
    paused: false,
    reservations: [],
    approvals: [],
  };
}
export const usdToMicros = (usd: number) =>
  amount.parse(Math.round(z.number().finite().nonnegative().parse(usd) * 1e6));
export function budgetStatus(s: BudgetState) {
  const reservedMicros = s.reservations
    .filter((r) => r.status === "reserved" || r.status === "started")
    .reduce((n, r) => n + r.maxMicros, 0);
  return {
    capMicros: s.capMicros,
    spentMicros: s.spentMicros,
    reservedMicros,
    availableMicros: Math.max(0, s.capMicros - s.spentMicros - reservedMicros),
    paused: s.paused,
    stopped: s.stopped,
    breached: s.breached,
  };
}
export type Decision = { allowed: boolean; reason: string };
export function transition(
  previous: BudgetState,
  raw: Command,
): { state: BudgetState; decision: Decision } {
  const c = CommandSchema.parse(raw),
    s = structuredClone(previous);
  let decision: Decision = { allowed: true, reason: "ok" };
  const existing = s.reservations.find((r) => r.id === c.id);
  if (c.type === "reserve") {
    if (existing) {
      if (existing.taskId !== c.taskId || existing.maxMicros !== c.maxMicros)
        throw new Error("Reservation id reused with different parameters");
      decision = {
        allowed: existing.status === "reserved" && !s.stopped && !s.breached,
        reason: `already_${existing.status}`,
      };
    } else if (s.stopped || s.breached) {
      decision = { allowed: false, reason: s.breached ? "provider_overrun" : "stopped" };
    } else if (c.maxMicros > budgetStatus(s).availableMicros) {
      s.paused = true;
      decision = { allowed: false, reason: "insufficient_budget" };
    } else {
      s.reservations.push({
        id: c.id,
        taskId: c.taskId,
        maxMicros: c.maxMicros,
        status: "reserved",
      });
      s.paused = false;
    }
  } else if (c.type === "start") {
    if (!existing) throw new Error("Unknown reservation");
    if (existing.status !== "reserved" || s.stopped || s.breached)
      decision = { allowed: false, reason: "not_startable" };
    else existing.status = "started";
  } else if (c.type === "reconcile") {
    if (!existing) throw new Error("Unknown reservation");
    const usage = {
      actualMicros: c.actualMicros,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      pricingVersion: c.pricingVersion,
    };
    if (existing.status === "settled") {
      if (
        existing.usage?.actualMicros !== usage.actualMicros ||
        existing.usage?.inputTokens !== usage.inputTokens ||
        existing.usage?.outputTokens !== usage.outputTokens ||
        existing.usage?.pricingVersion !== usage.pricingVersion
      )
        throw new Error("Conflicting usage replay");
    } else {
      if (existing.status !== "started") throw new Error("Only started calls can be reconciled");
      existing.usage = usage;
      existing.status = "settled";
      s.spentMicros = amount.parse(s.spentMicros + c.actualMicros);
      if (c.actualMicros > existing.maxMicros) {
        s.breached = true;
        s.paused = true;
        decision = { allowed: false, reason: "provider_overrun" };
      }
    }
  } else if (c.type === "cancel") {
    if (!existing) throw new Error("Unknown reservation");
    if (existing.status === "started" || existing.status === "settled")
      throw new Error("Started calls require usage reconciliation, not cancellation");
    existing.status = "cancelled";
  } else if (c.type === "approve") {
    const prior = s.approvals.find((a) => a.id === c.id);
    if (prior) {
      if (prior.actorId !== c.actorId || prior.newCapMicros !== c.newCapMicros)
        throw new Error("Conflicting approval replay");
    } else {
      if (s.stopped || s.breached)
        throw new Error("Stopped or breached budgets require investigation");
      if (c.newCapMicros <= s.capMicros) throw new Error("Approval must increase the cap");
      s.capMicros = c.newCapMicros;
      s.paused = false;
      s.approvals.push({ id: c.id, actorId: c.actorId, newCapMicros: c.newCapMicros });
    }
  } else {
    s.stopped = true;
    s.paused = true;
  }
  s.version++;
  return { state: s, decision };
}
export interface BudgetStore {
  read(buildId: string): Promise<BudgetState>;
  compareAndSwap(previousVersion: number, next: BudgetState, command: Command): Promise<boolean>;
}
/** Only trusted server code may call approve. Authenticate the actor before this boundary. */
export class CostGuard {
  constructor(private store: BudgetStore) {}
  async execute(buildId: string, raw: Command) {
    const command = CommandSchema.parse(raw);
    for (let attempt = 0; attempt < 20; attempt++) {
      const previous = await this.store.read(buildId),
        result = transition(previous, command);
      if (await this.store.compareAndSwap(previous.version, result.state, command))
        return { ...result.decision, ...budgetStatus(result.state) };
    }
    throw new Error("Budget contention: retry with the same command id");
  }
  async status(buildId: string) {
    return budgetStatus(await this.store.read(buildId));
  }
}
/** Demo/test only. Production uses PostgresStore. */
export class MemoryStore implements BudgetStore {
  private states = new Map<string, BudgetState>();
  create(buildId: string, capMicros: number) {
    if (this.states.has(buildId)) throw new Error("Budget exists");
    this.states.set(buildId, initialState(buildId, capMicros));
  }
  async read(id: string) {
    const state = this.states.get(id);
    if (!state) throw new Error("Unknown build");
    return structuredClone(state);
  }
  async compareAndSwap(version: number, next: BudgetState) {
    if (this.states.get(next.buildId)?.version !== version) return false;
    this.states.set(next.buildId, structuredClone(next));
    return true;
  }
}
export type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
/** Supply a server-only service-role Supabase client, never a browser client. */
export class PostgresStore implements BudgetStore {
  constructor(private client: RpcClient) {}
  private async call(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async read(buildId: string) {
    return (await this.call("cost_guard_read", { p_build_id: buildId })) as BudgetState;
  }
  async compareAndSwap(previousVersion: number, next: BudgetState, command: Command) {
    return (
      (await this.call("cost_guard_cas", {
        p_build_id: next.buildId,
        p_expected_version: previousVersion,
        p_state: next,
        p_command: command,
      })) === true
    );
  }
}

/** No automatic retry after start: a thrown provider request may still be billable. */
export async function runBoundedCall<T>(options: {
  guard: CostGuard;
  buildId: string;
  callId: string;
  taskId: string;
  maxMicros: number;
  execute: () => Promise<{
    value: T;
    actualMicros: number;
    inputTokens: number;
    outputTokens: number;
    pricingVersion: string;
  }>;
}) {
  const { guard, buildId, callId, taskId, maxMicros } = options;
  const reservation = await guard.execute(buildId, {
    type: "reserve",
    id: callId,
    taskId,
    maxMicros,
  });
  if (!reservation.allowed) return { executed: false as const, reason: reservation.reason };
  const start = await guard.execute(buildId, { type: "start", id: callId });
  if (!start.allowed) return { executed: false as const, reason: start.reason };
  const result = await options.execute();
  const settlement = await guard.execute(buildId, {
    type: "reconcile",
    id: callId,
    actualMicros: result.actualMicros,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    pricingVersion: result.pricingVersion,
  });
  return { executed: true as const, value: result.value, settlement };
}

export * from "./credits";
export * from "./wallet-postgres";

export * from "./credit-attempt";
