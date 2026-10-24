import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioHttpError } from "./request";
const mocks = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn() }));
vi.mock("./server", () => ({
  studioUser: mocks.user,
  studioDb: () => ({ from: mocks.from }),
  studioError: (e: Error & { status?: number }) =>
    Response.json({ error: e.message }, { status: e.status ?? 400 }),
}));
vi.mock("@/lib/public-env", () => ({ publicEnv: { siteUrl: "https://host.example.com" } }));
import { GET } from "@/app/api/prompt-studio/builds/[id]/route";
const run = "11111111-1111-4111-8111-111111111111",
  session = "22222222-2222-4222-8222-222222222222";
let filters: unknown[][];
function row(data: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gt", "order"])
    q[method] = (...args: unknown[]) => {
      filters.push([method, ...args]);
      return q;
    };
  q.maybeSingle = q.limit = () => Promise.resolve({ data, error });
  return q;
}
const call = () =>
  GET(
    new Request(
      `https://host.example.com/api/prompt-studio/builds/${run}?session=${session}&stage=0`,
    ),
    { params: Promise.resolve({ id: run }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  filters = [];
  mocks.user.mockResolvedValue("owner");
});
describe("owned build API", () => {
  it("requires verified login before querying storage", async () => {
    mocks.user.mockRejectedValue(new StudioHttpError(401, "Sign in"));
    expect((await call()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not reveal another user's build", async () => {
    mocks.from.mockReturnValueOnce(row(null));
    expect((await call()).status).toBe(404);
    expect(filters).toContainEqual(["eq", "user_id", "owner"]);
  });
  it("rejects a build from a different draft before reading events", async () => {
    mocks.from
      .mockReturnValueOnce(row({ quote_id: "quote" }))
      .mockReturnValueOnce(row({ spec_id: "spec" }))
      .mockReturnValueOnce(row({ idea_id: "other" }))
      .mockReturnValueOnce(row({ id: session }));
    expect((await call()).status).toBe(404);
    expect(mocks.from).toHaveBeenCalledTimes(4);
  });
  it("returns only validated events for an owned build and matching draft", async () => {
    mocks.from
      .mockReturnValueOnce(
        row({ quote_id: "quote", status: "running", budget_usd: 5, spent_usd: 1 }),
      )
      .mockReturnValueOnce(row({ spec_id: "spec" }))
      .mockReturnValueOnce(row({ idea_id: session }))
      .mockReturnValueOnce(row({ id: session }))
      .mockReturnValueOnce(
        row([{ id: 4, type: "studio", payload: { stage: 0, type: "started" } }]),
      );
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).events).toEqual([
      { runId: run, sequence: 4, stage: 0, type: "started" },
    ]);
    expect(filters.filter((f) => f[1] === "user_id")).toHaveLength(4);
  });
});
