import { expect, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  fetchSignInLink,
  freshEmail,
  generatedConfirmPath,
  remote,
  signInViaGeneratedLink,
} from "./helpers";

test("landing shows the pitch and Price my idea goes to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know the price before you build." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Tell us your idea, see what it costs before you spend a rupee, approve it, and we build and deploy it securely.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Price my idea" }).click();
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
    page.getByText("No apps yet. Describe an idea and get a price in under a minute."),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
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
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/apps");
  await expect(page).toHaveURL(/\/signin/);
});

test("Continue with Google starts the OAuth flow", async ({ page }) => {
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
  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
    test(`next=${next}`, async ({ page }) => {
      await page.goto(await generatedConfirmPath(freshEmail("next"), next));
      await expect(page).toHaveURL(/\/apps$/);
      expect(new URL(page.url()).hostname).not.toContain("evil");
    });
  }
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
