"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
type Prepared = {
  availableCredits: number;
  specId: string;
  quote: {
    costCredits: number;
    modelBudgetUsd: number;
    selection: unknown;
    weightsVersion: string;
    featureCosts: { id: string; label: string }[];
  };
  sessionId: string;
  revision: number;
};
type Status = {
  status: string;
  message: string;
  steps: { message: string }[];
  downloadUrl?: string;
  build: { spent_usd: number; budget_usd: number };
};
async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
export default function BuildRun() {
  const router = useRouter();
  const params = useSearchParams(),
    session = params.get("session"),
    revision = Number(params.get("revision")),
    run = params.get("run");
  const [prepared, setPrepared] = useState<Prepared | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [approved, setApproved] = useState(false);
  const runId = useRef<string | null>(run),
    approveId = useRef<string | null>(null),
    startId = useRef<string | null>(null);
  useEffect(() => {
    if (!run) return;
    let stopped = false;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/prompt-studio/build-status/${encodeURIComponent(run!)}`, {
          signal: abort.signal,
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (stopped) return;
        setStatus(data);
        if (!["ready", "failed", "needs_review", "paused_budget"].includes(data.status))
          timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : "Build connection failed");
      }
    }
    void poll();
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [run]);
  async function estimate() {
    setBusy(true);
    setError("");
    try {
      setPrepared(await post("/api/prompt-studio/prepare", { sessionId: session, revision }));
      setApproved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Estimate failed");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!prepared || !approved) return;
    setBusy(true);
    setError("");
    try {
      runId.current ??= crypto.randomUUID();
      approveId.current ??= crypto.randomUUID();
      startId.current ??= crypto.randomUUID();
      const result = await post("/api/cost/wallet/runs", {
        runId: runId.current,
        specId: prepared.specId,
        selection: prepared.quote.selection,
        pricingVersion: prepared.quote.weightsVersion,
      });
      if (result.quote.costCredits !== prepared.quote.costCredits)
        throw new Error("Pricing changed. Reload the estimate before approving.");
      const quotedRun = result.wallet.runs.find(
        (r: { id: string; phase: string }) => r.id === runId.current,
      );
      if (quotedRun?.phase === "awaiting_approval") {
        const approval = await post(`/api/cost/wallet/runs/${runId.current}`, {
          action: "approve",
          decisionId: approveId.current,
          capCredits: prepared.quote.costCredits,
        });
        if (!approval.allowed) throw new Error(approval.reason);
      }
      if (quotedRun?.phase !== "running") {
        const started = await post(`/api/cost/wallet/runs/${runId.current}`, {
          action: "start",
          decisionId: startId.current,
        });
        if (!started.allowed)
          throw new Error(`Build not started: ${started.reason}. Check your credit balance.`);
      }
      router.push(`/apps/build?session=${session}&revision=${revision}&run=${runId.current}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build could not start");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href={`/apps/new?session=${encodeURIComponent(session ?? "")}`}>
        ← Back to Prompt Studio
      </Link>
      <p className="mt-8 text-xs uppercase tracking-widest text-slate">PROVN · Product build</p>
      <h1 className="mt-3 text-3xl font-semibold">
        {!run
          ? "Review and start your build"
          : status?.status === "ready"
            ? "Your product source is ready"
            : status?.status === "needs_review"
              ? "Your build needs review"
              : "Your product is building"}
      </h1>
      <p className="mt-4 text-slate">
        Generate a downloadable Next.js app with pages, email login and private CRUD data.
        Deployment and custom integrations are separate steps.
      </p>
      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {!run && (
        <section className="mt-8 rounded-2xl border border-rule bg-white p-6">
          <p>
            Build from saved, reviewed version {revision || "not selected"}. Later edits will not
            change this build.
          </p>
          <button
            className="studio-button mt-4"
            disabled={busy || !session || !revision}
            onClick={() => void estimate()}
          >
            {busy ? "Working…" : "Get build estimate"}
          </button>
          {prepared && (
            <>
              <h2 className="mt-6 text-xl">Up to {prepared.quote.costCredits} credits</h2>
              <p className="mt-3">
                Included: {prepared.quote.featureCosts?.map((f) => f.label).join(", ")}. Optional
                features are deferred. No deployment fee is charged.
              </p>
              <p>Available balance: {prepared.availableCredits} credits.</p>
              {prepared.availableCredits < prepared.quote.costCredits && (
                <p role="status">
                  Ask the team to fund your wallet before starting. No credits have been reserved.
                </p>
              )}
              <p className="mt-2 text-sm">
                Provider budget: ${prepared.quote.modelBudgetUsd}. The quoted credits are charged on
                successful source generation, and held when the worker is available and the build
                starts. No automatic top-up.
              </p>
              <label className="mt-6 flex gap-3">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                I approve this scope and maximum credit charge.
              </label>
              <button
                className="studio-button mt-4"
                disabled={
                  !approved || busy || prepared.availableCredits < prepared.quote.costCredits
                }
                onClick={() => void start()}
              >
                Approve and build product
              </button>
            </>
          )}
        </section>
      )}
      {run && (
        <section className="mt-8 rounded-2xl border border-rule bg-white p-6" aria-live="polite">
          <h2 className="text-xl">{status?.status ?? "Connecting…"}</h2>
          <p className="mt-3">{status?.message}</p>
          {status && (
            <p className="mt-3 text-sm">
              Provider usage: ${Number(status.build.spent_usd).toFixed(4)} / $
              {Number(status.build.budget_usd).toFixed(4)}
            </p>
          )}
          <ol className="mt-6 space-y-3">
            {status?.steps.map((step, i) => (
              <li key={i}>{step.message}</li>
            ))}
          </ol>
          {status?.downloadUrl && (
            <a className="studio-button mt-6 inline-block" href={status.downloadUrl}>
              Download product source
            </a>
          )}
          {status?.status === "ready" && (
            <p className="mt-4 text-sm">
              Source and compilation checks are complete. Reload this page if the download link
              expires. Connect a dedicated Supabase project and review the app before deployment.
              This is not a production release.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
