import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreditWallet,
  PostgresWalletStore,
  CostGuard,
  PostgresStore,
  runBoundedCall,
  runCreditAttempt,
} from "@buildwise/cost-guard";
import { supportedSpec } from "@buildwise/build-engine";
import { AgentConfig, agentBudget, runCodeAgent } from "./agent";
import { prepareProduct, verifyProduct } from "./generate";
import { VercelConfig, deployToVercel, projectName } from "./vercel";
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
if (process.env.PROVN_LIVE_BUILDS !== "true")
  throw new Error("Worker disabled. Enable only after deployment and spending approval.");
const maxUsd = Number(required("PROVN_BUILD_MAX_USD"));
// Per-build reservations come from agentBudget(); this cap only bounds them.
const agent = AgentConfig.parse({
  apiKey: required("ANTHROPIC_API_KEY"),
  model: process.env.PROVN_BUILD_MODEL || undefined,
  maxBudgetUsd: maxUsd * 0.8,
});
// Deployment is optional: without a token the worker delivers the source ZIP only.
const vercel = process.env.VERCEL_TOKEN
  ? VercelConfig.parse({
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID || undefined,
      embedOrigin: process.env.PROVN_SITE_URL
        ? new URL(process.env.PROVN_SITE_URL).origin
        : undefined,
    })
  : null;
const db = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const wallet = new CreditWallet(new PostgresWalletStore(db)),
  guard = new CostGuard(new PostgresStore(db));
const worker = randomUUID(),
  root = resolve(required("PROVN_BUILD_WORKDIR")),
  template = fileURLToPath(new URL("../../../templates/generated-app/", import.meta.url));
