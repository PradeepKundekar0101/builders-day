import { MODELS, CATEGORIES, TIERS, RUNTIMES } from '../public/core/catalog.js';
import { MODES, ROUTER_VERSION } from '../public/core/router.js';
import { connectedRuntimes, byoFromEnv, settings } from '../lib/env.js';
import { byoToModel } from '../public/core/catalog.js';
import { prepare, send } from '../lib/http.js';

// GET /api/catalog: every model the router can pick, and which providers are connected.
export default function handler(req, res) {
  if (!prepare(req, res, 'GET, OPTIONS')) return;
  const connected = new Set(connectedRuntimes());
  const models = [...MODELS, ...byoFromEnv().map(byoToModel)].map(({ apiKeyEnv, baseURL, ...m }) => ({
    ...m, connected: m.runtime === 'byo' || connected.has(m.runtime),
  }));
  send(res, 200, {
    version: ROUTER_VERSION,
    classifier: settings().classifier,
    defaultMode: settings().defaultMode,
    runtimes: Object.fromEntries(Object.entries(RUNTIMES).map(([id, r]) => [id, { ...r, connected: id === 'byo' || connected.has(id) }])),
    categories: CATEGORIES, tiers: TIERS, modes: MODES, models,
  });
}
