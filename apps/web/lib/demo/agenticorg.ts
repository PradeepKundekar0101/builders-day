import type { Plan } from "./plan";

export type SecurityReview = {
  risk: "low" | "medium" | "high" | null;
  summary: string;
  checks: string[];
};

const RISKS = new Set(["low", "medium", "high"]);

function fromObject(value: Record<string, unknown>): SecurityReview | null {
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const checks = Array.isArray(value.checks)
    ? value.checks.filter((c): c is string => typeof c === "string" && c.trim() !== "").slice(0, 3)
    : [];
  const risk =
    typeof value.risk === "string" && RISKS.has(value.risk.toLowerCase())
      ? (value.risk.toLowerCase() as SecurityReview["risk"])
      : null;
  if (!summary && checks.length === 0) return null;
  return { risk, summary, checks };
}

/** The agent is asked for JSON, but may wrap it in text; accept either, never throw. */
export function reviewFromOutput(output: Record<string, unknown>): SecurityReview | null {
  const direct = fromObject(output);
  if (direct && (direct.risk || direct.checks.length)) return direct;
  for (const value of Object.values(output)) {
    if (typeof value !== "string") continue;
    const json = value.match(/\{[\s\S]*\}/)?.[0];
    if (!json) continue;
    try {
      const parsed = fromObject(JSON.parse(json) as Record<string, unknown>);
      if (parsed) return parsed;
    } catch {
      // Not JSON; keep looking.
    }
  }
  return direct;
}

const TIMEOUT_MS = 20_000;

/**
 * Asks the "PROVN Security Reviewer" agent on AgenticOrg to review the plan.
 * Returns null when AgenticOrg is not configured, slow or failing, so the demo never breaks.
 */
export async function securityReview(plan: Plan): Promise<SecurityReview | null> {
  const apiKey = process.env.AGENTICORG_API_KEY;
  const agentId = process.env.AGENTICORG_AGENT_ID;
  if (!apiKey || !agentId) return null;
  try {
    const { AgenticOrg } = await import("agenticorg-sdk");
    const client = new AgenticOrg({
      apiKey,
      baseUrl: process.env.AGENTICORG_BASE_URL ?? "https://agenticorg.hackathon.pinelabs.com",
      timeout: TIMEOUT_MS,
    });
    const result = await client.agents.run(agentId, {
      action: "process",
      inputs: {
        app_name: plan.name,
        idea: plan.idea,
        features: plan.features.map((f) => f.label),
        pages: plan.pages,
      },
    });
    if (result.error) {
      console.error(`AgenticOrg review failed: ${result.error}`);
      return null;
    }
    return reviewFromOutput(result.output ?? {});
  } catch (error) {
    console.error("AgenticOrg review unavailable", error);
    return null;
  }
}
