"use client";
import { useState } from "react";
import {
  PromptStudioDraftSchema,
  sanitizeStudioDraft,
  type PromptStudioDraft,
} from "@buildwise/shared";
import {
  DEFAULT_PROFILE,
  INITIAL_DEMO,
  PLANS,
  demoQuote,
  demoRoutes,
  demoTransition,
  type BuilderProfile,
  type DemoAction,
  type Scope,
} from "@/lib/provn-demo";
import "./p0-panels.css";
export type P0Module = "cost" | "route" | "launch" | "shield" | "proof" | "wallet";
export function useProvnDemo(draft: PromptStudioDraft, reviewed: boolean) {
  const [scope, setScope] = useState<Scope>("standard");
  const [state, setState] = useState(INITIAL_DEMO);
  const [error, setError] = useState("");
  const profile = draft.onboarding ?? DEFAULT_PROFILE;
  const fingerprint = JSON.stringify({ draft, scope });
  const current = state.fingerprint === fingerprint;
  const context = { fingerprint, reviewed, profile, scope };
  function act(action: DemoAction) {
    try {
      const next = demoTransition(state, action, context);
      setState(next);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo action failed");
      return false;
    }
  }
  return {
    scope,
    setScope,
    state,
    error,
    profile,
    current,
    reviewed,
    act,
    reset: () => {
      setState(INITIAL_DEMO);
      setError("");
    },
    quote: demoQuote(scope),
    routes: demoRoutes(profile, scope),
  };
}
type Controller = ReturnType<typeof useProvnDemo>;
export function P0Panels({
  module,
  setModule,
  controller: c,
  draft,
  onChange,
  onReview,
  onBuild,
  running,
}: {
  module: P0Module;
  setModule: (m: P0Module) => void;
  controller: Controller;
  draft: PromptStudioDraft;
  onChange: (d: PromptStudioDraft) => void;
  onReview: () => void;
  onBuild: () => void;
  running: boolean;
}) {
  const [settingsError, setSettingsError] = useState("");
  const [cap, setCap] = useState(String(c.profile.budgetCap));
  const [threshold, setThreshold] = useState(String(c.profile.approvalThreshold));
  const [topup, setTopup] = useState("100");
  const [checkout, setCheckout] = useState(false);
  const state = c.state;
  const usable = c.current && c.reviewed;
  const remaining = PLANS[c.profile.plan].credits - state.spent;
  const phase = (...values: (typeof state.phase)[]) =>
    usable && values.includes(state.phase) && !running;
  function profile(update: Partial<BuilderProfile>) {
    const next = { ...draft, onboarding: { ...c.profile, ...update } };
    const result = PromptStudioDraftSchema.safeParse(next);
    if (result.success) {
      onChange(result.data);
      setSettingsError("");
    } else setSettingsError("Check the whole-number credit limits.");
  }
  function report() {
    const clean = sanitizeStudioDraft(draft);
    const payload = {
      schemaVersion: "1.0",
      kind: "provn-proof-report",
      evidenceMode: "simulated",
      realDeployment: false,
      realSecurityTesting: false,
      releaseApproved: false,
      fixtureComplete: usable && state.phase === "proven",
      project: clean.spec.name,
      quoteCredits: c.quote.total,
      simulatedActualCredits: state.spent,
      simulatedRefundCredits: state.refund,
      routes: c.routes,
      smoke: usable ? state.smoke : "stale",
      findings: { critical: state.criticalOpen, high: state.highOpen, reviewer: state.reviewer },
      ledger: state.ledger,
      liveUrl: null,
      generatedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "provn-proof-report-demo.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="p0-panel">
      <div className="p0-banner">
        <span>DEMO ADAPTER</span> All estimates, routes, findings and ledger entries below are
        fixtures. No services are executing.
      </div>
      {c.error && (
        <p className="p0-error" role="alert">
          {c.error}
        </p>
      )}
      {state.phase !== "idle" && !usable && (
        <p className="p0-warning">
          This run is stale because the brief/settings changed or need review.{" "}
          <button onClick={c.reset}>Reset demo run</button> and approve a fresh quote.
        </p>
      )}
      {module === "cost" && (
        <>
          <p className="p0-eyebrow">PROVN COST GUARD</p>
          <h2>Know the cost. Set the limit.</h2>
          <p className="p0-description">
            Approve the scope before running. The hard cap and loop breaker are frontend simulations
            until the billing gateway is connected.
          </p>
          <div className="p0-scope">
            {(["lean", "standard", "max"] as const).map((s) => (
              <button aria-pressed={c.scope === s} onClick={() => c.setScope(s)} key={s}>
                <b>{s === "max" ? "Max quality" : s === "lean" ? "Lean MVP" : "Standard"}</b>
                <strong>
                  {demoQuote(s).total}
                  <small>credits</small>
                </strong>
                <span>
                  {s === "lean"
                    ? "One core journey; defer integrations."
                    : s === "max"
                      ? "Frontier review for high-impact work."
                      : "Balanced scaffold, launch and security."}
                </span>
              </button>
            ))}
          </div>
          <p className="p0-footnote">
            Scope options are mock recommendations, not a priced estimate of your actual features.
            Lean changes the quote fixture; review the brief to remove deferred features.
          </p>
          <div className="p0-metrics">
            <div>
              <span>Estimated tokens</span>
              <strong>{c.quote.tokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>Estimated time</span>
              <strong>~{c.quote.minutes} min</strong>
            </div>
            <div>
              <span>Demo balance</span>
              <strong>{remaining.toLocaleString()} cr</strong>
            </div>
          </div>
          <div className="p0-table">
            {c.quote.items.map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <b>{item.credits} cr</b>
              </div>
            ))}
            <div>
              <strong>Total quote</strong>
              <strong>{c.quote.total} credits</strong>
            </div>
          </div>
          <div className="p0-settings">
            <label>
              Hard cap / run
              <input
                type="number"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                min="1"
                max="100000"
              />
            </label>
            <label>
              Approval threshold
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min="0"
                max="100000"
              />
            </label>
            <button
              onClick={() =>
                profile({ budgetCap: Number(cap), approvalThreshold: Number(threshold) })
              }
            >
              Apply limits
            </button>
          </div>
          {settingsError && (
            <p role="alert" className="p0-error">
              {settingsError}
            </p>
          )}
          <p className="p0-warning">
            {c.quote.total > c.profile.approvalThreshold
              ? `This run exceeds your ${c.profile.approvalThreshold}-credit threshold. Explicit approval is required.`
              : "This demo asks for approval even below your threshold."}
          </p>
          {c.quote.total > c.profile.budgetCap && (
            <p className="p0-error">
              Quote exceeds the {c.profile.budgetCap}-credit hard cap. Select Lean or increase the
              cap.
            </p>
          )}
          {!c.reviewed && (
            <button className="p0-primary" onClick={onReview}>
              Review brief & done criteria first →
            </button>
          )}
          <div className="p0-actions">
            <button
              className="p0-primary"
              disabled={
                !c.reviewed ||
                running ||
                c.quote.total > c.profile.budgetCap ||
                c.quote.total > remaining ||
                !["idle", "approved", "stopped"].includes(state.phase)
              }
              onClick={() => c.act("approve")}
            >
              Approve {c.quote.total} demo credits
            </button>
            <button
              disabled={!phase("approved")}
              onClick={() => {
                if (c.act("build")) onBuild();
              }}
            >
              Run approved simulation →
            </button>
          </div>
          <div className="p0-card">
            <h3>Loop breaker & platform failures</h3>
            <p>
              Three repair attempts maximum in this fixture. A platform-caused failure stops the run
              and returns its simulated charge.
            </p>
            <button
              disabled={!phase("built", "deployed")}
              onClick={() => c.act("platform-failure")}
            >
              Test loop breaker + refund
            </button>
            {state.phase === "stopped" && (
              <p className="p0-success">
                Stopped after {state.retries} attempts. Refunded {state.refund} demo credits.
              </p>
            )}
          </div>
        </>
      )}
      {module === "route" && (
        <>
          <p className="p0-eyebrow">PROVN ROUTE</p>
          <h2>The right tier for each task.</h2>
          <p className="p0-description">
            Default policy: cheapest model that passes. Actual quality evaluation and routing
            require the team’s router adapter.
          </p>
          <label className="p0-checkbox">
            <input
              type="checkbox"
              checked={c.profile.privateMode}
              onChange={(e) => profile({ privateMode: e.target.checked })}
            />
            Private mode: force every task to Lib 3 (local)
          </label>
          <div className="p0-route-list">
            {c.routes.map((r) => (
              <article className="p0-card" key={r.task}>
                <span className="p0-badge">{r.library}</span>
                <h3>{r.task}</h3>
                <p>
                  Effort: {r.effort} · Impact: {r.impact}
                </p>
                <strong>{r.model}</strong>
                <p>{r.reason}</p>
                <small>Evaluation: pending · Routing decision: simulated</small>
              </article>
            ))}
          </div>
          <p className="p0-footnote">
            Lib 1: frontier · Lib 2: Hugging Face SLMs · Lib 3: local Gemma / Qwen. Free excludes
            frontier; Max quality can select frontier only on an eligible plan.
          </p>
          <a
            className="p0-link"
            href="https://provn-route.vercel.app"
            target="_blank"
            rel="noreferrer"
          >
            Open the team’s router ↗
          </a>
          <p className="p0-footnote">
            External service from the PRD; not integrated or verified by this frontend.
          </p>
        </>
      )}
      {module === "launch" && (
        <>
          <p className="p0-eyebrow">PROVN LAUNCH</p>
          <h2>Every part of a deployment.</h2>
          <p className="p0-description">
            The real deployment adapter must provision these resources and return their status.
            Credentials stay on the server.
          </p>
          <div className="p0-table">
            {[
              "Frontend bundle",
              "Backend service",
              "Database + migrations",
              "Environment variables",
              "Domain + TLS",
            ].map((name) => (
              <div key={name}>
                <span>{name}</span>
                <b>
                  {phase("deployed", "attacked", "triaged", "fixed", "proven")
                    ? "Simulated ready"
                    : "Not provisioned"}
                </b>
              </div>
            ))}
          </div>
          <div className="p0-card">
            <h3>Preview deployment</h3>
            <p>
              Deploy privately for validation, then run Siege. Public release stays gated on
              security review and the smoke check.
            </p>
            <button
              className="p0-primary"
              disabled={!phase("built")}
              onClick={() => c.act("deploy")}
            >
              Simulate staging deployment
            </button>
            <p>
              Real live URL: <b>Not available</b>
            </p>
            <p>
              Domain purchase: <b>Not connected · credits quoted before purchase</b>
            </p>
          </div>
          <button disabled={!phase("deployed")} onClick={() => setModule("shield")}>
            Continue to Shield / Siege →
          </button>
        </>
      )}
      {module === "shield" && (
        <>
          <p className="p0-eyebrow">PROVN SHIELD / SIEGE</p>
          <h2>Proof before public release.</h2>
          <p className="p0-description">
            Synthetic findings demonstrate the workflow. No code audit or attack has run against any
            application.
          </p>
          <div className="p0-actions">
            <button
              className="p0-primary"
              disabled={!phase("deployed")}
              onClick={() => c.act("attack")}
            >
              Simulate authorized security checks
            </button>
            <span className="p0-badge">Own staging target only</span>
          </div>
          {["attacked", "triaged", "fixed", "proven"].includes(state.phase) && (
            <>
              <div className="p0-finding">
                <span>CRITICAL · fixture</span>
                <h3>Exposed application key</h3>
                <p>
                  Sample finding in a generated bundle. Remediation: move credentials server-side
                  and rotate the exposed key.
                </p>
                <b>{state.criticalOpen ? "Open · release blocked" : "Resolved in fixture"}</b>
              </div>
              <div className="p0-finding high">
                <span>HIGH · fixture</span>
                <h3>Unprotected write endpoint</h3>
                <p>Sample finding: missing authorization and request throttling.</p>
                <b>{state.highOpen ? "Open · release blocked" : "Resolved in fixture"}</b>
              </div>
            </>
          )}
          <div className="p0-card">
            <span className="p0-badge">THE GUILD · HUMAN REVIEW</span>
            <h3>High and critical findings need judgment.</h3>
            <p>
              Reviewer:{" "}
              {state.reviewer === "confirmed"
                ? "Demo reviewer confirmed (simulated)"
                : "Unassigned / pending"}
            </p>
            <p>
              Review allowance: 25 credits · example Guild share 20 · platform share 5 (20%). No
              real bounty has been posted.
            </p>
            <button disabled={!phase("attacked")} onClick={() => c.act("triage")}>
              Simulate Guild confirmation
            </button>
            <button disabled={!phase("triaged")} onClick={() => c.act("fix")}>
              Simulate remediation + retest
            </button>
          </div>
          <div className="p0-card">
            <h3>P0 release smoke check</h3>
            <p>
              Pass/fail check after staging deployment and remediation. Full eval loops and manual
              QA requests belong to P1.
            </p>
            <div className="p0-actions">
              <button disabled={!phase("fixed")} onClick={() => c.act("smoke-fail")}>
                Simulate failed check
              </button>
              <button
                className="p0-primary"
                disabled={!phase("fixed")}
                onClick={() => c.act("smoke-pass")}
              >
                Simulate passed check
              </button>
            </div>
            <p>
              Status: <b>{usable ? state.smoke : "not-run"}</b>
            </p>
          </div>
          <button disabled={!phase("proven")} onClick={() => setModule("proof")}>
            View the proof report →
          </button>
        </>
      )}
      {module === "proof" && (
        <>
          <p className="p0-eyebrow">EVERY BUILD, PROVEN.</p>
          <h2>Your build’s proof record.</h2>
          <p className="p0-description">
            {phase("proven")
              ? "Demo workflow complete. This is synthetic evidence, not a security certification or permission to release."
              : "Evidence is incomplete. Finish security review, remediation and the smoke check."}
          </p>
          <div className="p0-metrics">
            <div>
              <span>Quoted credits</span>
              <strong>{c.quote.total}</strong>
            </div>
            <div>
              <span>Simulated spend</span>
              <strong>{state.spent}</strong>
            </div>
            <div>
              <span>Simulated refund</span>
              <strong>{state.refund}</strong>
            </div>
          </div>
          <div className="p0-table">
            <div>
              <span>Open critical / high</span>
              <b>
                {state.criticalOpen} / {state.highOpen}
              </b>
            </div>
            <div>
              <span>Guild confirmation</span>
              <b>{state.reviewer} · simulated</b>
            </div>
            <div>
              <span>Smoke check</span>
              <b>{usable ? state.smoke : "stale"}</b>
            </div>
            <div>
              <span>Attacks blocked</span>
              <b>Not measured</b>
            </div>
            <div>
              <span>Real models / tests executed</span>
              <b>None</b>
            </div>
            <div>
              <span>Live deployment</span>
              <b>Not connected</b>
            </div>
            <div>
              <span>Release authorization</span>
              <b>Not issued</b>
            </div>
          </div>
          <h3>Task routing record</h3>
          {c.routes.map((r) => (
            <p key={r.task}>
              {r.task}: {r.library} / {r.model}
            </p>
          ))}
          <button className="p0-primary" onClick={report}>
            Export demo proof report
          </button>
          <div className="p0-card">
            <h3>Targets, not measured outcomes</h3>
            <p>
              Idea to live &lt;30 min · Estimate accuracy ±20% · Routing savings 40%+ · Open
              critical vulnerabilities at public launch: 0 · Free-to-paid: 10%.
            </p>
          </div>
        </>
      )}
      {module === "wallet" && (
        <>
          <p className="p0-eyebrow">ONE WALLET. ONE UNIT.</p>
          <h2>Credits across the whole build.</h2>
          <p className="p0-description">
            PRD draft pricing: 1 credit = $0.01. These are test prices, not validated commercial
            rates.
          </p>
          <div className="p0-metrics">
            <div>
              <span>{PLANS[c.profile.plan].label} demo balance</span>
              <strong>{remaining.toLocaleString()} cr</strong>
            </div>
            <div>
              <span>Run reservation</span>
              <strong>{state.phase === "approved" ? state.reserved : 0} cr</strong>
            </div>
          </div>
          <label>
            Demo plan
            <select
              value={c.profile.plan}
              onChange={(e) => profile({ plan: e.target.value as BuilderProfile["plan"] })}
            >
              {Object.entries(PLANS).map(([id, p]) => (
                <option value={id} key={id}>
                  {p.label}: {p.price} · {p.credits} credits
                </option>
              ))}
            </select>
          </label>
          <div className="p0-table">
            <div>
              <span>Free</span>
              <b>300/mo · cheaper models · 1 project · privacy score</b>
            </div>
            <div>
              <span>Builder</span>
              <b>2,500 · basic red team · domain buying</b>
            </div>
            <div>
              <span>Pro</span>
              <b>7,000 · full red team · local + evals · connectors</b>
            </div>
            <div>
              <span>Team</span>
              <b>Custom · pooled credits · SSO · audit logs · seats</b>
            </div>
          </div>
          <label className="p0-checkbox">
            <input
              type="checkbox"
              checked={c.profile.byok}
              onChange={(e) => profile({ byok: e.target.checked })}
            />
            Bring-your-own key preference
          </label>
          <p className="p0-footnote">
            BYOK: plan only, no token markup in the proposed pricing. Provider usage is billed
            separately; this fixed demo quote does not calculate BYOK usage. Key connection is not
            wired. Never put keys in chat.
          </p>
          <div className="p0-card">
            <h3>Pay as you go</h3>
            <label>
              Top-up credits (minimum 100 = $1)
              <input
                type="number"
                min="100"
                step="100"
                value={topup}
                onChange={(e) => setTopup(e.target.value)}
              />
            </label>
            <button
              disabled={!Number.isInteger(Number(topup)) || Number(topup) < 100}
              onClick={() => setCheckout(true)}
            >
              View checkout handoff
            </button>
            {checkout && (
              <p role="status">
                Pine Labs checkout is not connected. Cards, UPI and net banking are planned; INR
                amount must come from the server checkout quote. No payment or top-up has occurred.
              </p>
            )}
          </div>
          <h3>Demo credit ledger</h3>
          {state.ledger.length ? (
            state.ledger.map((item, i) => (
              <div className="p0-ledger" key={i}>
                <span>{item.label}</span>
                <b>
                  {item.credits > 0 ? "+" : ""}
                  {item.credits} cr
                </b>
              </div>
            ))
          ) : (
            <p>No simulated charges yet.</p>
          )}
          <p className="p0-footnote">
            Privacy score: unavailable until the privacy scanner is connected. Team membership,
            pooled-wallet enforcement, SSO and audit log services are not connected.
          </p>
        </>
      )}
      <div className="p0-p1">
        <span>P1 / NOT IN THIS DEMO</span>
        <p>
          Provn Loop: full evals, release scorecards and Guild manual QA. Hang-on agent: definition
          pending; excluded from hackathon scope.
        </p>
      </div>
    </div>
  );
}
