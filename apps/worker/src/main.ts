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
import { AgentConfig, runCodeAgent } from "./agent";
import { prepareProduct, verifyProduct } from "./generate";
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
if (process.env.PROVN_LIVE_BUILDS !== "true")
  throw new Error("Worker disabled. Enable only after deployment and spending approval.");
const maxUsd = Number(required("PROVN_BUILD_MAX_USD"));
// The SDK checks its budget between turns, so leave headroom for the last turn inside the reservation.
const agent = AgentConfig.parse({
  apiKey: required("ANTHROPIC_API_KEY"),
  model: process.env.PROVN_BUILD_MODEL || undefined,
  maxBudgetUsd: maxUsd * 0.8,
});
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
async function checked(result: { error: unknown }) {
  if (result.error) throw new Error("Build storage operation failed");
}
while (!stopping) {
  const claimed = await db.rpc("claim_studio_build", { p_worker: worker });
  if (claimed.error) throw new Error("Worker claim failed. Verify migrations.");
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
      !["running", "building_fix"].includes(data.status)
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
        await step("Claude is writing the product code within the approved budget.");
        const call = await runBoundedCall({
          guard,
          buildId: build.id,
          callId: `${build.id}:code`,
          taskId: "code",
          maxMicros: Math.ceil(maxUsd * 1e6),
          execute: () =>
            runCodeAgent({
              spec,
              requirements: version.payload,
              directory,
              config: agent,
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20 * 60_000)]),
              onStep: step,
            }),
        });
        if (!call.executed || !call.settlement.allowed) throw new Error("Budget requires review");
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
    await checked(
      await db
        .from("build_outputs")
        .update({
          status: "ready",
          artifact_path: attempt.value.path,
          checks: attempt.value.report,
          message: "Product source is ready. Connect its database and review before deployment.",
          updated_at: new Date().toISOString(),
        })
        .eq("build_id", build.id),
    );
    await checked(
      await db
        .from("builds")
        .update({ status: "auditing", finished_at: new Date().toISOString(), claimed_by: null })
        .eq("id", build.id)
        .eq("claimed_by", worker),
    );
  } catch {
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
