import { it, expect, vi } from "vitest";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { supportedSpec } from "@buildwise/build-engine";
import { agentBudget, agentPathDecision, agentPrompt, runCodeAgent } from "./agent";
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

it("reserves no more than the approved build budget", () => {
  // A $3 operator cap must not exceed a $1.86 approved budget, or the cost guard refuses the call.
  expect(agentBudget(1.86, 3).reserveMicros).toBe(1_860_000);
  expect(agentBudget(1.86, 3).agentUsd).toBeCloseTo(1.488, 6);
  expect(agentBudget(5, 3).reserveMicros).toBe(3_000_000);
  expect(agentBudget(5, 3).agentUsd).toBeCloseTo(2.4, 6);
  expect(() => agentBudget(Number("not a number"), 3)).toThrow("no approved provider budget");
  expect(() => agentBudget(0, 3)).toThrow("no approved provider budget");
});

it("settles the cost the SDK reports before it throws on the budget cap", async () => {
  const run = vi.fn(async function* () {
    yield {
      type: "result",
      subtype: "error_max_budget_usd",
      is_error: true,
      total_cost_usd: 0.0177,
      modelUsage: {
        "claude-opus-5-5": {
          inputTokens: 5,
          outputTokens: 40,
          cacheReadInputTokens: 900,
          cacheCreationInputTokens: 100,
        },
      },
    };
    throw new Error("Claude Code returned an error result: Reached maximum budget ($0.005)");
  });
  const result = await runCodeAgent({
    spec,
    directory: dir,
    config: { apiKey: "test-only", model: "claude-opus-5-5", maxBudgetUsd: 0.005, maxTurns: 5 },
    signal: new AbortController().signal,
    run: run as never,
  });
  expect(result.value).toMatchObject({ ok: false, subtype: "error_max_budget_usd" });
  expect(result.actualMicros).toBe(17_700);
  expect(result.inputTokens).toBe(1005);
});
it("still refuses to treat a failure without any result as free", async () => {
  const run = vi.fn(async function* () {
    // A connection failure before the SDK yields anything, so there is no cost to settle.
    yield* [];
    throw new Error("network down");
  });
  await expect(
    runCodeAgent({
      spec,
      directory: dir,
      config: { apiKey: "k", model: "m", maxBudgetUsd: 1, maxTurns: 1 },
      signal: new AbortController().signal,
      run: run as never,
    }),
  ).rejects.toThrow("network down");
});
