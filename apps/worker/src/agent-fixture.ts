import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { supportedSpec } from "@buildwise/build-engine";
import { AgentConfig, runCodeAgent } from "./agent";
import { prepareProduct, verifyProduct } from "./generate";
// Local end-to-end run of the Claude code agent. Spends real API credit; writes nothing to Supabase.
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY (for example in apps/worker/.env.local).");
const directory = resolve(process.argv[2] ?? "/tmp/provn-agent-fixture");
const spec = supportedSpec({
  name: "Habit Garden",
  summary: "Track daily habits and watch streaks grow",
  pages: [
    { name: "Today", purpose: "See today's habits and mark them done", mustHave: true },
    { name: "Insights", purpose: "Understand streaks and consistency over time", mustHave: false },
  ],
  entities: [
    {
      name: "habits",
      ownerScoped: true,
      mustHave: true,
      fields: [
        { name: "title", type: "text", required: true },
        { name: "notes", type: "long_text", required: false },
        { name: "target_per_week", type: "number", required: false },
        { name: "active", type: "boolean", required: false },
      ],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
});
const onStep = async (message: string) => {
  process.stdout.write(message + "\n");
};
const { migration } = await prepareProduct({
  spec,
  directory,
  template: fileURLToPath(new URL("../../../templates/generated-app/", import.meta.url)),
  onStep,
});
const config = AgentConfig.parse({
  apiKey,
  model: process.env.PROVN_BUILD_MODEL || undefined,
  maxBudgetUsd: Number(process.env.PROVN_BUILD_MAX_USD || 3) * 0.8,
});
const agent = await runCodeAgent({
  spec,
  directory,
  config,
  signal: AbortSignal.timeout(20 * 60_000),
  onStep,
});
process.stdout.write(
  `Agent ${agent.value.subtype}: $${(agent.actualMicros / 1e6).toFixed(4)}, ${agent.inputTokens} in / ${agent.outputTokens} out tokens.\n${agent.value.summary}\n`,
);
if (!agent.value.ok) process.exit(1);
await verifyProduct({
  directory,
  migration,
  agent: { model: config.model, summary: agent.value.summary },
  onStep,
});
process.stdout.write(
  `Product built at ${directory}. Run it with: cd ${directory} && npm run dev\n`,
);
