import { randomUUID } from "node:crypto";
import type { FullConfig } from "@playwright/test";

/**
 * The dev server compiles each route on its first request, which can take longer than a test's
 * timeout. Touch every route once so tests measure the app, not the compiler.
 */
export default async function warmUp(config: FullConfig) {
  if (process.env.E2E_BASE_URL || process.env.CI) return;
  const base = config.projects[0]!.use.baseURL!;
  const id = randomUUID();
  const paths = [
    "/",
    "/signin",
    "/new",
    "/apps",
    "/admin/approvals",
    `/ideas/${id}`,
    "/e/warm-up-slug",
    "/auth/confirm",
    "/api/agent/ideas",
    `/api/agent/ideas/${id}/answers?after=${id}`,
    `/api/ideas/${id}`,
  ];
  await Promise.all(paths.map((path) => fetch(base + path, { redirect: "manual" })));
  const posts = [
    "/api/ideas",
    `/api/ideas/${id}/answers`,
    `/api/agent/ideas/${id}/questions`,
    `/api/agent/ideas/${id}/spec`,
    `/api/approvals/${id}`,
  ];
  await Promise.all(posts.map((path) => fetch(base + path, { method: "POST", body: "{}" })));
  await fetch(`${base}/api/quotes/${id}`, { method: "PATCH", body: "{}" });
}
