import { expect, test } from "@playwright/test";

// Desktop only for now; the phone layout of the workspace is not finished.
test.skip(({ isMobile }) => isMobile, "Desktop workspace");

const IDEA =
  "A booking portal for independent fitness coaches. Clients sign in, book classes and pay online.";

test("Model routing: risky work goes to frontier, light work stays cheap, private stays local", async ({
  page,
}) => {
  await page.goto("/prompt-studio-demo");
  await page.getByRole("button", { name: /Continue to my workspace/ }).click();
  await page.getByRole("textbox", { name: "Describe your product" }).fill(IDEA);
  await page.getByRole("button", { name: "Shape my idea", exact: true }).click();
  await page.getByRole("button", { name: "Model routing" }).click();

  const card = (task: string) =>
    page
      .locator(".p0-route-list article")
      .filter({ has: page.getByRole("heading", { name: task }) });
  await expect(card("Security review")).toContainText("Lib 1 · frontier");
  await expect(card("Security review")).toContainText("Impact 4/5 High");
  await expect(card("Payments")).toContainText("Lib 1 · frontier");
  await expect(card("Payments")).toContainText("Pine Labs sandbox");
  await expect(card("Sample data")).toContainText("Lib 3 · local");
  await expect(page.getByTestId("route-savings")).toContainText(/about \d+% less/);

  await page.getByRole("checkbox", { name: /Private mode/ }).check();
  await expect(page.locator(".p0-route-list .p0-badge").first()).toHaveText("Lib 3 · local");
  for (const badge of await page.locator(".p0-route-list .p0-badge").all())
    await expect(badge).toHaveText("Lib 3 · local");
});
