import { test, expect, type Page } from "@playwright/test";
import { MockPromptStudioAdapter } from "@buildwise/shared";
import { freshEmail, remote, signInViaGeneratedLink } from "./helpers";

test.skip(({ isMobile }) => isMobile, "Desktop workspace");
test.skip(remote, "Creates isolated fixtures only against local CI Supabase");

const LIVE = "https://bw-e2etest0001.vercel.app";

async function savedDraft(page: Page, baseURL: string, status: "draft" | "user_reviewed") {
  const raw = await new MockPromptStudioAdapter().interpret({
    idea: "Build a booking portal for fitness coaches where clients can browse and reserve sessions.",
    links: [],
  });
  // A reviewed version must have every open question answered.
  const draft = {
    ...raw,
    questions: raw.questions.map((q) => ({ ...q, answer: q.answer ?? "Yes" })),
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
