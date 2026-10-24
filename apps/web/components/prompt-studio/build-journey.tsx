import type { AttackResult } from "@/lib/demo/attack";
import type { Plan } from "@/lib/demo/plan";

export type JourneyAttack =
  | { kind: "idle" }
  | { kind: "running"; result: AttackResult; shown: number }
  | { kind: "done"; result: AttackResult };

const usd = (value: number) => `$${value.toFixed(2)}`;
const hoursText = (hours: number) =>
  hours < 1
    ? "under an hour"
    : Number.isInteger(hours)
      ? `about ${hours} ${hours === 1 ? "hour" : "hours"}`
      : `about ${Math.floor(hours)} to ${Math.ceil(hours)} hours`;

/** One card, one next action: estimate, build, attack, fix. Everything is simulated. */
export function BuildJourney({
  plan,
  building,
  progress,
  built,
  attack,
  onBuild,
  onAttack,
}: {
  plan: Plan;
  building: boolean;
  progress: string;
  built: boolean;
  attack: JourneyAttack;
  onBuild: () => void;
  onAttack: (hardened: boolean) => void;
}) {
  return (
    <article className="build-message provn-build-journey" aria-label="Estimate and build">
      <div className="build-message-label">
        <span className="build-avatar">✦</span>PROVN<span>ESTIMATE · SIMULATED</span>
      </div>
      <h3>{plan.name}</h3>
      <div className="provn-journey-numbers">
        <div>
          <span>Cost (approx.)</span>
          <strong data-testid="journey-cost">{usd(plan.costUsd)}</strong>
        </div>
        <div>
          <span>Build time</span>
          <strong data-testid="journey-time">{hoursText(plan.hours)}</strong>
        </div>
        <div>
          <span>Range</span>
          <strong>
            {usd(plan.lowUsd)}–{usd(plan.highUsd)}
          </strong>
        </div>
      </div>
      <ul className="provn-journey-lines">
        {plan.features.map((feature) => (
          <li key={feature.key}>
            <span>{feature.label}</span>
            <span>
              {feature.hours} h · {usd(feature.usd)}
            </span>
          </li>
        ))}
        <li>
          <span>Deploy and hosting setup</span>
          <span>{usd(plan.deployUsd)}</span>
        </li>
      </ul>

      {!built && !building && (
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
          Attacking… {attack.shown}/{attack.result.probes.length}
        </p>
      )}
      {attack.kind !== "idle" && (
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
    </article>
  );
}