await mkdir(root, { recursive: true });
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
const MAX_CLAIM_FAILURES = 8;
async function checked(result: { error: unknown }) {
  if (result.error) throw new Error("Build storage operation failed");
}
let claimFailures = 0;
while (!stopping) {
  const claimed = await db.rpc("claim_studio_build", { p_worker: worker });
  if (claimed.error) {
    // Network loss (Wi-Fi drop, laptop sleep) is waited out indefinitely; only repeated database
    // errors, such as a missing migration, stop the worker.
    const offline = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(claimed.error.message);
    if (!offline) claimFailures++;
    console.error(
      `[worker] claim failed${offline ? " (offline, retrying)" : ` (${claimFailures}/${MAX_CLAIM_FAILURES})`}: ${claimed.error.message}`,
    );
    if (claimFailures >= MAX_CLAIM_FAILURES)
      throw new Error("Worker claim keeps failing. Verify migrations and database access.");
    await delay(offline ? 30_000 : Math.min(60_000, 2_000 * 2 ** claimFailures));
    continue;
  }
  claimFailures = 0;
  const build = claimed.data;
  if (!build) {
    await delay(5000);
    continue;
  }
  const abort = new AbortController();
  let leaseLost = false;
  async function owns() {
    const { data, error } = await db
      .from("builds")
      .select("claimed_by,status")
      .eq("id", build.id)
      .single();
    if (
      error ||
      data?.claimed_by !== worker ||
      !["running", "building_fix", "deploying"].includes(data.status)
    ) {
      leaseLost = true;
      abort.abort();
      throw new Error("Build lease or budget unavailable");
    }
  }
  const heartbeat = setInterval(() => {
    void (async () => {
      try {
        await owns();
        await checked(
          await db
            .from("builds")
            .update({ heartbeat_at: new Date().toISOString() })
            .eq("id", build.id)
            .eq("claimed_by", worker),
        );
        await checked(
          await db
            .from("build_worker_health")
            .upsert({ id: worker, seen_at: new Date().toISOString() }),
        );
      } catch {
        leaseLost = true;
        abort.abort();
      }
    })();
  }, 15000);
  const step = async (message: string) => {
    await owns();
    await checked(
      await db
        .from("build_events")
        .insert({ build_id: build.id, type: "progress", payload: { message } }),
    );
  };
  try {
    await step("Worker claimed the approved build.");
    const { data: quote, error: qe } = await db
      .from("quotes")
      .select("spec_id,cost_usd,selected_features")
      .eq("id", build.quote_id)
      .eq("user_id", build.user_id)
      .single();
    if (qe || !quote) throw new Error("Missing quote");
    const { data: stored, error: se } = await db
      .from("specs")
      .select("spec,operator_status")
      .eq("id", quote.spec_id)
      .eq("user_id", build.user_id)
      .single();
    if (se || !stored || !["approved", "not_needed"].includes(stored.operator_status))
      throw new Error("Unapproved specification");
    const { data: mapping, error: me } = await db
      .from("studio_build_specs")
      .select("session_id,revision")
      .eq("spec_id", quote.spec_id)
      .single();
    if (me || !mapping) throw new Error("Missing reviewed version");
    const { data: version, error: ve } = await db
      .from("prompt_studio_versions")
      .select("payload,status")
      .eq("session_id", mapping.session_id)
      .eq("revision", mapping.revision)
      .single();
    if (ve || version?.status !== "user_reviewed") throw new Error("Reviewed version unavailable");
    const full = supportedSpec(stored.spec),
      selected = new Set<string>(quote.selected_features.selectedIds);
    const spec = supportedSpec({
      ...full,
      pages: full.pages.filter((_p, i) => selected.has(`page:${i}`)),
      entities: full.entities.filter((e) => selected.has(`entity:${e.name}`)),
    });
    const attempt = await runCreditAttempt({
      wallet,
      accountId: build.user_id,
      runId: build.id,
      attemptId: `${build.id}:initial`,
      execute: async () => {
        const directory = resolve(root, build.id);
        const { migration } = await prepareProduct({
          spec,
          requirements: version.payload,
          directory,
          template,
          onStep: step,
        });
        const budget = agentBudget(Number(build.budget_usd), maxUsd);
        await step("Claude is writing the product code within the approved budget.");
        const call = await runBoundedCall({
          guard,
          buildId: build.id,
          callId: `${build.id}:code`,
          taskId: "code",
          maxMicros: budget.reserveMicros,
          execute: () =>
            runCodeAgent({
              spec,
              requirements: version.payload,
              directory,
              config: { ...agent, maxBudgetUsd: budget.agentUsd },
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20 * 60_000)]),
              onStep: step,
            }),
        });
        if (!call.executed) throw new Error(`Budget requires review: ${call.reason}`);
        if (!call.settlement.allowed)
          throw new Error(`Budget requires review: ${call.settlement.reason}`);
        if (!call.value.ok) throw new Error(`Code agent stopped: ${call.value.subtype}`);
        await owns();
        const result = await verifyProduct({
          directory,
          migration,
          agent: { model: agent.model, summary: call.value.summary.slice(0, 4000) },
          onStep: step,
        });
        await owns();
        const path = `${build.user_id}/${build.id}/product.zip`;
        await checked(
          await db.storage
            .from("build-artifacts")
            .upload(path, result.archive, { contentType: "application/zip", upsert: false }),
        );
        return { success: true, value: { path, report: result.report } };
      },
    });
    if (!attempt.executed) throw new Error("Attempt denied");
    await owns();
    const settled = await wallet.execute(build.user_id, {
      type: "finish",
      id: `finish:${build.id}`,
      runId: build.id,
      outcome: "success",
      chargeUnits: Math.round(Number(quote.cost_usd) * 1e6),
    });
    if (!settled.allowed) throw new Error("Settlement denied");
    const finished = () => new Date().toISOString();
    if (vercel)
      await checked(
        await db
          .from("builds")
          .update({ status: "deploying" })
          .eq("id", build.id)
          .eq("claimed_by", worker),
      );
    await checked(
      await db
        .from("build_outputs")
        .update({
          status: "ready",
          artifact_path: attempt.value.path,
          checks: attempt.value.report,
          message: vercel
            ? "Product source is ready. Deploying it to Vercel."
            : "Product source is ready. Connect its database and review before deployment.",
          updated_at: finished(),
        })
        .eq("build_id", build.id),
    );
    let released = false;
    if (vercel) {
      // The build is paid for and its source delivered; a failed deploy must not reopen billing.
      const name = projectName(build.id);
      let message: string;
      try {
        await step("Deploying the app to Vercel.");
        const live = await deployToVercel({
          directory: resolve(root, build.id),
          name,
          config: vercel,
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15 * 60_000)]),
          onStep: step,
        });
        await checked(
          await db.from("deployments").insert({
            build_id: build.id,
            vercel_project_id: live.projectId,
            url: live.url,
            status: "ready",
          }),
        );
        await step(`Live at ${live.url}`);
        message = "Your app is live. Data and sign-in need a connected Supabase project.";
        released = true;
      } catch (error) {
        if (leaseLost) throw error;
        await db.from("deployments").insert({ build_id: build.id, status: "failed" });
        message = `Product source is ready, but deployment failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`;
      }
      await checked(
        await db
          .from("build_outputs")
          .update({ message, updated_at: finished() })
          .eq("build_id", build.id),
      );
    }
    // No security audit exists yet, so a ready deployment is released to its owner immediately.
    await checked(
      await db
        .from("builds")
        .update({
          status: released ? "released" : "auditing",
          finished_at: finished(),
          claimed_by: null,
        })
        .eq("id", build.id)
        .eq("claimed_by", worker),
    );
  } catch (error) {
    // Operators need the cause; messages carry no secrets or user content.
    console.error(
      `[worker] build ${build.id} stopped: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Never automatically retry a possibly billed request or silently refund unknown usage.
    if (!leaseLost) {
      await db
        .from("build_outputs")
        .update({
          status: "needs_review",
          message:
            "Build stopped. Operator must reconcile provider usage and inspect validation before retry or refund.",
        })
        .eq("build_id", build.id);
      await db
        .from("builds")
        .update({ status: "paused_budget", claimed_by: null })
        .eq("id", build.id)
        .eq("claimed_by", worker);
    }
  } finally {
    clearInterval(heartbeat);
    abort.abort();
  }
}
