import Anthropic from "@anthropic-ai/sdk";
import { HttpAgentApi } from "./api";
import { runIntake } from "./run-intake";

const baseUrl = process.env.BUILDWISE_URL ?? "http://localhost:3100";
const token = process.env.AGENT_API_TOKEN;
if (!token) throw new Error("AGENT_API_TOKEN is not set");

const api = new HttpAgentApi(baseUrl, token);
const client = new Anthropic();
const inFlight = new Set<string>();

/** Poll mode: picks up submitted ideas and runs one intake per idea concurrently. */
async function tick() {
  for (const idea of await api.listSubmittedIdeas()) {
    if (inFlight.has(idea.id)) continue;
    inFlight.add(idea.id);
    console.log(`intake started ${idea.id}`);
    runIntake(client, api, idea)
      .then(() => console.log(`intake done ${idea.id}`))
      .catch((error: unknown) => console.error(`intake failed ${idea.id}`, error))
      .finally(() => inFlight.delete(idea.id));
  }
}

console.log(`Intake agent polling ${baseUrl}`);
for (;;) {
  await tick().catch((error: unknown) => console.error("poll failed", error));
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
