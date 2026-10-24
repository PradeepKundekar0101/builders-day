"use client";
import { useState } from "react";
import { catalog, estimate, suggestAlternatives, type Selection } from "@buildwise/estimator";
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
const dollars = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
export default function Page() {
  const [selection, setSelection] = useState(initial),
    [target, setTarget] = useState("5"),
    [build, setBuild] = useState<{ id: string; status: Status } | null>(null),
    [events, setEvents] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const quote = estimate({ spec: fixture, specRevision, selection });
  const validTarget =
    target.trim() !== "" && Number.isFinite(Number(target)) && Number(target) >= 0;
  const alternatives = validTarget
    ? suggestAlternatives({ spec: fixture, specRevision, selection }, Number(target))
    : null;
  async function action(action: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, selection, id: build?.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBuild({ id: data.id ?? build?.id, status: data.status });
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
  const label = build?.status.stopped
    ? "Stopped"
    : build?.status.breached
      ? "Needs investigation"
      : build?.status.paused
        ? "Paused for budget"
        : "Ready";
  return (
    <div className="shell">
      <header>
        <a href="/" className="brand">
          <span className="mark">P</span> PROVN<span className="divider">/</span>
          <span className="muted">Cost workspace</span>
        </a>
        <span className="badge">LOCAL DEMO · NO REAL SPEND</span>
      </header>
      <main>
        <div className="intro">
          <p className="eyebrow">BUILD WITH A BUDGET</p>
          <h1>
            Know the cost.
            <br />
            Stay in control.
          </h1>
          <p>
            Choose the scope, inspect the estimate, then watch the guard protect a simulated build.
          </p>
        </div>
        <div className="workspace">
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
                      ? dollars(quote.featureCosts.find((c) => c.id === f.id)!.modelUsd)
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
              {dollars(quote.costUsd)}
            </div>
            <p className="range">
              Range {dollars(quote.lowUsd)} to {dollars(quote.highUsd)}
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
                <dd>{dollars(quote.drivers[0]!.costUsd)}</dd>
              </div>
              <div>
                <dt>Deployment allowance</dt>
                <dd>$1.00</dd>
              </div>
              <div>
                <dt>Integration fees</dt>
                <dd>{dollars(quote.drivers[2]!.costUsd)}</dd>
              </div>
              <div className="budget-line">
                <dt>Worker model budget</dt>
                <dd>{dollars(quote.modelBudgetUsd)}</dd>
              </div>
            </dl>
            <p className="note">
              Hosting and third-party runtime charges are separate and not estimated here. No
              monthly credit balance is connected.
            </p>
            <button className="primary" disabled={busy || !!build} onClick={() => action("lock")}>
              {build ? "Quote locked for this demo" : "Lock quote & open demo budget"}
            </button>
            <div className="alternatives">
              <label htmlFor="target">Customer price target (USD)</label>
              <input
                id="target"
                type="number"
                min="0"
                step="0.5"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              {!validTarget ? (
                <p>Enter a non-negative amount.</p>
              ) : quote.costUsd <= Number(target) ? (
                <p className="success">Your selection fits this target.</p>
              ) : (
                alternatives?.suggestions.map((a, i) => (
                  <div key={i} className="suggestion">
                    <strong>
                      {dollars(a.estimate.costUsd)} · save {dollars(a.savingsUsd)}
                    </strong>
                    <p>{a.tradeoff}</p>
                    <button disabled={!!build || busy} onClick={() => setSelection(a.selection)}>
                      Use this scope
                    </button>
                  </div>
                ))
              )}
              {validTarget && !alternatives?.achievable && quote.costUsd > Number(target) && (
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
              <h2>Cost Guard</h2>
            </div>
            <span className={`tag ${build?.status.paused ? "warning" : ""}`} data-testid="status">
              {build ? label : "Waiting for a quote"}
            </span>
          </div>
          <div className="guard-grid">
            {[
              ["Authorized cap", build?.status.capMicros],
              ["Actual spend", build?.status.spentMicros],
              ["Reserved", build?.status.reservedMicros],
              ["Available", build?.status.availableMicros],
            ].map(([title, value]) => (
              <div key={String(title)}>
                <span>{title}</span>
                <strong>{typeof value === "number" ? dollars(value / 1e6) : "$0.00"}</strong>
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
            Each simulated call reserves $0.90 before starting and reports $0.65 actual usage.
            Unknown usage stays reserved.
          </p>
          <div className="actions">
            <button
              disabled={!build || busy || build.status.stopped}
              onClick={() => action("turn")}
            >
              Run next simulated call
            </button>
            <button
              disabled={!build || busy || build.status.stopped}
              onClick={() => action("concurrent")}
            >
              Try 2 concurrent reservations
            </button>
            <button
              disabled={!build || busy || build.status.stopped}
              onClick={() => action("approve")}
            >
              Approve exactly $1 more
            </button>
            <button
              disabled={!build || busy || build.status.stopped}
              onClick={() => action("stop")}
            >
              Stop build
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
