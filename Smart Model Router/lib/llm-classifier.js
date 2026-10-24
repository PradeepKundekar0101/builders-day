// Optional: ask Claude Haiku 5.5 to classify the task, then merge with the heuristic
// analysis (which still supplies PII detection, token counts and signals).
// Enabled with ROUTER_CLASSIFIER=llm. Any failure falls back to the heuristic result.
import Anthropic from "@anthropic-ai/sdk";
import { classify } from "../public/core/classify.js";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["category", "secondary", "effort", "impact", "confidence", "rationale"],
  properties: {
    category: {
      type: "string",
      enum: ["creative", "dev", "research", "commerce", "data", "grunt", "chat"],
    },
    secondary: {
      type: ["string", "null"],
      enum: ["creative", "dev", "research", "commerce", "data", "grunt", "chat", null],
    },
    effort: { type: "integer", minimum: 1, maximum: 5 },
    impact: { type: "integer", minimum: 1, maximum: 5 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    rationale: { type: "string" },
  },
};

const SYSTEM = `You classify tasks for a model router. Categories: creative (copy, naming, brand),
dev (writing or changing code), research (analysis, comparisons), commerce (payments, checkout,
e-commerce), data (extraction, structuring, SQL), grunt (mechanical formatting, renaming, conversion),
chat (small talk, quick questions). Effort 1-5 is how much reasoning and output the task needs.
Impact 1-5 is the cost of a wrong answer (money, security, production, regulated data are 4-5).`;

export async function classifyWithLLM(text, opts) {
  const base = classify(text, opts);
  if (!process.env.ANTHROPIC_API_KEY) return base;
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: text.slice(0, 8000) }],
    });
    const block = msg.content.find((b) => b.type === "text");
    const out = JSON.parse(block.text);
    return {
      ...base,
      category: out.category,
      secondary: out.secondary && out.secondary !== out.category ? out.secondary : null,
      confidence: out.confidence,
      effort: out.effort,
      impact:
        base.category === "commerce" || out.category === "commerce"
          ? Math.max(out.impact, 4)
          : out.impact,
      effortSignals: [out.rationale],
      impactSignals: base.impactSignals,
      classifier: "llm:claude-haiku-5-5",
    };
  } catch (err) {
    return { ...base, classifierError: String(err.message || err) };
  }
}
