/** Frontend demo fixtures only. These are not billing, routing, or release authorities. */
export type BuilderProfile = {
  persona: "non-tech" | "indie" | "team";
  mode: "plain" | "dev";
  budgetCap: number;
  approvalThreshold: number;
  privateMode: boolean;
  plan: "free" | "builder" | "pro" | "team";
  byok: boolean;
};
export const DEFAULT_PROFILE: BuilderProfile = {
  persona: "non-tech",
  mode: "plain",
  budgetCap: 200,
  approvalThreshold: 50,
  privateMode: false,
  plan: "free",
  byok: false,
};
export const PLANS = {
  free: { label: "Free", credits: 300, price: "$0 / month" },
  builder: { label: "Builder", credits: 2500, price: "$20 / month" },
  pro: { label: "Pro", credits: 7000, price: "$50 / month" },
  team: { label: "Team", credits: 10000, price: "Custom · demo pool: 10,000" },
};
export type Scope = "lean" | "standard" | "max";
export function demoQuote(scope: Scope) {
  const total = scope === "lean" ? 90 : scope === "max" ? 260 : 180;
  return {
    total,
    tokens: scope === "lean" ? 28000 : scope === "max" ? 110000 : 60000,
    minutes: scope === "lean" ? 7 : scope === "max" ? 19 : 12,
    items: [
      { name: "Prompt + model tasks", credits: total - 70 },
      { name: "Launch + smoke check", credits: 15 },
      { name: "Shield / Siege attacks", credits: 30 },
      { name: "Guild review allowance", credits: 25 },
    ],
  };
}
export type DemoState = {
  phase:
    | "idle"
    | "approved"
    | "built"
    | "deployed"
    | "attacked"
    | "triaged"
    | "fixed"
    | "proven"
    | "stopped";
  fingerprint: string;
  reserved: number;
  spent: number;
  refund: number;
  ledger: { label: string; credits: number }[];
  smoke: "not-run" | "pass" | "fail";
  criticalOpen: number;
  highOpen: number;
  reviewer: "pending" | "confirmed";
  retries: number;
};
export const INITIAL_DEMO: DemoState = {
  phase: "idle",
  fingerprint: "",
  reserved: 0,
  spent: 0,
  refund: 0,
  ledger: [],
  smoke: "not-run",
  criticalOpen: 0,
  highOpen: 0,
  reviewer: "pending",
  retries: 0,
};
export type DemoContext = {
  fingerprint: string;
  reviewed: boolean;
  profile: BuilderProfile;
  scope: Scope;
};
export type DemoAction =
  | "approve"
  | "build"
  | "deploy"
  | "attack"
  | "triage"
  | "fix"
  | "smoke-pass"
  | "smoke-fail"
  | "platform-failure";
export function demoTransition(state: DemoState, action: DemoAction, ctx: DemoContext): DemoState {
  const quote = demoQuote(ctx.scope);
  const balance = PLANS[ctx.profile.plan].credits - state.spent;
  if (action === "approve") {
    if (!ctx.reviewed) throw Error("Review the brief and done criteria before approving a run.");
    if (!["idle", "approved", "stopped"].includes(state.phase))
      throw Error("Finish or stop the current demo run first.");
    if (quote.total > ctx.profile.budgetCap)
      throw Error("This quote exceeds your hard cap. Choose a smaller scope or raise the cap.");
    if (quote.total > balance) throw Error("Not enough demo credits. Choose a smaller scope.");
    if (ctx.scope === "max" && ctx.profile.plan === "free")
      throw Error("Free uses cheaper models only. Choose Standard or Lean.");
    return {
      ...INITIAL_DEMO,
      phase: "approved",
      fingerprint: ctx.fingerprint,
      reserved: quote.total,
      spent: state.spent,
      ledger: state.ledger,
    };
  }
  if (state.fingerprint !== ctx.fingerprint || !ctx.reviewed)
    throw Error("Your brief or settings changed. Review and approve a fresh quote first.");
  if (action === "build") {
    if (state.phase !== "approved") throw Error("Approve the Cost Guard quote before building.");
    if (state.reserved > ctx.profile.budgetCap || state.reserved > balance)
      throw Error("Spend cap or balance prevents this run.");
    return {
      ...state,
      phase: "built",
      spent: state.spent + state.reserved,
      ledger: [...state.ledger, { label: "Simulated run debit", credits: -state.reserved }],
    };
  }
  if (action === "platform-failure") {
    if (!["built", "deployed"].includes(state.phase))
      throw Error("Start a demo build before testing the loop breaker.");
    return {
      ...state,
      phase: "stopped",
      retries: 3,
      spent: state.spent - state.reserved,
      refund: state.reserved,
      ledger: [
        ...state.ledger,
        {
          label: "Platform failure refund · loop stopped after 3 attempts",
          credits: state.reserved,
        },
      ],
    };
  }
  const required: Partial<Record<DemoAction, DemoState["phase"]>> = {
    deploy: "built",
    attack: "deployed",
    triage: "attacked",
    fix: "triaged",
  };
  if (required[action] && state.phase !== required[action])
    throw Error(`Complete the preceding step before ${action}.`);
  if (action === "deploy") return { ...state, phase: "deployed" };
  if (action === "attack") return { ...state, phase: "attacked", criticalOpen: 1, highOpen: 1 };
  if (action === "triage") return { ...state, phase: "triaged", reviewer: "confirmed" };
  if (action === "fix")
    return { ...state, phase: "fixed", criticalOpen: 0, highOpen: 0, smoke: "not-run" };
  if (action === "smoke-fail") {
    if (state.phase !== "fixed")
      throw Error("Resolve security findings before the release smoke check.");
    return { ...state, smoke: "fail" };
  }
  if (action === "smoke-pass") {
    if (
      state.phase !== "fixed" ||
      state.criticalOpen ||
      state.highOpen ||
      state.reviewer !== "confirmed"
    )
      throw Error("Open findings or missing Guild review block release proof.");
    return {
      ...state,
      phase: "proven",
      smoke: "pass",
      spent: state.spent - 12,
      refund: 12,
      ledger: [...state.ledger, { label: "Unused estimate refund", credits: 12 }],
    };
  }
  throw Error("Unsupported demo action.");
}
export function demoRoutes(profile: BuilderProfile, scope: Scope) {
  return ["App shell & UI", "Data model", "Security review"].map((task, i) => ({
    task,
    effort: i === 0 ? "Low" : i === 1 ? "Medium" : "High",
    impact: i === 2 ? "High" : "Medium",
    library: profile.privateMode
      ? "Lib 3 · local"
      : scope === "max" && profile.plan !== "free" && i === 2
        ? "Lib 1 · frontier"
        : "Lib 2 · Hugging Face SLM",
    model: profile.privateMode
      ? i === 1
        ? "Qwen (local)"
        : "Gemma (local)"
      : scope === "max" && profile.plan !== "free" && i === 2
        ? "Frontier adapter"
        : "SLM adapter",
    reason: profile.privateMode
      ? "Private mode forces local inference."
      : i === 2 && scope === "max" && profile.plan !== "free"
        ? "High impact + Max quality override."
        : "Cheapest eligible tier; real quality eval pending.",
  }));
}
