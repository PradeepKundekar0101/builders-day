import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll } from "./helpers";

test("idea to estimate, build, preview and attack", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/demo");
  await page.getByRole("button", { name: "A tiffin order tracker" }).click();
  await page.getByRole("button", { name: "Estimate my app" }).click();

  await expect(page.getByRole("heading", { name: "Tiffin Order Tracker" })).toBeVisible();
  await expect(page.getByTestId("demo-cost")).toHaveText(/^\$\d+\.\d{2}$/);
  await expect(page.getByTestId("demo-time")).toHaveText(/hour/);

  await page.getByRole("button", { name: "Build it" }).click();
  await expect(page.getByText("Live at tiffin-order-tracker.provn.app")).toBeVisible({
    timeout: 30_000,
  });

  const preview = page.getByRole("region", { name: "App preview" });
  await expect(preview.getByRole("heading", { name: "Tiffin Order Tracker" })).toBeVisible();
  await preview
    .getByRole("navigation", { name: "Preview pages" })
    .getByRole("button", { name: "Checkout" })
    .click();
  await expect(preview.getByRole("button", { name: /Pay ₹880/ })).toBeVisible();

  await page.getByRole("button", { name: "Attack my app" }).click();
  const results = page.getByRole("list", { name: "Attack results" });
  await expect(results.getByText("Vulnerable")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Security grade B/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Apply fix and attack again" }).click();
  await expect(page.getByText(/Security grade A/)).toBeVisible({ timeout: 20_000 });
  await expect(results.getByText("Vulnerable")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("the mock APIs reject an empty idea", async ({ request }) => {
  const response = await request.post("/api/demo/estimate", { data: { idea: "short" } });
  expect(response.status()).toBe(400);
});
