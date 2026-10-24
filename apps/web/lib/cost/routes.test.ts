import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  service: vi.fn(),
  sameOrigin: vi.fn(),
  execute: vi.fn(),
  status: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/cost/server", () => ({
  costIdentity: mocks.identity,
  costService: mocks.service,
  requireSameOrigin: mocks.sameOrigin,
  costError: (error: Error) =>
    Response.json(
      { error: error.message },
      { status: error.message === "UNAUTHENTICATED" ? 401 : 404 },
    ),
}));
import { POST, GET } from "../../app/api/cost/budget/[id]/route";
const id = "00000000-0000-4000-8000-000000000010",
  owner = "00000000-0000-4000-8000-000000000001",
  decisionId = "00000000-0000-4000-8000-000000000020";
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: mocks.query.mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
  };
  mocks.identity.mockResolvedValue({ db: { from: () => query }, userId: owner });
  mocks.service.mockReturnValue({
    guard: {
      execute: mocks.execute.mockResolvedValue({ capMicros: 2000000 }),
      status: mocks.status.mockResolvedValue({ capMicros: 1000000 }),
    },
  });
});
it("refuses unauthenticated budget access", async () => {
  mocks.identity.mockRejectedValue(new Error("UNAUTHENTICATED"));
  expect((await GET(new Request("http://localhost"), context)).status).toBe(401);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("requires ownership before reading the service-role state", async () => {
  const single = vi.fn().mockResolvedValue({ data: null, error: {} });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single };
  mocks.identity.mockResolvedValue({ db: { from: () => query }, userId: owner });
  expect((await GET(new Request("http://localhost"), context)).status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();
});
it("uses the authenticated actor and exact amount, ignoring supplied actor", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({
      action: "approve",
      decisionId,
      newCapMicros: 2000000,
      actorId: "attacker",
    }),
  });
  expect((await POST(request, context)).status).toBe(200);
  expect(mocks.query).toHaveBeenCalledWith("user_id", owner);
  expect(mocks.execute).toHaveBeenCalledWith(id, {
    type: "approve",
    id: decisionId,
    actorId: owner,
    newCapMicros: 2000000,
  });
  expect(mocks.sameOrigin).toHaveBeenCalledWith(request);
});
it("rejects invalid approval amounts before execution", async () => {
  await POST(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ action: "approve", decisionId, newCapMicros: -1 }),
    }),
    context,
  );
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("blocks an invalid origin before looking up identity", async () => {
  mocks.sameOrigin.mockImplementation(() => {
    throw new Error("INVALID_ORIGIN");
  });
  await POST(new Request("http://localhost", { method: "POST" }), context);
  expect(mocks.identity).not.toHaveBeenCalled();
});
