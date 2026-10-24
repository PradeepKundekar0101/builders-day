import { test, expect } from "@playwright/test";
import { freshEmail, signInViaGeneratedLink } from "./helpers";
test("reviewed draft requires explicit credit approval and opens real build status", async ({
  page,
}) => {
  await signInViaGeneratedLink(page, freshEmail("build"));
  const session = "33333333-3333-4333-8333-333333333333";
  let run = "",
    approved = false,
    started = false;
  await page.route("**/api/prompt-studio/prepare", (route) =>
    route.fulfill({
      json: {
        specId: "spec",
        availableCredits: 300,
        sessionId: session,
        revision: 1,
        quote: {
          costCredits: 100,
          modelBudgetUsd: 1,
          selection: { specRevision: "spec:1", selectedIds: ["page:0"] },
        },
      },
    }),
  );
  await page.route("**/api/cost/wallet/runs", async (route) => {
    run = route.request().postDataJSON().runId;
    await route.fulfill({
      json: {
        quote: { costCredits: 100 },
        wallet: { runs: [{ id: run, phase: "awaiting_approval" }] },
      },
    });
  });
  await page.route("**/api/cost/wallet/runs/*", async (route) => {
    const action = route.request().postDataJSON().action;
    if (action === "approve") approved = true;
    if (action === "start") {
      expect(approved).toBe(true);
      started = true;
    }
    await route.fulfill({ json: { allowed: true } });
  });
  await page.route("**/api/prompt-studio/build-status/*", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        message: "Product source is ready.",
        steps: [{ message: "TypeScript and production compilation passed." }],
        build: { spent_usd: 0.02, budget_usd: 1 },
      },
    }),
  );
  await page.goto(`/apps/build?session=${session}&revision=1`);
  await page.getByRole("button", { name: "Get build estimate" }).click();
  await expect(page.getByRole("button", { name: "Approve and build product" })).toBeDisabled();
  expect(started).toBe(false);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve and build product" }).click();
  await expect(page).toHaveURL(/run=/);
  await expect(page.getByText("Product source is ready.", { exact: true })).toBeVisible();
  expect(started).toBe(true);
});
