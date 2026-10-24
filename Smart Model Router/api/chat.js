import { decide } from "../lib/decide.js";
import { runModel } from "../lib/providers.js";
import { MODELS, byoToModel } from "../public/core/catalog.js";
import { estimateCost } from "../public/core/router.js";
import { prepare, send, readBody } from "../lib/http.js";

// POST /api/chat
// { messages: [{ role: 'user'|'assistant', content }], mode?, override?, byo?, demo? }
// Routes the last user message, runs it on the chosen model (falling back down the
// chain on errors) and returns { decision, reply, attempts }.
export default async function handler(req, res) {
  if (!prepare(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  try {
    const body = await readBody(req);
    const messages = (body.messages || []).filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
    const last = messages.at(-1);
    if (!last || last.role !== "user")
      return send(res, 400, { error: "messages must end with a user message." });

    const history = messages.slice(0, -1).reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
    const { decision, byoDefs, byoCreds } = await decide({
      ...body,
      prompt: last.content,
      contextTokens: history,
    });

    if (body.demo || !decision.executing) {
      return send(res, 200, { decision, reply: demoReply(decision), attempts: [] });
    }

    const catalog = [...MODELS, ...byoDefs.map(byoToModel)];
    const chain = [decision.executing.id, ...decision.fallbacks]
      .map((id) => catalog.find((m) => m.id === id))
      .filter(Boolean);
    const input = {
      system: decision.execution.systemPrompt,
      messages,
      effort: decision.execution.anthropicEffort,
      maxTokens: decision.execution.maxOutputTokens,
    };

    const attempts = [];
    for (const m of chain) {
      const t0 = Date.now();
      try {
        const out = await runModel(m, input, byoCreds);
        attempts.push({ model: m.id, ok: true, ms: Date.now() - t0 });
        return send(res, 200, {
          decision,
          attempts,
          reply: {
            text: out.text,
            model: m.id,
            modelName: m.name,
            servedBy: out.servedBy,
            usage: out.usage,
            cost: +estimateCost(m, out.usage.input, out.usage.output).toFixed(6),
            latencyMs: Date.now() - t0,
            fellBack: m.id !== decision.executing.id,
          },
        });
      } catch (err) {
        attempts.push({
          model: m.id,
          ok: false,
          ms: Date.now() - t0,
          error: String(err.message || err).slice(0, 300),
        });
      }
    }
    send(res, 200, {
      decision,
      attempts,
      reply: { ...demoReply(decision), error: "Every model in the chain failed. See attempts." },
    });
  } catch (err) {
    send(res, 500, { error: String(err.message || err) });
  }
}

function demoReply(d) {
  const target = d.chosen;
  return {
    demo: true,
    model: target.id,
    modelName: target.name,
    text:
      `Demo reply. Route would send this to ${target.name} (${target.lab}, ${d.tier} tier) in ${d.mode} mode.\n\n` +
      d.reasons.map((r) => `- ${r}`).join("\n") +
      (d.executingReason ? `\n\n${d.executingReason}` : "") +
      "\n\nAdd the provider key in your environment to get a real answer.",
    usage: { input: 0, output: 0 },
    cost: 0,
  };
}
