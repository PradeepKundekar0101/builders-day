import type { SecurityReview } from "@/lib/demo/agenticorg";
import type { AttackResult } from "@/lib/demo/attack";
import type { Plan } from "@/lib/demo/plan";
import { DEMO_TIMING, stepFinishTimes } from "@/lib/demo/timing";
import { useEffect, useState } from "react";

export type JourneyAttack =
  | { kind: "idle" }
  | {
      kind: "running";
      result: AttackResult;
      shown: number;
      /** Set on a fix and re-attack: the fix steps, and how many have finished. */
      fix?: { steps: string[]; done: number };
    }
  | { kind: "done"; result: AttackResult };

const usd = (value: number) => `$${value.toFixed(2)}`;
const hoursText = (hours: number) =>
  hours < 1
    ? "under an hour"
    : Number.isInteger(hours)
      ? `about ${hours} ${hours === 1 ? "hour" : "hours"}`
      : `about ${Math.floor(hours)} to ${Math.ceil(hours)} hours`;

/** What the attack is doing right now: applying the fix, running a probe, or scoring. */
function attackStatus({ result, shown, fix }: Extract<JourneyAttack, { kind: "running" }>) {
  if (fix && fix.done < fix.steps.length) return `Applying fix… ${fix.steps[fix.done]}`;
  const total = result.probes.length;
  if (shown >= total) return "Scoring the results…";
  return `${fix ? "Re-attacking" : "Attacking"}… ${shown + 1}/${total} · ${result.probes[shown].name}`;
}

/**
 * The simulated estimate, step by step: read the brief, price each line, add deploy, total it.
 * Line `i` of the plan is priced once step `i + 1` finishes; the totals land on the last step.
 */
function estimateSteps(plan: Plan) {
  return [
    "Reading the brief",
    ...plan.features.map((f) => `Pricing ${f.label.toLowerCase()}`),
    "Adding deploy and hosting",
    "Totalling cost and range",
  ];
}

/** Runs the simulated estimate; restarts when the plan changes. Returns how many steps are done. */
function useEstimate(plan: Plan, skip: boolean) {
  const steps = estimateSteps(plan);
  const key = JSON.stringify([plan.pages, plan.entities, plan.features]);
  const [progress, setProgress] = useState({ key: "", done: 0 });
  useEffect(() => {
    if (skip) return;
    // Reading the brief and totalling take a little longer than pricing a single line.
    const times = stepFinishTimes(DEMO_TIMING.estimateMs, steps.length, (i) =>
      i === 0 || i === steps.length - 1 ? 1.6 : 1,
    );
    const timers = times.map((at, i) => setTimeout(() => setProgress({ key, done: i + 1 }), at));
    return () => timers.forEach(clearTimeout);
  }, [key, skip, steps.length]);
  const done = skip ? steps.length : progress.key === key ? progress.done : 0;
  return { steps, done, estimating: done < steps.length };
}

