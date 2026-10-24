import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { CLEAN_SPEC, FakeAgent, PAYMENT_SPEC } from "./agent";
import {
  expectNoHorizontalScroll,
  freshEmail,
  generatedConfirmPath,
  remote,
  setRole,
} from "./helpers";

test.skip(
  remote && !process.env.AGENT_API_TOKEN,
  "Intake tests against a deployment need its AGENT_API_TOKEN and service role.",
);

const IDEA =
  "A tiffin order tracker for my home kitchen. Customers pick meals for the week and I see each day's orders.";

const conversation = (page: Page) => page.getByRole("list", { name: "Questions from PROVN" });

async function signIn(page: Page, label: string, next = "/new") {
  const email = freshEmail(label);
  await page.goto(await generatedConfirmPath(email, next));
  return email;
}

async function submitIdea(page: Page, text = IDEA): Promise<string> {
  await signIn(page, "founder");
  await expect(page.getByRole("heading", { name: "Describe your idea" })).toBeVisible();
  await page.getByLabel("Your idea").fill(text);
  await page.getByRole("button", { name: "Get my estimate" }).click();
  await page.waitForURL(/\/ideas\/[0-9a-f-]{36}$/);
  // Next keeps the previous route mounted but hidden, so wait on the new page's content.
  await expect(page.getByRole("paragraph").filter({ hasText: /^Your idea$/ })).toBeVisible();
  return page.url().split("/").at(-1)!;
}

test("idea to a priced estimate with questions and live toggles", async ({ page }) => {
  const ideaId = await submitIdea(page);
  await expect(page.getByRole("status").filter({ hasText: "Reading your idea" })).toBeVisible();

  const agent = new FakeAgent(page.request);
  const questionId = await agent.askOk(ideaId, "Who places the orders?");
  await expect(conversation(page).getByText("Who places the orders?")).toBeVisible();
  await page.getByLabel("Your answer").fill("Office workers near my kitchen");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(conversation(page).getByText("Office workers near my kitchen")).toBeVisible();
  await expect(page.getByText("Working out the details")).toBeVisible();
  expect(await agent.answers(ideaId, questionId)).toEqual([
    expect.objectContaining({ content: "Office workers near my kitchen" }),
  ]);

  expect((await agent.submitSpec(ideaId, CLEAN_SPEC)).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Tiffin tracker" })).toBeVisible();
  await expect(page.getByTestId("price")).toHaveText("$2.38");
  await expect(page.getByText("Estimated price (approximate)")).toBeVisible();

  await page.getByRole("checkbox", { name: /Email notifications/ }).check();
  await expect(page.getByTestId("price")).toHaveText("$2.74");
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("price")).toHaveText("$2.74");
  await expect(page.getByRole("checkbox", { name: /Email notifications/ })).toBeChecked();
  await expectNoHorizontalScroll(page);
});

test("core features stay on while extras switch on and off", async ({ page }) => {
  const ideaId = await submitIdea(page);
  await new FakeAgent(page.request).submitSpec(ideaId, CLEAN_SPEC);
  for (const name of [/^Home/, /^Order/, /Sign-in/]) {
    await expect(page.getByRole("checkbox", { name })).toBeChecked();
    await expect(page.getByRole("checkbox", { name })).toBeDisabled();
  }
  const email = page.getByRole("checkbox", { name: /Email notifications/ });
  await email.check();
  await expect(page.getByTestId("price")).toHaveText("$2.74");
  await email.uncheck();
  await expect(page.getByTestId("price")).toHaveText("$2.38");
});

