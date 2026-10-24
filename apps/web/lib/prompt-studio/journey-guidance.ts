import type { DemoState } from "@/lib/provn-demo";
export type StudioDestination =
  "brief" | "cost" | "route" | "launch" | "shield" | "proof" | "wallet";
export function studioNextStep(
  stage: number,
  reviewed: boolean,
  current: boolean,
  phase: DemoState["phase"],
): { title: string; detail: string; label: string; destination: StudioDestination } {
  if (!reviewed)
    return stage < 3
      ? {
          title: "Your idea comes first",
          detail:
            "We’ll surface cost, deployment and security decisions as they become relevant. You can inspect your brief at any time.",
          label: "Inspect brief & prompts",
          destination: "brief",
        }
      : {
          title: "Review what we’re about to build",
          detail: "Check the requirements and done criteria before approving a run.",
          label: "Review brief & prompts",
          destination: "brief",
        };
  if (phase !== "idle" && !current)
    return {
      title: "Your requirements changed",
      detail:
        "The previous quote and evidence are stale. Open Cost Guard to reset the demo and review a fresh quote.",
      label: "Review changed scope",
      destination: "cost",
    };
  const steps = {
    idle: [
      "Price the next run",
      "Compare scope options, tokens, time and credits. Nothing runs until you approve.",
      "Review estimate",
      "cost",
    ],
    approved: [
      "See who will do the work",
      "Inspect the task routing, then start the approved simulation from Cost Guard.",
      "Inspect model routing",
      "route",
    ],
    built: [
      "Prepare a private deployment",
      "Review frontend, backend, database, environment and domain readiness.",
      "Open Launch",
      "launch",
    ],
    deployed: [
      "Check security before release",
      "Run the staging security simulation before considering a public launch.",
      "Open Shield / Siege",
      "shield",
    ],
    attacked: [
      "Human judgment is needed",
      "High and critical findings need Guild confirmation. The allowance is included in the demo quote.",
      "Review findings & Guild",
      "shield",
    ],
    triaged: [
      "Fix and retest the findings",
      "Review remediation before proceeding to the release smoke check.",
      "Review remediation",
      "shield",
    ],
    fixed: [
      "Verify the app still works",
      "Pass the P0 smoke check. A failure keeps completion blocked.",
      "Run smoke check",
      "shield",
    ],
    proven: [
      "Finish with your Shield proof report",
      "Inspect cost, model allocation, findings, human review and smoke results. Demo evidence is not production certification.",
      "Open Shield proof report",
      "proof",
    ],
    stopped: [
      "The loop breaker stopped this run",
      "Inspect the simulated refund and revise the scope before another approval.",
      "Review stop & refund",
      "cost",
    ],
  } as const;
  const [title, detail, label, destination] = steps[phase];
  return { title, detail, label, destination };
}
