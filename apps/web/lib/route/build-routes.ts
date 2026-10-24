// Routes each task of a planned build through Provn Route, the team's real routing engine.
// The engine is the same pure module that runs https://provn-route.vercel.app, imported from the
// repo so Prompt Studio and the router cannot drift apart. No models are called here.
import { route } from "../../../../Smart Model Router/public/core/router.js";
import { CATEGORIES } from "../../../../Smart Model Router/public/core/catalog.js";
import {
  EFFORT_LABELS,
  IMPACT_LABELS,
} from "../../../../Smart Model Router/public/core/classify.js";
import type { Plan } from "@/lib/demo/plan";
import type { BuilderProfile, Scope } from "@/lib/provn-demo";

export type RouteMode = "auto" | "quality" | "saver" | "private";
export type Tier = "frontier" | "slm" | "local";

export type BuildRoute = {
  task: string;
  prompt: string;
  jobType: string;
  effort: string;
  impact: string;
  tier: Tier;
  library: string;
  model: string;
  lab: string;
  reason: string;
  costUsd: number;
  baselineUsd: number;
  guardrails: string[];
};

const LIBRARIES: Record<Tier, string> = {
  frontier: "Lib 1 · frontier",
  slm: "Lib 2 · Hugging Face SLM",
  local: "Lib 3 · local",
};

/**
 * Builder settings to a router mode. Private mode always wins. Max quality is a paid option, so on
 * Free it routes like Auto; Auto still escalates high-effort or high-impact work to frontier.
 */
export function routeMode(profile: BuilderProfile, scope: Scope): RouteMode {
  if (profile.privateMode) return "private";
  if (scope === "max") return profile.plan === "free" ? "auto" : "quality";
  return scope === "lean" ? "saver" : "auto";
}

const list = (items: string[]) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** The work a build of this plan breaks into, each phrased as the task the router will see. */
export function buildTasks(plan: Plan): { task: string; prompt: string }[] {
  const things = plan.entities.map((e) => e.toLowerCase());
  const one = things[0] ?? "records";
  const has = (key: string) => plan.features.some((f) => f.key === key);
  return [
    {
      task: "App shell & pages",
      prompt: `Build the ${list(plan.pages)} pages with navigation as React components`,
    },
    {
      task: "Landing copy",
      prompt: `Write the landing page headline and microcopy for ${plan.name}`,
    },
    {
      task: "Data model",
      prompt: `Design the database schema for ${list(things)} with forms, lists and row-level security`,
    },
    ...(has("auth")
      ? [
          {
            task: "Sign-in & permissions",
            prompt: `Implement authentication and permissions so each customer only sees their own ${one}`,
          },
        ]
      : []),
    ...(has("payments")
      ? [
          {
            task: "Payments",
            prompt: "Build checkout with Pine Labs payments, webhooks and refunds",
          },
        ]
      : []),
    ...(has("uploads")
      ? [
          {
            task: "File uploads",
            prompt: `Build file uploads for ${one} with file type checks and storage`,
          },
        ]
      : []),
    ...(has("email")
      ? [
          {
            task: "Email notifications",
            prompt: `Implement email notifications when a ${one.replace(/s$/, "")} changes`,
          },
        ]
      : []),
    ...(has("ai")
      ? [{ task: "AI feature", prompt: `Build an AI assistant feature for ${one}` }]
      : []),
    ...(has("admin")
      ? [
          {
            task: "Admin dashboard",
            prompt: `Build an admin dashboard with permissions for staff to manage every ${one.replace(/s$/, "")}`,
          },
        ]
      : []),
    {
      task: "Sample data",
      prompt: `Generate sample records for ${list(things)} as JSON`,
    },
    {
      task: "Security review",
      prompt:
        "Audit the app for security vulnerabilities in authentication, permissions, data access and secrets before the production launch",
    },
  ];
}

/** Routes every build task; the decision is the engine's, unchanged. */
export function routeBuild(plan: Plan, profile: BuilderProfile, scope: Scope): BuildRoute[] {
  const mode = routeMode(profile, scope);
  return buildTasks(plan).map(({ task, prompt }) => {
    const d = route({ prompt }, { mode });
    const tier = d.recommended.tier as Tier;
    return {
      task,
      prompt,
      jobType: CATEGORIES[d.analysis.category as keyof typeof CATEGORIES].label,
      effort: `${d.analysis.effort}/5 ${EFFORT_LABELS[d.analysis.effort]}`,
      impact: `${d.analysis.impact}/5 ${IMPACT_LABELS[d.analysis.impact]}`,
      tier,
      library: LIBRARIES[tier],
      model: d.recommended.name,
      lab: d.recommended.lab,
      // The engine's fourth reason says why this tier; the others restate the scores shown above.
      reason: d.reasons[3] ?? d.reasons[0],
      costUsd: d.recommended.estCost,
      baselineUsd: d.cost.baseline,
      guardrails: d.guardrails,
    };
  });
}

/** Estimated routed spend against sending every task to the frontier baseline (Claude Opus 5.5). */
export function routingSavings(routes: BuildRoute[]) {
  const routed = routes.reduce((sum, r) => sum + r.costUsd, 0);
  const baseline = routes.reduce((sum, r) => sum + r.baselineUsd, 0);
  return {
    routed,
    baseline,
    savedPct: baseline > 0 ? Math.round((1 - routed / baseline) * 100) : 0,
  };
}
