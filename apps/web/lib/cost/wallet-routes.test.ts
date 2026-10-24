import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  identity: vi.fn(),
  service: vi.fn(),
  origin: vi.fn(),
  execute: vi.fn(),
  status: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));
vi.mock("@/lib/cost/server", () => ({
  costIdentity: m.identity,
  costService: m.service,
  requireSameOrigin: m.origin,
  costError: (e: Error) =>
    Response.json({ error: e.message }, { status: e.message === "UNAUTHENTICATED" ? 401 : 400 }),
}));
import { GET, POST as settings } from "../../app/api/cost/wallet/route";
import { POST as decision } from "../../app/api/cost/wallet/runs/[id]/route";
import { POST as prepare } from "../../app/api/cost/wallet/runs/route";
const owner = "00000000-0000-4000-8000-000000000001",
  runId = "00000000-0000-4000-8000-000000000002",
  specId = "00000000-0000-4000-8000-000000000003",
  decisionId = "00000000-0000-4000-8000-000000000004";
const context = { params: Promise.resolve({ id: runId }) };
const request = (body: unknown) =>
  new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: m.single,
  };
  m.identity.mockResolvedValue({ userId: owner, db: { from: () => query } });
  m.service.mockReturnValue({
    wallet: {
      execute: m.execute.mockResolvedValue({ allowed: true }),
      status: m.status.mockResolvedValue({ runs: [{ id: runId }] }),
    },
    db: { from: () => ({ insert: m.insert }) },
  });
});
it("rejects unauthenticated reads without service access", async () => {
  m.identity.mockRejectedValue(new Error("UNAUTHENTICATED"));
  expect((await GET()).status).toBe(401);
  expect(m.service).not.toHaveBeenCalled();
});
it("derives wallet owner and approval actor from authenticated claims", async () => {
  expect(
    (
      await decision(
        request({
          action: "approve",
          decisionId,
          capCredits: 60,
          actorId: "attacker",
          accountId: "attacker",
        }),
        context,
      )
    ).status,
  ).toBe(200);
  expect(m.status).toHaveBeenCalledWith(owner);
  expect(m.execute).toHaveBeenCalledWith(owner, {
    type: "approve",
    id: decisionId,
    runId,
    capUnits: 600000,
    actorId: owner,
  });
});
it("rejects another owner's run and browser funding/refunds", async () => {
  m.status.mockResolvedValue({ runs: [] });
  expect((await decision(request({ action: "start", decisionId }), context)).status).toBe(400);
  for (const action of ["topup", "refund", "finish", "allowance"])
    expect((await decision(request({ action, decisionId }), context)).status).toBe(400);
  expect(m.execute).not.toHaveBeenCalled();
});
it("checks origin before wallet mutations and permits only a bounded threshold", async () => {
  await settings(request({ decisionId, thresholdCredits: 75, paidUnits: 1000000 }));
  expect(m.execute).toHaveBeenCalledWith(owner, { type: "threshold", id: decisionId, credits: 75 });
  m.identity.mockClear();
  m.origin.mockImplementation(() => {
    throw new Error("INVALID_ORIGIN");
  });
  await decision(request({ action: "start", decisionId }), context);
  expect(m.identity).not.toHaveBeenCalled();
});
it("prevents flagged specs or unverified BYOK from becoming executable quotes", async () => {
  const body = {
    runId,
    specId,
    selection: { specRevision: `${specId}:1`, selectedIds: ["page:0"] },
  };
  m.single.mockResolvedValue({ data: { id: specId, version: 1, operator_status: "pending" } });
  expect((await prepare(request(body))).status).toBe(400);
  expect(m.insert).not.toHaveBeenCalled();
  m.single.mockResolvedValue({ data: { id: specId, version: 1, operator_status: "approved" } });
  expect((await prepare(request({ ...body, billingMode: "byok" }))).status).toBe(400);
  expect(m.insert).not.toHaveBeenCalled();
});

it("recomputes locked quotes from server pricing and safely retries the same UUID", async () => {
  const { DEFAULT_PRICING } = await import("@buildwise/estimator");
  const spec = {
    name: "Home",
    summary: "A landing page",
    pages: [{ name: "Home", purpose: "Landing", mustHave: true }],
    entities: [],
    auth: { enabled: false, providers: [] },
    integrations: [],
  };
  m.single.mockResolvedValue({
    data: { id: specId, version: 1, spec, operator_status: "not_needed" },
  });
  let stored: Record<string, unknown> | undefined;
  m.insert.mockImplementation(async (row) => {
    if (stored) return { error: { code: "23505" } };
    stored = row;
    return { error: null };
  });
  m.service.mockReturnValue({
    wallet: { execute: m.execute },
    db: {
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => q,
          single: async () => ({
            data: table === "cost_pricing_versions" ? { config: DEFAULT_PRICING } : stored,
          }),
          insert: m.insert,
        };
        return q;
      },
    },
  });
  const body = {
    runId,
    specId,
    selection: { specRevision: `${specId}:1`, selectedIds: ["page:0"] },
    costUsd: 0,
    accountId: "attacker",
  };
  expect((await prepare(request(body))).status).toBe(200);
  expect(stored).toMatchObject({
    cost_usd: 1.18,
    user_id: owner,
    status: "locked",
    selected_features: body.selection,
  });
  expect(m.execute).toHaveBeenCalledWith(
    owner,
    expect.objectContaining({ type: "quote", capUnits: 1180000 }),
  );
  expect((await prepare(request(body))).status).toBe(200);
  stored = { ...stored, cost_usd: 0 };
  expect((await prepare(request(body))).status).toBe(400);
});
