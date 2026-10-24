import { it, expect, vi } from "vitest";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { supportedSpec } from "@buildwise/build-engine";
import { agentPathDecision, agentPrompt, runCodeAgent } from "./agent";
const dir = "/work/build-1";
const spec = supportedSpec({
  name: "Site",
  summary: "A site",
  pages: [{ name: "Home", purpose: "Welcome", mustHave: true }],
  entities: [],
  auth: { enabled: false, providers: [] },
  integrations: [],
});
it("lets the agent write UI files only", () => {
  expect(agentPathDecision(dir, "Write", { file_path: "app/product.tsx" })).toBeNull();
  expect(agentPathDecision(dir, "Edit", { file_path: `${dir}/app/style.css` })).toBeNull();
  expect(agentPathDecision(dir, "Write", { file_path: "components/habit-list.tsx" })).toBeNull();
  expect(agentPathDecision(dir, "Write", { file_path: "app/insights/page.tsx" })).toBeNull();
  for (const file_path of [
    "app/api/records/route.ts",
    "app/auth/confirm/route.ts",
    "lib/server.ts",
    "package.json",
    "next.config.mjs",
    "product.json",
    "supabase/migrations/001_product.sql",
    "app/.env.local",
    "../other/app/page.tsx",
    "/etc/passwd",
  ])
    expect(agentPathDecision(dir, "Write", { file_path })).not.toBeNull();
});
it("lets the agent run its typecheck tool", () => {
  expect(agentPathDecision(dir, "mcp__provn__typecheck", {})).toBeNull();
});
it("allows reads inside the product but never env files or outside paths", () => {
  expect(agentPathDecision(dir, "Read", { file_path: "app/api/records/route.ts" })).toBeNull();
  expect(agentPathDecision(dir, "Glob", { pattern: "**/*.tsx" })).toBeNull();
  expect(agentPathDecision(dir, "Read", { file_path: ".env.local" })).not.toBeNull();
  expect(
    agentPathDecision(dir, "Read", { file_path: "/Users/someone/.ssh/id_rsa" }),
  ).not.toBeNull();
  expect(agentPathDecision(dir, "Glob", { pattern: "/etc/*" })).not.toBeNull();
  expect(agentPathDecision(dir, "Grep", { pattern: "x", path: "../.." })).not.toBeNull();
});
it("masks requirement text in the prompt", () => {
  expect(agentPrompt(spec, { note: "mail me at a@b.co" })).not.toContain("a@b.co");
});
it("settles measured usage even when the agent run fails", async () => {
  let options: Options | undefined;
  const run = vi.fn(async function* (params: { options?: Options }) {
    options = params.options;
    yield {
      type: "result",
      subtype: "error_max_budget_usd",
      is_error: true,
      total_cost_usd: 1.234567,
      modelUsage: {
        "claude-opus-5-5": {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadInputTokens: 5,
          cacheCreationInputTokens: 1,
        },
      },
    };
  });
  const result = await runCodeAgent({
    spec,
    directory: dir,
    config: { apiKey: "test-only", model: "claude-opus-5-5", maxBudgetUsd: 1, maxTurns: 5 },
    signal: new AbortController().signal,
    run: run as never,
  });
  expect(result.value.ok).toBe(false);
  expect(result.actualMicros).toBe(1234567);
  expect(result.inputTokens).toBe(16);
  expect(result.outputTokens).toBe(20);
  expect(options?.tools).not.toContain("Bash");
  expect(options?.settingSources).toEqual([]);
  expect(options?.env?.OPENAI_API_KEY).toBeUndefined();
  expect(Object.keys(options?.env ?? {})).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
});
it("refuses to treat a missing result as free", async () => {
  const run = vi.fn(async function* () {});
  await expect(
    runCodeAgent({
      spec,
      directory: dir,
      config: { apiKey: "k", model: "m", maxBudgetUsd: 1, maxTurns: 1 },
      signal: new AbortController().signal,
      run: run as never,
    }),
  ).rejects.toThrow("reconcile");
});
