"use client";
import { useState } from "react";
import { ProvnLogo } from "./provn-logo";
import {
  catalog,
  estimateSpec as estimate,
  suggestAlternatives,
  type SpecSelection as Selection,
} from "@buildwise/estimator";
import { fixture, specRevision } from "../fixture";

type Status = {
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  paused: boolean;
  stopped: boolean;
  breached: boolean;
};
const features = catalog(fixture);
const initial: Selection = { specRevision, selectedIds: features.map((f) => f.id) };
const credits = (n: number) => `${Number(n.toFixed(2)).toLocaleString()} cr`;
export default function Page() {
  const [selection, setSelection] = useState(initial),
    [target, setTarget] = useState("500"),
    [plan, setPlan] = useState("builder"),
    [billingMode, setBillingMode] = useState<"managed" | "byok">("managed"),
    [build, setBuild] = useState<{
      id: string;
      status: Status;
      wallet: {
        availableCredits: number;
        reservedCredits: number;
        chargedCredits: number;
        refundedCredits: number;
        runs: { phase: string; pauseReason?: string; capCredits: number }[];
      };
    } | null>(null),
    [events, setEvents] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const quote = estimate({ spec: fixture, specRevision, selection, billingMode });
  const validTarget =
    target.trim() !== "" && Number.isFinite(Number(target)) && Number(target) >= 0;
  const alternatives = validTarget
    ? suggestAlternatives(
        { spec: fixture, specRevision, selection, billingMode },
        Number(target) / 100,
      )
    : null;
  async function action(action: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selection, plan, billingMode, id: build?.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBuild({ id: data.id ?? build?.id, status: data.status, wallet: data.wallet });
      setEvents((e) => [
        data.message ?? "Quote recomputed on the server. Demo budget opened.",
        ...e,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const run = build?.wallet.runs[0];
  const active = run?.phase === "running";
  const labels: Record<string, string> = {
    awaiting_approval: "Approval required",
    ready: "Ready to start",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    failed: "Failed",
    repeated_failure: "Paused: repeated failure",
    attempt_limit: "Paused: attempt limit",
    failure_review: "Paused: reviewing failure",
  };
  const label = run
    ? labels[run.phase === "paused" ? (run.pauseReason ?? "paused") : run.phase]
    : "Waiting for a quote";
  return (
    <div className="shell">
      <a href="#cost-workspace" className="skip-link">
        Skip to cost workspace
      </a>
      <header>
        <a href="/" className="brand" aria-label="PROVN Cost Guard home">
          <ProvnLogo />
        </a>
        <nav aria-label="Module navigation">
          <a href="http://localhost:3100/prompt-studio-demo">Prompt Studio ↗</a>
          <a href="#cost-workspace" aria-current="page">
            Cost Guard <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </header>
      <main>
        <div className="intro">
          <p className="eyebrow">YOUR VISION. WITHIN REACH.</p>
          <h1>
            Every credit, <em>accounted for.</em>
          </h1>
          <p>Shape your scope, know the cost, and build with a budget you control.</p>
        </div>
        <div className="workspace-bar">
          <span>PROVN / COST GUARD + ESTIMATOR</span>
          <span className="badge">● LOCAL DEMO · NO REAL SPEND</span>
        </div>
        <div className="workspace" id="cost-workspace">
          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">01 / SCOPE</p>
                <h2>Studio bookings</h2>
              </div>
              <span className="tag">Spec v1</span>
            </div>
            <p className="muted">Required features stay included. Optional features can wait.</p>
            <div className="feature-list">
              {features.map((f) => (
                <label key={f.id} className="feature">
                  <input
                    type="checkbox"
                    checked={selection.selectedIds.includes(f.id)}
                    disabled={f.required || !!build || busy}
                    onChange={(e) =>
                      setSelection({
                        ...selection,
                        selectedIds: e.target.checked
                          ? [...selection.selectedIds, f.id]
                          : selection.selectedIds.filter((id) => id !== f.id),
                      })
                    }
                  />
                  <span>
                    {f.label}
                    <small>{f.required ? "Required" : "Optional"}</small>
                  </span>
                  <span className="feature-cost">
                    {quote.featureCosts.find((c) => c.id === f.id)
                      ? credits(quote.featureCosts.find((c) => c.id === f.id)!.modelUsd * 100)
                      : "Not included"}
                  </span>
                </label>
              ))}
            </div>
            <p className="note">
              Row amounts show estimated model cost before margin. CRUD entity costs include their
              forms and lists.
            </p>
          </section>
          <section className="card estimate">
            <p className="eyebrow">02 / ESTIMATE</p>
            <span className="tag">Approximate · pricing v1</span>
            <div className="price" data-testid="price">
              {credits(quote.costUsd * 100)}
            </div>
            <p className="range">
              Range {credits(quote.lowUsd * 100)} to {credits(quote.highUsd * 100)}
            </p>
            <div className="metrics">
              <div>
                <strong>{quote.hours} h</strong>
                <span>Estimated effort</span>
              </div>
              <div>
                <strong>{(quote.tokens / 1000).toFixed(0)}k</strong>
                <span>Estimated tokens</span>
              </div>
            </div>
            <dl>
              <div>
                <dt>Model cost + margin</dt>
                <dd>{credits(quote.drivers[0]!.costUsd * 100)}</dd>
              </div>
              <div>
                <dt>Deployment allowance</dt>
                <dd>{credits(quote.drivers[1]!.costUsd * 100)}</dd>
              </div>
              <div>
                <dt>Integration fees</dt>
                <dd>{credits(quote.drivers[2]!.costUsd * 100)}</dd>
              </div>
              <div className="budget-line">
                <dt>Worker model budget</dt>
                <dd>{credits(quote.modelBudgetUsd * 100)}</dd>
              </div>
            </dl>
            <p className="note">
              1 credit = $0.01. Quotes above 50 credits require approval. Hosting and third-party
              runtime charges are separate. BYOK platform work is covered by the plan; provider
              usage is billed separately.
            </p>
            <label>
              Demo plan{" "}
              <select disabled={!!build} value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="builder">Builder: 2,500 credits</option>
                <option value="free">Free: 300 credits</option>
              </select>
            </label>{" "}
            <label>
              Billing{" "}
              <select
                disabled={!!build}
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value as "managed" | "byok")}
              >
                <option value="managed">Managed</option>
                <option value="byok">BYOK</option>
              </select>
            </label>
            <button className="primary" disabled={busy || !!build} onClick={() => action("lock")}>
              {build ? "Quote locked for this demo" : "Lock credit quote"}
            </button>
            <div className="alternatives">
              <label htmlFor="target">Customer price target (credits)</label>
              <input
                id="target"
                type="number"
                min="0"
                step="50"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              {!validTarget ? (
                <p>Enter a non-negative amount.</p>
              ) : quote.costCredits <= Number(target) ? (
                <p className="success">Your selection fits this target.</p>
              ) : (
                alternatives?.suggestions.map((a, i) => (
                  <div key={i} className="suggestion">
                    <strong>
                      {credits(a.estimate.costCredits)} · save {credits(a.savingsUsd * 100)}
                    </strong>
                    <p>{a.tradeoff}</p>
                    <button disabled={!!build || busy} onClick={() => setSelection(a.selection)}>
                      Use this scope
                    </button>
                  </div>
                ))
              )}
              {validTarget && !alternatives?.achievable && quote.costCredits > Number(target) && (
                <p className="note">
                  Required scope exceeds this target. Revise the specification or increase the
                  budget.
                </p>
              )}
            </div>
          </section>
        </div>
        <section className="card guard">
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / EXECUTION</p>
              <h2>Credit wallet + Cost Guard</h2>
            </div>
            <span
              className={`tag ${run?.phase === "paused" ? "warning" : ""}`}
              data-testid="status"
            >
              {label}
            </span>
          </div>
          <div className="guard-grid">
            {[
              ["Wallet available", build?.wallet.availableCredits],
              ["Held for run", build?.wallet.reservedCredits],
              ["Customer charged", build?.wallet.chargedCredits],
              ["Refunded after charge", build?.wallet.refundedCredits],
            ].map(([title, value]) => (
              <div key={String(title)}>
                <span>{title}</span>
                <strong>{credits(Number(value ?? 0))}</strong>
              </div>
            ))}
          </div>
          <p className="note">
            Provider expense below is tracked separately from customer credits. Local simulated
            balances only.
          </p>
          <div className="guard-grid">
            {[
              ["Authorized cap", build?.status.capMicros],
              ["Actual spend", build?.status.spentMicros],
              ["Reserved", build?.status.reservedMicros],
              ["Available", build?.status.availableMicros],
            ].map(([title, value]) => (
              <div key={String(title)}>
                <span>{title}</span>
                <strong>{typeof value === "number" ? credits(value / 10000) : "0 cr"}</strong>
              </div>
            ))}
          </div>
          <div className="meter">
            <div
              style={{
                width: build
                  ? `${Math.min(100, ((build.status.spentMicros + build.status.reservedMicros) / build.status.capMicros) * 100)}%`
                  : "0%",
              }}
            />
          </div>
          <p className="note">
            Each simulated attempt reserves 90 provider-cost credits and uses 65. Two identical
            failures pause the run; at most three attempts are permitted before approval. Unknown
            usage stays reserved.
          </p>
          <div className="actions">
            <button
              disabled={
                !build || busy || !["awaiting_approval", "ready"].includes(run?.phase ?? "")
              }
              onClick={() => action("approve")}
            >
              Approve {run?.capCredits ?? quote.costCredits} credits & start
            </button>
            <button disabled={!active || busy} onClick={() => action("turn")}>
              Run successful attempt
            </button>
            <button disabled={!active || busy} onClick={() => action("fail")}>
              Simulate same failure
            </button>
            <button disabled={run?.phase !== "paused" || busy} onClick={() => action("resume")}>
              Approve one more attempt
            </button>
            <button disabled={!active || busy} onClick={() => action("complete")}>
              Complete & charge quote
            </button>
            <button
              disabled={!build || busy || !["running", "paused"].includes(run?.phase ?? "")}
              onClick={() => action("platform_failure")}
            >
              Confirm platform failure
            </button>
            <button
              disabled={!build || busy || !["completed", "failed"].includes(run?.phase ?? "")}
              onClick={() => action("refund")}
            >
              Simulate staff refund
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBuild(null);
                setEvents([]);
                setError("");
              }}
            >
              New demo
            </button>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="log" aria-live="polite">
            {events.length ? (
              events.slice(0, 7).map((e, i) => (
                <p key={i}>
                  <span>{String(events.length - i).padStart(2, "0")}</span>
                  {e}
                </p>
              ))
            ) : (
              <p>Lock a quote to begin. No provider or payment credentials needed.</p>
            )}
          </div>
        </section>
        <footer>
          Estimates are provisional. Demo state lives in server memory and resets on restart.
          Production adapter and integration instructions are included in the handoff.
        </footer>
      </main>
    </div>
  );
}
