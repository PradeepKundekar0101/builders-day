import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  fetchSignInLink,
  freshEmail,
  generatedConfirmPath,
  remote,
  signInViaGeneratedLink,
} from "./helpers";

test("landing shows PROVN onboarding and sign-in remains accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/prompt-studio-demo$/);
  await expect(page.getByRole("heading", { name: "A workspace that fits you." })).toBeVisible();
  await page.getByRole("button", { name: "Continue to my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Every build, proven." })).toBeVisible();
  await expect(page.getByLabel("Describe your product")).toBeVisible();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test("signed-out /apps redirects to /signin?next=%2Fapps", async ({ page }) => {
  await page.goto("/apps");
  await expect(page).toHaveURL(/\/signin\?next=%2Fapps$/);
});

test("email sign-up through the form", async ({ page }) => {
  test.skip(remote, "Reads the local Mailpit inbox");
  const email = freshEmail("signup");
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email for a sign-in link.")).toBeVisible();

  await page.goto(await fetchSignInLink(email));
  await expect(page).toHaveURL(/\/apps$/);
  await expect(page.getByRole("heading", { name: "My apps" })).toBeVisible();
  await expect(
    page.getByText("Start with an idea. Shape it into a clear product brief."),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("email link keeps the page the user was headed to", async ({ page }) => {
  test.skip(remote, "Reads the local Mailpit inbox");
  const email = freshEmail("deeplink");
  await page.goto("/signin?next=%2Fapps%3Fwelcome%3D1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email for a sign-in link.")).toBeVisible();
  await page.goto(await fetchSignInLink(email));
  await expect(page).toHaveURL(/\/apps\?welcome=1$/);
});

test("generated-link sign-in lands on My apps", async ({ page }) => {
  await signInViaGeneratedLink(page, freshEmail("link"));
  await expect(page).toHaveURL(/\/apps$/);
});

test("signed-in /signin redirects to /apps", async ({ page }) => {
  await signInViaGeneratedLink(page, freshEmail("redirect"));
  await page.goto("/signin");
  await expect(page).toHaveURL(/\/apps$/);
});

test("sign out returns to landing and /apps redirects again", async ({ page }) => {
  await signInViaGeneratedLink(page, freshEmail("signout"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/prompt-studio-demo$/);
  await page.goto("/apps");
  await expect(page).toHaveURL(/\/signin/);
});

test("a cross-site sign-out request is refused", async ({ page }) => {
  await signInViaGeneratedLink(page, freshEmail("csrf"));
  const response = await page.request.post("/auth/signout", {
    headers: { Origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
  await page.goto("/apps");
  await expect(page.getByRole("heading", { name: "My apps" })).toBeVisible();
});

test("Continue with Google starts the OAuth flow", async ({ page }) => {
  test.skip(remote && process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED !== "true", "Google is off");
  await page.goto("/signin");
  const authorize = page.waitForRequest(/\/auth\/v1\/authorize\?provider=google/);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await authorize;
});

test("bad token shows an error", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=nope&type=email");
  await expect(page).toHaveURL(/\/signin/);
  await expect(
    page.getByText("That sign-in link is invalid or expired. Request a new one."),
  ).toBeVisible();
});

test.describe("open redirect in next is ignored", () => {
  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com", "/\t/evil.com"]) {
    test(`next=${next}`, async ({ page }) => {
      await page.goto(await generatedConfirmPath(freshEmail("next"), next));
      await expect(page).toHaveURL(/\/apps$/);
      expect(new URL(page.url()).hostname).not.toContain("evil");
    });
  }
});

test("OAuth callback with a bad code and a hostile next stays on site", async ({ page }) => {
  await page.goto("/auth/callback?code=bad&next=%2F%09%2Fevil.com");
  await expect(page).toHaveURL(/\/signin\?error=link$/);
});

test("a refreshed session is never cacheable", async ({ page, context }) => {
  await signInViaGeneratedLink(page, freshEmail("cache"));
  const cookies = await context.cookies();
  const auth = cookies.filter((c) => /-auth-token(\.\d+)?$/.test(c.name));
  expect(auth.length).toBeGreaterThan(0);
  const raw = auth
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  await context.clearCookies();
  const name = auth[0]!.name.replace(/\.\d+$/, "");
  await context.addCookies([{ ...auth[0]!, name, value }]);

  const response = await page.request.get("/");
  expect(response.headers()["set-cookie"]).toContain("-auth-token");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("no horizontal scroll on public pages", async ({ page }) => {
  for (const path of ["/", "/signin"]) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
});

test("no horizontal scroll on My apps", async ({ page }) => {
  await signInViaGeneratedLink(page, freshEmail("scroll"));
  await expectNoHorizontalScroll(page);
});

test("pages render without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.goto("/signin");
  await signInViaGeneratedLink(page, freshEmail("console"));
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
