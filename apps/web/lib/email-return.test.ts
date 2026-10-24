import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { emailReturnUrl } from "./email-return";
const auth = vi.hoisted(() => ({ verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth }) }));
import { GET } from "../app/auth/confirm/route";
const next = "/apps/new?resume=00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.resetAllMocks();
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
});
test("the form gives the email template a callback URL with a query delimiter", () => {
  const emailed = new URL(
    `${emailReturnUrl("https://provn.test/", next)}&token_hash=test&type=email`,
  );
  expect(emailed.pathname).toBe("/auth/confirm");
  expect(emailed.searchParams.get("next")).toBe(next);
});
test("token-hash confirmation returns to Prompt Studio", async () => {
  const res = await GET(
    new NextRequest(
      `https://provn.test/auth/confirm?token_hash=test&type=email&next=${encodeURIComponent(next)}`,
    ),
  );
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "test", type: "email" });
  expect(res.headers.get("location")).toBe(`https://provn.test${next}`);
});
test("default Supabase PKCE emails are also accepted", async () => {
  const res = await GET(
    new NextRequest(`https://provn.test/auth/confirm?code=test&next=${encodeURIComponent(next)}`),
  );
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test");
  expect(res.headers.get("location")).toBe(`https://provn.test${next}`);
});
test("expired links keep the draft destination for retry", async () => {
  auth.verifyOtp.mockResolvedValue({ error: { message: "expired" } });
  const res = await GET(
    new NextRequest(
      `https://provn.test/auth/confirm?token_hash=test&type=email&next=${encodeURIComponent(next)}`,
    ),
  );
  const url = new URL(res.headers.get("location")!);
  expect(url.pathname).toBe("/signin");
  expect(url.searchParams.get("next")).toBe(next);
});
test("external return URLs cannot redirect out of the app", async () => {
  const res = await GET(
    new NextRequest(
      "https://provn.test/auth/confirm?token_hash=test&type=email&next=https://evil.test",
    ),
  );
  expect(res.headers.get("location")).toBe("https://provn.test/apps");
});
