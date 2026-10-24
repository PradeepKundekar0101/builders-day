import { test, expect, type Page } from "@playwright/test";
import { MockPromptStudioAdapter, type PromptStudioDraft } from "@buildwise/shared";
import { freshEmail, remote, signInViaGeneratedLink } from "./helpers";

test.skip(({ isMobile }) => isMobile, "Desktop workspace");
test.skip(remote, "Creates isolated fixtures only against local CI Supabase");

const LIVE = "https://bw-e2etest0001.vercel.app";

async function savedDraft(
  page: Page,
  baseURL: string,
  status: "draft" | "user_reviewed",
  answered = true,
  integrations: { kind: "admin_dashboard"; mustHave: boolean; notes?: string }[] = [],
  extra: Partial<PromptStudioDraft> = {},
) {
  const raw = await new MockPromptStudioAdapter().interpret({
    idea: "Build a booking portal for fitness coaches where clients can browse and reserve sessions.",
    links: [],
  });
  // A reviewed version must have every open question answered.
  const draft = {
    ...raw,
    spec: { ...raw.spec, integrations },
    questions: raw.questions.map((q, i) => ({
      ...q,
      answer: answered || i > 0 ? (q.answer ?? "Yes") : undefined,
    })),
    ...extra,
  };
  const id = crypto.randomUUID();
  const response = await page.request.post("/api/prompt-studio/sessions", {
    headers: { origin: new URL(baseURL).origin },
    data: { id, mutationId: crypto.randomUUID(), expectedRevision: 0, draft, status },
  });
  expect(response.status()).toBe(200);
  return id;
}
function builds(page: Page, list: unknown[]) {
  return page.route("**/api/prompt-studio/build-status", (route) =>
    route.fulfill({ json: { builds: list } }),
  );
}

test("an unreviewed draft asks for review instead of simulating a build", async ({
  page,
  baseURL,
}) => {
  await signInViaGeneratedLink(page, freshEmail("live-unreviewed"));
  const id = await savedDraft(page, baseURL!, "draft");
  await builds(page, []);
  await page.goto(`/apps/new?session=${id}`);
  await page.getByRole("button", { name: "Build for real ↗" }).first().click();
  await expect(page.getByText(/save this draft and mark it reviewed/)).toBeVisible();
  await expect(page).toHaveURL(/\/apps\/new/);
  await expect(page.getByText("SIMULATED BUILD")).toHaveCount(0);
});

test("a reviewed draft opens the real build page", async ({ page, baseURL }) => {
  await signInViaGeneratedLink(page, freshEmail("live-reviewed"));
  const id = await savedDraft(page, baseURL!, "user_reviewed");
  await builds(page, []);
  await page.goto(`/apps/new?session=${id}`);
  await page.getByRole("button", { name: "↗ Live" }).click();
  await expect(page.getByText("Hosting provider")).toBeVisible();
  await expect(page.getByText("Vercel", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Build for real ↗" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/apps/build\\?session=${id}&revision=1$`));
});

test("a released build shows the live app in the workspace", async ({ page, baseURL }) => {
  await signInViaGeneratedLink(page, freshEmail("live-released"));
  const id = await savedDraft(page, baseURL!, "user_reviewed");
  await page.route(`${LIVE}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Deployed coach portal</h1>" }),
  );
  await builds(page, [
    { id: crypto.randomUUID(), status: "live", revision: 1, sessionId: id, liveUrl: LIVE },
  ]);
  await page.goto(`/apps/new?session=${id}`);
  const app = page.frameLocator('iframe[title="Live application"]');
  await expect(app.getByRole("heading", { name: "Deployed coach portal" })).toBeVisible();
  await expect(page.getByText("LIVE ON VERCEL", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "↗ Open live" })).toHaveAttribute("href", LIVE);
  await expect(page.getByText("Published at bw-e2etest0001.vercel.app")).toBeVisible();
  await expect(page.getByText("SIMULATED OUTPUT")).toHaveCount(0);
  await expect(page.getByText(/provn\.app/)).toHaveCount(0);
});

test("the brief explains and clears what blocks marking it reviewed", async ({ page, baseURL }) => {
  await signInViaGeneratedLink(page, freshEmail("live-blocked"));
  const id = await savedDraft(page, baseURL!, "draft", false);
  await builds(page, []);
  await page.goto(`/apps/new?session=${id}`);
  await page
    .getByRole("button", { name: /Brief & prompts/ })
    .first()
    .click();
  const review = page.getByRole("checkbox", { name: /I reviewed the requirements/ });
  await expect(review).toBeDisabled();
  await expect(
    page.getByText("Answer the open questions before marking the brief reviewed:"),
  ).toBeVisible();
  const open = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Save answer" }) });
  await open.getByRole("textbox").fill("Clients see their own bookings.");
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(review).toBeEnabled();
  await review.check();
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText(/marked user reviewed/)).toBeVisible();
});

test("an unbuildable brief is flagged before review and can be fixed in one click", async ({
  page,
  baseURL,
}) => {
  await signInViaGeneratedLink(page, freshEmail("live-scope"));
  const id = await savedDraft(page, baseURL!, "draft", true, [
    { kind: "admin_dashboard", mustHave: true, notes: "Owner-only bookings page" },
  ]);
  await builds(page, []);
  await page.goto(`/apps/new?session=${id}`);
  await page
    .getByRole("button", { name: /Brief & prompts/ })
    .first()
    .click();
  await expect(page.getByText("This brief can't be built automatically yet:")).toBeVisible();
  await expect(page.getByText(/admin or owner dashboard/)).toBeVisible();
  await page.getByRole("button", { name: "Remove unsupported integrations" }).click();
  await expect(page.getByText("This brief can't be built automatically yet:")).toHaveCount(0);
});

test("a question offers clickable answers", async ({ page, baseURL }) => {
  await signInViaGeneratedLink(page, freshEmail("live-options"));
  const id = await savedDraft(page, baseURL!, "draft", false, [], {
    questions: [
      {
        id: "get-started",
        question: "When a visitor clicks Get started, what should happen?",
        options: ["Open the sign-up page", "Show a waitlist form"],
        stage: 0,
      },
    ],
  });
  await builds(page, []);
  await page.goto(`/apps/new?session=${id}`);
  const options = page.getByRole("group", { name: "Suggested answers" });
  await options.getByRole("button", { name: "Show a waitlist form" }).click();
  await expect(page.getByText("Show a waitlist form", { exact: true })).toBeVisible();
  await expect(options).toHaveCount(0);
});

test("the brief keeps scrolling while Claude is refining it", async ({ page, baseURL }) => {
  await signInViaGeneratedLink(page, freshEmail("live-scroll"));
  const id = await savedDraft(page, baseURL!, "draft", true, [], { adapterMode: "claude" });
  await builds(page, []);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/prompt-studio/interpret", async (route) => {
    await held;
    await route.fulfill({ status: 503, json: { error: "Held for the test" } });
  });
  await page.goto(`/apps/new?session=${id}`);
  await page.getByRole("textbox", { name: "Message PROVN" }).fill("Add a FAQ page.");
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Brief & prompts/ })
    .first()
    .click();
  const brief = page.locator(".build-brief-scroll");
  await expect(brief).toBeVisible();
  await brief.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => brief.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  release();
});
