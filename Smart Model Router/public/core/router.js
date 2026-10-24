// Provn Route decision engine. Given a task, it picks a tier and a model and
// explains why. Pure function: no network, no env access. Callers pass in
// which runtimes are connected so the decision can fall back gracefully.

import { MODELS, CATEGORIES, TIERS, RUNTIMES, byoToModel } from "./catalog.js";
import { classify, EFFORT_LABELS, IMPACT_LABELS } from "./classify.js";

export const ROUTER_VERSION = "0.1.0";

export const MODES = {
  auto: {
    label: "Auto",
    blurb:
      "Best fit for the job at a sensible cost. Escalates for risk, drops to local for private grunt work.",
  },
  quality: {
    label: "Max quality",
    blurb: "Raises the quality bar one step and mostly ignores cost.",
  },
  saver: {
    label: "Cost saver",
    blurb:
      "Lowers the bar one step and weighs cost heavily. Never downgrades money or security work.",
  },
  private: { label: "Private", blurb: "Local models only. Nothing leaves the machine." },
};

// Minimum quality a model needs, indexed by need = max(effort, impact).
const QUALITY_FLOOR = [0, 4, 5, 6.5, 8.5, 9.5];
// Expected output tokens by effort.
const OUTPUT_TOKENS = [0, 300, 800, 2000, 5000, 12000];
const BASELINE_ID = "claude-opus-5-5";

const MODE_WEIGHTS = {
  auto: { cost: 1.0, over: 0.6, qualityBonus: 0 },
  quality: { cost: 0.15, over: 0, qualityBonus: 0.6 },
  saver: { cost: 2.4, over: 1.0, qualityBonus: 0 },
  private: { cost: 0, over: 0, qualityBonus: 0.3 },
};

