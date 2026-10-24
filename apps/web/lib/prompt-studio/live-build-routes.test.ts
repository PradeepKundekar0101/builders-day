import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), rpc: vi.fn(), signed: vi.fn() }));
vi.mock("./server", () => ({
  studioUser: m.user,
  studioDb: () => ({ from: m.from }),
  studioError: (e: Error & { status?: number }) =>
    Response.json({ error: e.message }, { status: e.status ?? 400 }),
}));
vi.mock("@/lib/cost/server", () => ({
  costService: () => ({
    db: { from: m.from, rpc: m.rpc, storage: { from: () => ({ createSignedUrl: m.signed }) } },
  }),
  requireSameOrigin: (request: Request) => {
    if (request.headers.get("origin") !== "https://test.example") throw new Error("Invalid origin");
  },
}));
import { POST } from "@/app/api/prompt-studio/prepare/route";
import { GET } from "@/app/api/prompt-studio/build-status/[id]/route";
const id = "11111111-1111-4111-8111-111111111111";
let filters: unknown[][] = [];
function row(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"])
    q[method] = (...args: unknown[]) => {
      filters.push([method, ...args]);
      return q;
    };
  q.single = q.maybeSingle = q.limit = async () => ({ data, error: null });
  return q;
}
const prepare = () =>
  POST(
    new Request("https://test.example/api/prompt-studio/prepare", {
      method: "POST",
      headers: { origin: "https://test.example", "content-type": "application/json" },
      body: JSON.stringify({ sessionId: id, revision: 1 }),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  filters = [];
  m.user.mockResolvedValue("owner");
  vi.stubEnv("PROVN_LIVE_BUILDS", "true");
});
it("does not access storage before authentication", async () => {
  m.user.mockRejectedValue(Object.assign(new Error("Sign in"), { status: 401 }));
  expect((await prepare()).status).toBe(401);
  expect(m.from).not.toHaveBeenCalled();
});
it("blocks activation while disabled", async () => {
  vi.stubEnv("PROVN_LIVE_BUILDS", "false");
  expect((await prepare()).status).toBe(503);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects stale or unreviewed versions before a quote", async () => {
  m.from.mockReturnValueOnce(row({ revision: 2 }));
  expect((await prepare()).status).toBe(409);
  m.from.mockReturnValueOnce(row({ revision: 1 })).mockReturnValueOnce(row({ status: "draft" }));
  expect((await prepare()).status).toBe(409);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("does not sign another users artifact", async () => {
  m.from.mockReturnValueOnce(row(null));
  expect(
    (await GET(new Request("https://test.example"), { params: Promise.resolve({ id }) })).status,
  ).toBe(404);
  expect(filters).toContainEqual(["eq", "user_id", "owner"]);
  expect(m.signed).not.toHaveBeenCalled();
});
it("only signs completed artifacts and marks responses private to the request", async () => {
  m.from
    .mockReturnValueOnce(row({ id, status: "auditing", spent_usd: 1, budget_usd: 2 }))
    .mockReturnValueOnce(
      row({
        status: "ready",
        artifact_path: "owner/build/product.zip",
        message: "Ready",
        checks: {},
      }),
    )
    .mockReturnValueOnce(row([{ payload: { message: "Compiled" } }]));
  m.signed.mockResolvedValue({
    data: { signedUrl: "https://download.example/short-lived" },
    error: null,
  });
  const res = await GET(new Request("https://test.example"), { params: Promise.resolve({ id }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(m.signed).toHaveBeenCalledWith("owner/build/product.zip", 60, {
    download: "provn-product.zip",
  });
});
