import { expect, test } from "@playwright/test";

test("dismissed onboarding does not block short ideas or repeat on new builds", async ({
  page,
}) => {
  await page.goto("/prompt-studio-demo");
  await page.getByRole("button", { name: "Close onboarding" }).click();
  await page.getByLabel("Describe your product", { exact: true }).fill("Todo app");
  await page.getByRole("button", { name: "Shape my idea", exact: true }).click();
  await expect(page.getByLabel("Agent conversation", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "New build", exact: true }).click();
  await expect(page.getByRole("button", { name: "Close onboarding" })).toHaveCount(0);
  await page.getByLabel("Describe your product", { exact: true }).fill("Recipe planner");
  await page.getByRole("button", { name: "Shape my idea", exact: true }).click();
  await expect(page.getByLabel("Agent conversation", { exact: true })).toBeVisible();
});

test("empty ideas stay disabled", async ({ page }) => {
  await page.goto("/prompt-studio-demo");
  await page.getByRole("button", { name: "Continue to my workspace →" }).click();
  await page.getByLabel("Describe your product", { exact: true }).fill("   ");
  await expect(page.getByRole("button", { name: "Shape my idea", exact: true })).toBeDisabled();
});
