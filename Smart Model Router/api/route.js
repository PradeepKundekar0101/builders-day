import { decide } from "../lib/decide.js";
import { prepare, send, readBody } from "../lib/http.js";

// POST /api/route  { prompt, mode?, override?: { model?, tier? }, contextTokens?, byo? }
// Returns the routing decision only. Nothing is sent to a model.
export default async function handler(req, res) {
  if (!prepare(req, res, "POST, OPTIONS")) return;
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  try {
    const body = await readBody(req);
    if (!body.prompt || typeof body.prompt !== "string")
      return send(res, 400, { error: "prompt (string) is required." });
    const { decision } = await decide(body);
    send(res, 200, decision);
  } catch (err) {
    send(res, 500, { error: String(err.message || err) });
  }
}