test("the server refuses to drop a core feature", async ({ page }) => {
  const ideaId = await submitIdea(page);
  await new FakeAgent(page.request).submitSpec(ideaId, CLEAN_SPEC);
  const shareUrl = await page.getByLabel("Share link").inputValue();
  expect(shareUrl).toContain("/e/");
  const view = await (await page.request.get(`/api/ideas/${ideaId}`)).json();
  const response = await page.request.patch(`/api/quotes/${view.estimate.quote.id}`, {
    headers: { origin: new URL(page.url()).origin },
    data: { selection: { pages: [], entities: [], auth: false, integrations: [] } },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({ error: "invalid_selection" });
});

test("the share link shows only the headline, signed out", async ({ page, browser }) => {
  const ideaId = await submitIdea(page);
  await new FakeAgent(page.request).submitSpec(ideaId, CLEAN_SPEC);
  const shareUrl = await page.getByLabel("Share link").inputValue();

  const stranger = await browser.newPage();
  await stranger.goto(new URL(shareUrl).pathname);
  await expect(stranger.getByRole("heading", { name: "Tiffin tracker" })).toBeVisible();
  await expect(stranger.getByText("$2.38")).toBeVisible();
  await expect(stranger.getByText(IDEA)).toHaveCount(0);
  await expect(stranger.getByRole("checkbox")).toHaveCount(0);
  await expect(stranger.getByText("Model tokens")).toHaveCount(0);
  await stranger.close();
});

test("an unknown share link shows not found", async ({ page }) => {
  await page.goto("/e/not-a-real-slug");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("a payment spec waits for an operator before showing a price", async ({ page, browser }) => {
  const ideaId = await submitIdea(page);
  const name = `Paid tiffin ${randomUUID().slice(0, 8)}`;
  await new FakeAgent(page.request).submitSpec(ideaId, { ...PAYMENT_SPEC, name });
  await expect(page.getByText("An operator is checking this estimate.")).toBeVisible();
  await expect(page.getByTestId("price")).toHaveCount(0);

  const operator = await browser.newPage();
  const operatorEmail = await signIn(operator, "operator", "/apps");
  await setRole(operatorEmail, "operator");
  await operator.goto("/admin/approvals");
  const row = operator.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("Takes payments");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0);
  await operator.close();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByTestId("price")).toHaveText("$3.34");
});

test("people who are not operators cannot see approvals", async ({ page }) => {
  await signIn(page, "nosy", "/apps");
  await page.goto("/admin/approvals");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approvals" })).toHaveCount(0);
});

test("the agent gets at most four questions", async ({ page }) => {
  const ideaId = await submitIdea(page);
  const agent = new FakeAgent(page.request);
  for (let i = 1; i <= 4; i++) {
    await agent.askOk(ideaId, `Question number ${i}?`);
    await page.getByLabel("Your answer").fill(`Answer ${i}`);
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(conversation(page).getByText(`Answer ${i}`, { exact: true })).toBeVisible();
  }
  expect((await agent.ask(ideaId, "A fifth question?")).status()).toBe(409);
  await page.reload();
  await expect(conversation(page).getByText(/^Question number/)).toHaveCount(4);
});

test("the agent API refuses a wrong token", async ({ request }) => {
  const agent = new FakeAgent(request, "x".repeat(64));
  const response = await request.get("/api/agent/ideas", {
    headers: { authorization: `Bearer ${"x".repeat(64)}` },
  });
  expect(response.status()).toBe(401);
  expect((await agent.ask(randomUUID(), "Anyone there?")).status()).toBe(401);
});

test("personal data is hidden from the agent but shown to the founder", async ({ page }) => {
  const ideaId = await submitIdea(page, `${IDEA} Send orders to asha.rao@example.com please.`);
  await expect(
    page.getByRole("paragraph").filter({ hasText: "asha.rao@example.com" }),
  ).toBeVisible();
  const idea = (await new FakeAgent(page.request).submittedIdeas()).find((i) => i.id === ideaId);
  expect(idea?.text).toContain("{{PII_EMAIL_1}}");
  expect(idea?.text).not.toContain("asha.rao");
});

test("another person cannot read or answer my idea", async ({ page, browser }) => {
  const ideaId = await submitIdea(page);
  await new FakeAgent(page.request).askOk(ideaId, "Who places the orders?");

  const other = await browser.newPage();
  await signIn(other, "other", "/apps");
  await other.goto(`/ideas/${ideaId}`);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(other.getByText("Who places the orders?")).toHaveCount(0);
  await expect(other.getByText(IDEA)).toHaveCount(0);
  const api = await other.request.get(`/api/ideas/${ideaId}`);
  expect(api.status()).toBe(404);
  const answer = await other.request.post(`/api/ideas/${ideaId}/answers`, {
    headers: { origin: new URL(other.url()).origin },
    data: { answer: "Hijack" },
  });
  expect(answer.status()).toBe(404);
  await other.close();
});

test("a cross-site post to the ideas API is refused", async ({ page }) => {
  await signIn(page, "csrf", "/apps");
  const response = await page.request.post("/api/ideas", {
    headers: { origin: "https://evil.example" },
    data: { text: IDEA },
  });
  expect(response.status()).toBe(403);
});

test("short ideas cannot be submitted", async ({ page }) => {
  await signIn(page, "short");
  await page.getByLabel("Your idea").fill("Too short");
  await expect(page.getByRole("button", { name: "Get my estimate" })).toBeDisabled();
  await expect(page.getByText("41 more characters needed")).toBeVisible();
});

test("My apps lists the founder's estimates", async ({ page }) => {
  const ideaId = await submitIdea(page);
  await new FakeAgent(page.request).submitSpec(ideaId, CLEAN_SPEC);
  await page.goto("/apps");
  const row = page.getByRole("link", { name: /Tiffin tracker/ });
  await expect(row).toContainText("$2.38 approx.");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/ideas/${ideaId}$`));
});