/** One card, one next action: estimate, build, attack, fix. Everything is simulated. */
export function BuildJourney({
  plan,
  building,
  progress,
  built,
  attack,
  review,
  onBuild,
  onAttack,
}: {
  plan: Plan;
  building: boolean;
  progress: string;
  built: boolean;
  attack: JourneyAttack;
  /** undefined while AgenticOrg is reviewing; null when it is unavailable. */
  review: SecurityReview | null | undefined;
  onBuild: () => void;
  onAttack: (hardened: boolean) => void;
}) {
  const { steps, done, estimating } = useEstimate(
    plan,
    built || building || attack.kind !== "idle",
  );
  const priced = (line: number) => done > line;
  return (
    <article
      className={`build-message provn-build-journey ${estimating ? "is-estimating" : ""}`}
      aria-label="Estimate and build"
      aria-busy={estimating}
    >
      <div className="build-message-label">
        <span className="build-avatar">✦</span>PROVN
        <span>{estimating ? "ESTIMATING · SIMULATED" : "ESTIMATE · SIMULATED"}</span>
      </div>
      <h3>{plan.name}</h3>
      <div className="provn-journey-numbers">
        <div>
          <span>Cost (approx.)</span>
          {estimating ? (
            <i className="provn-journey-pending" aria-hidden="true" />
          ) : (
            <strong data-testid="journey-cost">{usd(plan.costUsd)}</strong>
          )}
        </div>
        <div>
          <span>Build time</span>
          {estimating ? (
            <i className="provn-journey-pending" aria-hidden="true" />
          ) : (
            <strong data-testid="journey-time">{hoursText(plan.hours)}</strong>
          )}
        </div>
        <div>
          <span>Range</span>
          {estimating ? (
            <i className="provn-journey-pending" aria-hidden="true" />
          ) : (
            <strong>
              {usd(plan.lowUsd)}–{usd(plan.highUsd)}
            </strong>
          )}
        </div>
      </div>
      <ul className="provn-journey-lines">
        {plan.features.map((feature, i) => (
          <li key={feature.key}>
            <span>{feature.label}</span>
            {priced(i + 1) ? (
              <span>
                {feature.hours} h · {usd(feature.usd)}
              </span>
            ) : (
              <i className="provn-journey-pending is-line" aria-hidden="true" />
            )}
          </li>
        ))}
        <li>
          <span>Deploy and hosting setup</span>
          {priced(plan.features.length + 1) ? (
            <span>{usd(plan.deployUsd)}</span>
          ) : (
            <i className="provn-journey-pending is-line" aria-hidden="true" />
          )}
        </li>
      </ul>

      {estimating && (
        <p role="status" className="provn-journey-status">
          Estimating… {steps[done]}
        </p>
      )}
      {!estimating && !built && !building && (
        <button className="provn-journey-primary" onClick={onBuild}>
          Build it →
        </button>
      )}
      {building && (
        <p role="status" className="provn-journey-status">
          Building… {progress}
        </p>
      )}
      {built && attack.kind === "idle" && (
        <>
          <p role="status" className="provn-journey-status">
            Your app is ready in the preview on the right. Now try to break it.
          </p>
          <button className="provn-journey-danger" onClick={() => onAttack(false)}>
            Attack my app
          </button>
        </>
      )}
      {attack.kind === "running" && (
        <p role="status" className="provn-journey-status">
          {attackStatus(attack)}
        </p>
      )}
      {(attack.kind === "done" || (attack.kind === "running" && attack.shown > 0)) && (
        <ul aria-label="Attack results" className="provn-journey-lines">
          {attack.result.probes
            .slice(0, attack.kind === "running" ? attack.shown : undefined)
            .map((probe) => (
              <li key={probe.id} className={probe.outcome === "found" ? "is-found" : ""}>
                <span>{probe.name}</span>
                <span>{probe.outcome === "found" ? "Vulnerable" : "Blocked"}</span>
              </li>
            ))}
        </ul>
      )}
      {attack.kind === "done" && attack.result.grade !== "A" && (
        <>
          <p role="status" className="provn-journey-status">
            Grade B · {attack.result.probes.find((p) => p.outcome === "found")?.detail}
          </p>
          <button className="provn-journey-primary" onClick={() => onAttack(true)}>
            Fix & re-attack
          </button>
        </>
      )}
      {attack.kind === "done" && attack.result.grade === "A" && (
        <p role="status" className="provn-journey-status is-pass">
          Grade A · every attack blocked. Ready to publish.
        </p>
      )}
      {attack.kind !== "idle" && review === undefined && (
        <p role="status" className="provn-journey-status">
          AgenticOrg security reviewer is reading your plan…
        </p>
      )}
      {attack.kind !== "idle" && review && (
        <section className="provn-agent-review" aria-label="AgenticOrg security review">
          <p className="provn-agent-review-label">
            AgenticOrg · PROVN Security Reviewer
            {review.risk && <b className={`is-${review.risk}`}>{review.risk} risk</b>}
          </p>
          {review.summary && <p>{review.summary}</p>}
          {review.checks.length > 0 && (
            <ol>
              {review.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ol>
          )}
        </section>
      )}
    </article>
  );
}