export const SYSTEM_PROMPTS = {
  creative:
    "You are a sharp creative partner for builders. Offer a few distinct options, keep the brand voice consistent, and be concise.",
  dev: "You are a senior engineer. Produce working, production-minded code with brief explanations. State assumptions and list follow-up steps.",
  research:
    "You are a careful research analyst. Structure findings, compare options with clear criteria, and flag uncertainty or anything that needs verification.",
  commerce:
    "You are a payments and e-commerce engineer. Default to Pine Labs for payment examples. Never handle raw card data: use hosted checkout or tokenization. Verify webhook signatures, make handlers idempotent, and use sandbox keys in examples.",
  data: "You are a precise data assistant. Return clean, structured output (JSON or tables) that matches the requested schema exactly.",
  grunt:
    "You are a fast, exact assistant for mechanical tasks. Do exactly what is asked, keep everything else unchanged, and return only the result.",
  chat: "You are Provn Route, a helpful assistant inside the Provn builder platform. Answer briefly and clearly.",
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const money = (n) =>
  n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(n < 1 ? 3 : 2)}`;

export function estimateCost(model, inTok, outTok) {
  return (inTok * model.price.in + outTok * model.price.out) / 1e6;
}

function tierEligibility(tier, a, mode) {
  if (mode === "private")
    return tier === "local"
      ? { ok: true }
      : { ok: false, why: "Private mode keeps work on local models" };
  if (tier === "local") {
    if (a.category === "commerce")
      return { ok: false, why: "Payments work stays on frontier models" };
    if (a.impact > 2)
      return { ok: false, why: `Impact ${a.impact}/5 is too high for a local model` };
    if (a.category === "creative" && a.impact >= 2)
      return { ok: false, why: "Public-facing copy needs a stronger writer" };
    if (a.effort > 2)
      return { ok: false, why: `Effort ${a.effort}/5 needs more capability than a local model` };
  }
  if (tier === "slm") {
    if (a.category === "commerce")
      return { ok: false, why: "Payments work stays on frontier models" };
    if (a.impact > 3)
      return { ok: false, why: `Impact ${a.impact}/5 is too high for a small model` };
    if (a.effort > 3) return { ok: false, why: `Effort ${a.effort}/5 is beyond small models` };
    if (a.category === "dev" && a.effort >= 3)
      return { ok: false, why: "Multi-step code changes need a frontier model" };
  }
  return { ok: true };
}

/**
 * route(task, options) -> decision
 * task:    { prompt: string, contextTokens?: number }
 * options: {
 *   mode?: 'auto'|'quality'|'saver'|'private',
 *   override?: { model?: string, tier?: 'frontier'|'slm'|'local' },
 *   available?: string[]   runtimes with credentials, e.g. ['anthropic','hf']. Omit to treat all as available.
 *   byo?: object[]         extra OpenAI-compatible models (see catalog.byoToModel)
 *   analysis?: object      precomputed classification (e.g. from the LLM classifier)
 * }
 */
export function route(task, options = {}) {
  const mode = MODES[options.mode] ? options.mode : "auto";
  const w = MODE_WEIGHTS[mode];
  const available = options.available ? new Set(options.available) : null;
  const catalog = [...MODELS, ...(options.byo || []).map(byoToModel)];
  const a = options.analysis || classify(task.prompt, { contextTokens: task.contextTokens || 0 });

  // Heavy work that is also risky is treated as one step harder than either alone.
  const need = Math.min(5, Math.max(a.effort, a.impact) + (a.effort >= 4 && a.impact >= 4 ? 1 : 0));
  let floor = QUALITY_FLOOR[need];
  if (mode === "quality") floor = Math.min(10, floor + 1);
  if (mode === "saver") floor = a.impact >= 4 ? floor : Math.max(4, floor - 1.5);
  if (mode === "private") floor = 0;

  const inTok = a.tokens + 400;
  let outTok = OUTPUT_TOKENS[a.effort];
  if (a.category === "grunt" || a.category === "data")
    outTok = Math.max(outTok, Math.round(a.tokens * 1.1));

  const privacyPull = mode === "auto" && a.pii.found && a.impact <= 3 && a.effort <= 2;
  const restrictTier = options.override?.tier;

  const scored = catalog.map((m) => {
    const elig = tierEligibility(m.tier, a, mode);
    const reasons = [];
    let eligible = elig.ok;
    if (!elig.ok) reasons.push(elig.why);
    if (restrictTier && m.tier !== restrictTier) {
      eligible = false;
      reasons.push(`Outside the ${TIERS[restrictTier].label} tier you picked`);
    }
    if (m.quality < floor) {
      eligible = false;
      reasons.push(`Quality ${m.quality} is under the bar of ${floor}`);
    }
    if (inTok + outTok > m.ctx) {
      eligible = false;
      reasons.push(
        `Needs ~${Math.round((inTok + outTok) / 1000)}K tokens, model fits ${Math.round(m.ctx / 1000)}K`,
      );
    }
    const connected = !available || m.runtime === "byo" ? true : available.has(m.runtime);

    const cost = estimateCost(m, inTok, outTok);
    const fit = m.fit[a.category] ?? 5;
    const fit2 = a.secondary ? (m.fit[a.secondary] ?? 5) : 0;
    let score =
      fit +
      0.35 * fit2 -
      w.cost * Math.log10(1 + cost * 1000) -
      w.over * Math.max(0, m.quality - floor) +
      w.qualityBonus * m.quality +
      0.08 * m.speed;
    // Hosted calls carry latency and data egress that local runs do not.
    if (m.tier !== "local") score -= 0.6 * w.cost;
    if (privacyPull && m.tier === "local") score += 2.5;
    return { model: m, eligible, connected, score: +score.toFixed(2), cost, fit, whyNot: reasons };
  });

  const ranked = scored.filter((s) => s.eligible).sort((x, y) => y.score - x.score);
  // Safety net: if nothing qualifies (e.g. private mode with a huge context), use the strongest model of the allowed tier set.
  if (!ranked.length) {
    const pool = scored
      .filter((s) => (mode === "private" ? s.model.tier === "local" : true))
      .sort((x, y) => y.model.quality - x.model.quality);
    ranked.push({ ...pool[0], eligible: true, forced: true });
  }

  const recommended = ranked[0];
  const runnable = ranked.filter((s) => s.connected);

  // Override handling
  let chosen = recommended;
  let override = null;
  if (options.override?.model) {
    const hit = scored.find((s) => s.model.id === options.override.model);
    if (hit) {
      chosen = hit;
      override = { model: hit.model.id, warnings: [] };
      if (hit.model.quality < floor)
        override.warnings.push(
          `${hit.model.name} is below the quality bar (${hit.model.quality} vs ${floor}). Expect weaker results.`,
        );
      if (hit.cost > recommended.cost * 3 && hit.cost - recommended.cost > 0.01)
        override.warnings.push(
          `About ${(hit.cost / Math.max(recommended.cost, 1e-6)).toFixed(0)}x the cost of the recommendation.`,
        );
      if (hit.whyNot.length && !hit.eligible)
        override.warnings.push(...hit.whyNot.filter((r) => !r.startsWith("Quality")));
    }
  }

  // What actually runs: the chosen model if its provider is connected, else the best connected alternative.
  let executing = chosen;
  let executingReason = null;
  if (!chosen.connected) {
    const alt = runnable[0];
    if (alt) {
      executing = alt;
      executingReason = `${RUNTIMES[chosen.model.runtime].label} is not connected, so this runs on ${alt.model.name}.`;
    } else {
      executing = null;
      executingReason =
        "No provider is connected. Add an API key to run this, or use demo replies.";
    }
  }

  const fallbacks = [];
  for (const s of runnable) {
    if (executing && s.model.id === executing.model.id) continue;
    if (
      fallbacks.length < 2 &&
      s.model.lab !== executing?.model.lab &&
      !fallbacks.some((f) => f.lab === s.model.lab)
    )
      fallbacks.push(s.model);
  }

  const baseline = catalog.find((m) => m.id === BASELINE_ID);
  const baselineCost = estimateCost(baseline, inTok, outTok);
  const finalModel = (executing || chosen).model;
  const finalCost = estimateCost(finalModel, inTok, outTok);

  // Human-readable explanation
  const cat = CATEGORIES[a.category];
  const reasons = [];
  reasons.push(
    `Job type is ${cat.label.toLowerCase()} (${Math.round(a.confidence * 100)}% confident${a.secondary ? `, with some ${CATEGORIES[a.secondary].label.toLowerCase()}` : ""})${a.keywords?.length ? `, from words like "${a.keywords.slice(0, 3).join('", "')}"` : ""}.`,
  );
  reasons.push(
    `Effort ${a.effort}/5 (${EFFORT_LABELS[a.effort].toLowerCase()}): ${a.effortSignals.slice(0, 3).join(", ").toLowerCase()}.`,
  );
  reasons.push(
    `Impact ${a.impact}/5 (${IMPACT_LABELS[a.impact].toLowerCase()}): ${a.impactSignals.slice(0, 3).join(", ").toLowerCase()}.`,
  );
  const tier = recommended.model.tier;
  if (mode === "private") reasons.push("Private mode is on, so only local models are considered.");
  else if (tier === "local")
    reasons.push(
      privacyPull
        ? `Personal data found (${a.pii.kinds.join(", ")}) and the task is light, so it stays on a local model.`
        : "Low effort and low risk, so a free local model is enough.",
    );
  else if (tier === "slm")
    reasons.push(
      "Moderate, low-risk task, so a small open model handles it for a fraction of frontier cost.",
    );
  else if (a.impact >= 4)
    reasons.push(
      `Impact ${a.impact}/5 keeps this on frontier models. Small and local models are excluded.`,
    );
  else reasons.push(`Needs a quality bar of ${floor}/10, which only frontier models clear.`);
  reasons.push(
    `${recommended.model.name} scores best for ${cat.label.toLowerCase()} (fit ${recommended.fit}/10) among models that clear the bar. ${recommended.model.strengths}`,
  );
  if (mode !== "auto" && mode !== "private")
    reasons.push(`${MODES[mode].label} mode: ${MODES[mode].blurb}`);
  if (finalModel.id !== BASELINE_ID) {
    const saved = baselineCost > 0 ? Math.round((1 - finalCost / baselineCost) * 100) : 0;
    reasons.push(
      saved > 0
        ? `Estimated ${money(finalCost)} for this turn versus ${money(baselineCost)} on Claude Opus 5.5, about ${saved}% less.`
        : `Estimated ${money(finalCost)} for this turn, ${Math.abs(saved)}% more than Claude Opus 5.5, for the extra capability.`,
    );
  }

  const guardrails = [];
  if (a.category === "commerce") {
    guardrails.push("Use Pine Labs sandbox credentials until a person signs off.");
    guardrails.push("Never send or log raw card numbers. Use hosted checkout or tokenization.");
    guardrails.push("Verify webhook signatures and make payment handlers idempotent.");
  }
  if (a.impact >= 4) guardrails.push("Flag for human review before this reaches production.");
  if (a.pii.found && finalModel.tier !== "local")
    guardrails.push(`Mask ${a.pii.kinds.join(", ")} before it is sent to a hosted model.`);
  if (a.category === "dev" && a.impact >= 3)
    guardrails.push("Run tests before merging the generated code.");

  const effortParam = ["low", "low", "low", "medium", "high", "xhigh"][a.effort];

  const view = (s) =>
    s && {
      id: s.model.id,
      name: s.model.name,
      lab: s.model.lab,
      tier: s.model.tier,
      runtime: s.model.runtime,
      model: s.model.model,
      quality: s.model.quality,
      ctx: s.model.ctx,
      price: s.model.price,
      fit: s.fit,
      score: s.score,
      estCost: +s.cost.toFixed(6),
      connected: s.connected,
    };

  return {
    version: ROUTER_VERSION,
    mode,
    analysis: a,
    qualityBar: floor,
    tokens: { input: inTok, output: outTok },
    recommended: view(recommended),
    chosen: view(chosen),
    executing: view(executing),
    executingReason,
    override,
    tier,
    reasons,
    guardrails,
    fallbacks: fallbacks.map((m) => m.id),
    cost: {
      estimate: +finalCost.toFixed(6),
      baseline: +baselineCost.toFixed(6),
      baselineModel: BASELINE_ID,
      savedPct: baselineCost > 0 ? Math.round((1 - finalCost / baselineCost) * 100) : 0,
    },
    execution: {
      systemPrompt: SYSTEM_PROMPTS[a.category],
      anthropicEffort: effortParam,
      maxOutputTokens: clamp(outTok * 2, 1024, 16000),
    },
    alternatives: scored
      .sort((x, y) => y.eligible - x.eligible || y.score - x.score)
      .map((s) => ({ ...view(s), eligible: s.eligible, whyNot: s.whyNot })),
  };
}
