// Shared by /api/route and /api/chat: analyse the task and run the router with
// what this deployment actually has connected.
import { route } from '../public/core/router.js';
import { byoToModel } from '../public/core/catalog.js';
import { classify } from '../public/core/classify.js';
import { classifyWithLLM } from './llm-classifier.js';
import { connectedRuntimes, byoFromEnv, settings } from './env.js';

export function collectByo(bodyByo = []) {
  const defs = [...byoFromEnv(), ...(Array.isArray(bodyByo) ? bodyByo : [])].filter(d => d && d.baseURL && d.model);
  const creds = {};
  for (const d of defs) {
    const m = byoToModel(d);
    if (d.apiKey) creds[m.id] = { baseURL: d.baseURL, apiKey: d.apiKey };
  }
  // Strip keys before they go anywhere near the decision payload.
  const safe = defs.map(({ apiKey, ...rest }) => rest);
  return { defs: safe, creds };
}

export async function decide({ prompt, contextTokens = 0, mode, override, byo }) {
  const cfg = settings();
  const analysis = cfg.classifier === 'llm'
    ? await classifyWithLLM(prompt, { contextTokens })
    : classify(prompt, { contextTokens });
  const { defs, creds } = collectByo(byo);
  const decision = route({ prompt, contextTokens }, {
    mode: mode || cfg.defaultMode,
    override,
    available: connectedRuntimes(),
    byo: defs,
    analysis,
  });
  return { decision, byoDefs: defs, byoCreds: creds };
}
