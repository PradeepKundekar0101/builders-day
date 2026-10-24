import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { SpecSchema } from "@buildwise/shared";
import type { AgentApi, SubmittedIdea } from "./api";
import { askUser, submitSpec } from "./tools";

const SYSTEM_PROMPT = readFileSync(
  new URL("../../../agents/intake/prompt.md", import.meta.url),
  "utf8",
);

const MODEL = process.env.INTAKE_MODEL ?? "claude-opus-5-5";

/** Runs one intake conversation for an idea until the spec is accepted. */
export async function runIntake(client: Anthropic, api: AgentApi, idea: SubmittedIdea) {
  let accepted = false;

  const tools = [
    betaZodTool({
      name: "ask_user",
      description:
        "Ask the founder one clarifying question and wait for their answer. At most 4 per idea.",
      inputSchema: z.object({ question: z.string().min(5).max(500) }),
      run: ({ question }) => askUser(api, idea.id, question),
    }),
    betaZodTool({
      name: "submit_spec",
      description: "Submit the structured spec for pricing. Call once the spec is complete.",
      inputSchema: z.object({ spec: SpecSchema }),
      run: async ({ spec }) => {
        const result = await submitSpec(api, idea.id, spec);
        accepted ||= result.startsWith("Spec accepted");
        return result;
      },
    }),
  ];

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 12,
    system: SYSTEM_PROMPT,
    tools,
    messages: [
      {
        role: "user",
        content: `Idea:\n${idea.text}${idea.links.length ? `\n\nLinks:\n${idea.links.join("\n")}` : ""}`,
      },
    ],
  });

  if (finalMessage.stop_reason === "refusal") {
    throw new Error(`Intake refused for idea ${idea.id}: ${finalMessage.stop_details?.category}`);
  }
  if (!accepted) throw new Error(`Intake for idea ${idea.id} ended without an accepted spec`);
}
