import { connectedRuntimes, settings } from '../lib/env.js';
import { ROUTER_VERSION } from '../public/core/router.js';
import { prepare, send } from '../lib/http.js';

export default function handler(req, res) {
  if (!prepare(req, res, 'GET, OPTIONS')) return;
  send(res, 200, { ok: true, version: ROUTER_VERSION, connected: connectedRuntimes(), classifier: settings().classifier });
}
