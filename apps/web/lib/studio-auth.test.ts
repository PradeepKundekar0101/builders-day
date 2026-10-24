import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ exchange: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/public-env", () => ({
  publicEnv: {
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "test",
    siteUrl: "https://provn.test",
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: m.exchange } }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: m.claims } }) }));
import { GET } from "../app/auth/callback/route";
import { updateSession } from "./supabase/session";
const next = "/apps/new?resume=00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  m.exchange.mockResolvedValue({ error: null });
  m.claims.mockResolvedValue({ data: { claims: { sub: "user" } } });
});
test("Google callback returns to the same draft after PKCE exchange", async () => {
  const response = await GET(
    new NextRequest(
      `https://provn.test/auth/callback?code=test-code&next=${encodeURIComponent(next)}`,
    ),
  );
  expect(m.exchange).toHaveBeenCalledWith("test-code");
  expect(response.headers.get("location")).toBe(`https://provn.test${next}`);
});
test("cancelled and failed sign-in retain the return path for retry", async () => {
  for (const code of ["", "&code=bad"]) {
    m.exchange.mockResolvedValue({ error: { message: "denied" } });
    const response = await GET(
      new NextRequest(`https://provn.test/auth/callback?next=${encodeURIComponent(next)}${code}`),
    );
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/signin");
    expect(url.searchParams.get("next")).toBe(next);
  }
});
test("an existing session skips login and returns to the requested draft", async () => {
  const response = await updateSession(
    new NextRequest(`https://provn.test/signin?next=${encodeURIComponent(next)}`),
  );
  expect(response.headers.get("location")).toBe(`https://provn.test${next}`);
});
test("signed-out protected route preserves the draft destination", async () => {
  m.claims.mockResolvedValue({ data: { claims: null } });
  const response = await updateSession(new NextRequest(`https://provn.test${next}`));
  expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe(next);
});
test("callback rejects an external redirect", async () => {
  const response = await GET(
    new NextRequest("https://provn.test/auth/callback?code=test&next=https://evil.test"),
  );
  expect(response.headers.get("location")).toBe("https://provn.test/apps");
});
