import { test, expect } from "@playwright/test";
import { MockPromptStudioAdapter } from "@buildwise/shared";
import { freshEmail, remote, signInViaGeneratedLink } from "./helpers";

test("saved studio versions resume, restore safely, and remain owner-scoped", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(remote, "Creates isolated fixtures only against local CI Supabase");
  await signInViaGeneratedLink(page, freshEmail("studio"));
  const draft = await new MockPromptStudioAdapter().interpret({
    idea: "Build a booking portal for fitness coaches where clients can browse and reserve available sessions.",
    links: [],
  });
  const id = crypto.randomUUID();
  const body = { id, mutationId: crypto.randomUUID(), expectedRevision: 0, draft, status: "draft" };
  const headers = { origin: new URL(baseURL!).origin };
  const create = await page.request.post("/api/prompt-studio/sessions", { headers, data: body });
  expect(create.status()).toBe(200);
  const retry = await page.request.post("/api/prompt-studio/sessions", { headers, data: body });
  expect((await retry.json()).revision).toBe(1);
  const update = await page.request.put(`/api/prompt-studio/sessions/${id}`, {
    headers,
    data: {
      ...body,
      mutationId: crypto.randomUUID(),
      expectedRevision: 1,
      draft: { ...draft, spec: { ...draft.spec, name: "Coach Portal" } },
    },
  });
  expect((await update.json()).revision).toBe(2);
  const conflict = await page.request.put(`/api/prompt-studio/sessions/${id}`, {
    headers,
    data: { ...body, mutationId: crypto.randomUUID(), expectedRevision: 1 },
  });
  expect(conflict.status()).toBe(409);
  await page.goto("/apps");
  await page.getByRole("link", { name: `Resume draft ${id.slice(0, 8)} · version 2` }).click();
  await expect(page.getByRole("button", { name: "Resume progression" })).toBeVisible();
  await page.getByRole("button", { name: "≡ Brief & prompts", exact: true }).click();
  await page.getByText("Saved versions & prompt history (2)", { exact: true }).click();
  await page.getByText(/Version 1 · draft ·/).click();
  await page.getByRole("button", { name: "Restore version 1 as draft" }).click();
  await page.getByRole("button", { name: "≡ Brief & prompts", exact: true }).click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("My product");
  const stored = await page.request.get(`/api/prompt-studio/sessions/${id}`);
  expect((await stored.json()).revision).toBe(2);
  const other = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await signInViaGeneratedLink(otherPage, freshEmail("other-owner"));
    expect((await otherPage.request.get(`/api/prompt-studio/sessions/${id}`)).status()).toBe(404);
    const listing = await otherPage.request.get("/api/prompt-studio/sessions");
    expect((await listing.json()).sessions.some((s: { id: string }) => s.id === id)).toBe(false);
  } finally {
    await other.close();
  }
});
