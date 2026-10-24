// Small helpers shared by the API handlers: CORS, optional shared-secret auth, JSON bodies.

export function prepare(req, res, methods = "GET, POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-provn-key");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  const secret = process.env.ROUTER_API_SECRET;
  if (secret && req.headers["x-provn-key"] !== secret) {
    send(res, 401, { error: "Missing or wrong x-provn-key header." });
    return false;
  }
  return true;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body !== undefined)
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
