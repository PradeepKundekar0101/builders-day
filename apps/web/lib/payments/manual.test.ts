import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  identity: vi.fn(),
  insert: vi.fn(),
  origin: vi.fn(),
  fund: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@/lib/cost/server", () => ({
  costIdentity: m.identity,
  requireSameOrigin: m.origin,
  costService: () => ({
    db: {
      from: (table: string) =>
        table === "prompt_studio_sessions"
          ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: m.lookup }) }) }) }
          : { insert: m.insert },
    },
    wallet: { execute: m.fund },
  }),
}));
vi.mock("./errors", () => ({
  paymentError: () => Response.json({ error: "Rejected" }, { status: 400 }),
}));
import { POST } from "@/app/api/credits/manual/route";
const body = { id: "439175dc-cc10-4efe-a73f-23f979a24499", credits: 100 };
const request = (data: unknown = body) =>
  new Request("http://localhost/api/credits/manual", {
    method: "POST",
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.identity.mockResolvedValue({ userId: "buyer" });
  m.insert.mockResolvedValue({ error: null });
});
it("stores a pending claim without funding the wallet", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(m.insert).toHaveBeenCalledWith({ ...body, account_id: "buyer" });
  expect(m.fund).not.toHaveBeenCalled();
});
it("rejects duplicate pending purchases without crediting", async () => {
  m.insert.mockResolvedValue({ error: { code: "23505" } });
  expect((await POST(request())).status).toBe(409);
  expect(m.fund).not.toHaveBeenCalled();
});
it("requires authentication", async () => {
  m.identity.mockRejectedValue(new Error("UNAUTHENTICATED"));
  expect((await POST(request())).status).toBe(400);
  expect(m.insert).not.toHaveBeenCalled();
});
it("rejects invalid claims before database writes", async () => {
  expect((await POST(request({ ...body, credits: -100 }))).status).toBe(400);
  expect(m.insert).not.toHaveBeenCalled();
});

it("persists the owned build version with a payment", async () => {
  m.lookup.mockResolvedValue({ data: { revision: 2 }, error: null });
  const buildContext = { session: body.id, revision: 2 };
  expect((await POST(request({ ...body, buildContext }))).status).toBe(200);
  expect(m.insert).toHaveBeenCalledWith({
    ...body,
    account_id: "buyer",
    build_session: body.id,
    build_revision: 2,
  });
});
it("rejects a changed or inaccessible build before payment creation", async () => {
  const buildContext = { session: body.id, revision: 2 };
  for (const data of [null, { revision: 3 }]) {
    m.lookup.mockResolvedValue({ data, error: null });
    expect((await POST(request({ ...body, buildContext }))).status).toBe(409);
  }
  expect(m.insert).not.toHaveBeenCalled();
});
