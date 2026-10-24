import { useRef } from "react";
import { studioNextStep, type StudioDestination } from "@/lib/prompt-studio/journey-guidance";
import { PLANS, type DemoState, type BuilderProfile } from "@/lib/provn-demo";
export function JourneyGuide({
  stage,
  reviewed,
  current,
  state,
  profile,
  quote,
  busy,
  onOpen,
}: {
  stage: number;
  reviewed: boolean;
  current: boolean;
  state: DemoState;
  profile: BuilderProfile;
  quote: number;
  busy: boolean;
  onOpen: (destination: StudioDestination) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const next = studioNextStep(stage, reviewed, current, state.phase);
  const valid = current && reviewed;
  const scanned = valid && ["attacked", "triaged", "fixed", "proven"].includes(state.phase);
  const deployed =
    valid && ["deployed", "attacked", "triaged", "fixed", "proven"].includes(state.phase);
  return (
    <article
      className="build-message provn-journey-guide"
      aria-label="Build essentials and next step"
    >
      <div className="build-message-label">
        <span className="build-avatar">✦</span>PROVN<span>NEXT STEP</span>
      </div>
      <h3>{next.title}</h3>
      <p>{next.detail}</p>
      <button
        className="build-inline-button"
        disabled={busy}
        onClick={() => onOpen(next.destination)}
      >
        {next.label} ↗
      </button>
      {next.destination === "route" && (
        <button className="build-inline-button" disabled={busy} onClick={() => onOpen("cost")}>
          Open approved run controls ↗
        </button>
      )}
      <details className="provn-essentials" ref={details}>
        <summary>Build essentials · cost, launch & security</summary>
        <p>
          Supporting tools open beside this conversation. All execution figures below are demo
          values.
        </p>
        <div className="provn-essentials-budget">
          Demo estimate {quote} cr · Cap {profile.budgetCap} cr · Approval threshold{" "}
          {profile.approvalThreshold} cr
        </div>
        {(
          [
            ["brief", "Prompt Studio", reviewed ? "Brief reviewed" : "Review pending"],
            [
              "cost",
              "Cost Guard",
              valid && state.phase !== "idle" ? "Demo run recorded" : "Approval needed",
            ],
            ["route", "Provn Route", "Three model libraries · simulated routing"],
            [
              "launch",
              "Provn Launch",
              deployed ? "Staging simulated · no live URL" : "Deployment not connected",
            ],
            [
              "shield",
              "Shield / Siege + Guild",
              scanned
                ? `${state.criticalOpen} critical · ${state.highOpen} high · simulated`
                : "Security not checked",
            ],
            [
              "proof",
              "Shield proof report",
              valid && state.phase === "proven" ? "Demo report ready" : "Evidence incomplete",
            ],
            [
              "wallet",
              "Wallet & payments",
              `${PLANS[profile.plan].credits - state.spent} demo credits · payments disconnected`,
            ],
          ] as const
        ).map(([destination, label, status]) => (
          <button
            key={destination}
            disabled={busy}
            onClick={() => {
              if (details.current) details.current.open = false;
              onOpen(destination);
            }}
          >
            <strong>{label}</strong>
            <span>{status}</span>
            <span aria-hidden="true">↗</span>
          </button>
        ))}
        <p>Privacy score: unavailable until a real scanner is connected.</p>
        <p>
          After v1: Provn Loop (full evals and requested manual QA). Hang-on remains out of scope
          until its role is agreed.
        </p>
      </details>
    </article>
  );
}
