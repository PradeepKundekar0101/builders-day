import { expect, test } from "@playwright/test";

const IDEA =
  "Build a private client portal for a small design agency. Clients should sign in, see project progress, approve designs, and share feedback. Team members manage their own projects.";
const ANSWERS = [
  "Clients see only their own projects and approve designs; team members manage the projects they own.",
  "A client signs in, opens their project, reviews the latest design and approves it or requests changes.",
  "Save projects, designs and feedback. Connect email sign-in, file uploads and email notifications.",
];

test("Prompt Studio: estimate, build, live preview and attack", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/prompt-studio-demo");
  await page.getByRole("button", { name: /Continue to my workspace/ }).click();
  await page.getByRole("textbox", { name: "Describe your product" }).fill(IDEA);
  await page.getByRole("button", { name: "Shape my idea", exact: true }).click();

  for (const answer of ANSWERS) {
    await expect(page.getByText("Agent is waiting for your answer")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("textbox", { name: "Message PROVN" }).fill(answer);
    await page.getByRole("button", { name: "Send message" }).click();
  }
  await expect(page.getByRole("heading", { name: /Review what we.re about to build/ })).toBeVisible(
    {
      timeout: 20_000,
    },
  );

  await page
    .getByRole("button", { name: /Brief & prompts/ })
    .first()
    .click();
  await page.getByRole("checkbox", { name: /I reviewed the requirements/ }).check();
  await page.getByRole("button", { name: "Mark reviewed" }).click();

  await page.getByRole("button", { name: "Review cost & run" }).click();
  const estimate = page.getByRole("region", { name: "Your app estimate" });
  await expect(estimate.getByTestId("studio-cost")).toHaveText(/^\$\d+\.\d{2}$/);
  await expect(estimate.getByTestId("studio-time")).toHaveText(/hour/);

  await page.getByRole("button", { name: /^Approve \d+ demo credits$/ }).click();
  await page.getByRole("button", { name: "Run approved simulation →" }).click();

  const app = page.getByLabel("Built app preview");
  await expect(app).toBeVisible({ timeout: 20_000 });
  await expect(app.getByRole("button", { name: "Get started" })).toBeVisible();
  await app
    .getByRole("navigation", { name: "Preview pages" })
    .getByRole("button", { name: "Sign in" })
    .click();
  await expect(app.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();

  await page.getByRole("button", { name: "⚠ Attack" }).click();
  await expect(page.getByText("GRADE B")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\[VULN\] Credential stuffing/)).toBeVisible();
  await page.getByRole("button", { name: "Apply fix and attack again" }).click();
  await expect(page.getByText("GRADE A")).toBeVisible({ timeout: 20_000 });
});
