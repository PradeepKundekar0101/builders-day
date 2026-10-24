import { expect, test } from "@playwright/test";

// Desktop only for now; the phone layout of the workspace is not finished.
test.skip(({ isMobile }) => isMobile, "Desktop journey");

const IDEA =
  "Build a private client portal for a small design agency. Clients should sign in, see project progress, approve designs, and share feedback. Team members manage their own projects.";

test("Prompt Studio: answer, estimate, build, preview, attack, fix", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/prompt-studio-demo");
  await page.getByRole("button", { name: /Continue to my workspace/ }).click();
  await page.getByRole("textbox", { name: "Describe your product" }).fill(IDEA);
  await page.getByRole("button", { name: "Shape my idea", exact: true }).click();

  // Answer each question by clicking a suggested option.
  const options = page.getByRole("group", { name: "Suggested answers" });
  for (const choice of [/see only their own projects/, /review it and approve/, /file uploads/]) {
    await expect(options.getByRole("button", { name: choice })).toBeVisible({ timeout: 15_000 });
    await options.getByRole("button", { name: choice }).click();
  }

  const card = page.getByRole("article", { name: "Estimate and build" });
  await expect(card.getByTestId("journey-cost")).toHaveText(/^\$\d+\.\d{2}$/, { timeout: 15_000 });
  await expect(card.getByTestId("journey-time")).toHaveText(/hour/);
  await expect(card.getByRole("heading", { name: "Private Client Portal" })).toBeVisible();

  await card.getByRole("button", { name: "Build it →" }).click();
  const app = page.getByLabel("Built app preview");
  await expect(app).toBeVisible({ timeout: 20_000 });
  await expect(app.getByRole("button", { name: "Get started" })).toBeVisible();
  await app
    .getByRole("navigation", { name: "Preview pages" })
    .getByRole("button", { name: "Projects" })
    .click();
  await expect(app.getByRole("cell", { name: "Spring campaign" })).toBeVisible();

  await card.getByRole("button", { name: "Attack my app" }).click();
  await expect(card.getByText(/Grade B/)).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Vulnerable")).toBeVisible();

  await card.getByRole("button", { name: "Fix & re-attack" }).click();
  await expect(card.getByText(/Grade A/)).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Vulnerable")).toHaveCount(0);
});
