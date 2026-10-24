// Provn credits console: local server for Pine Labs payment links and the credit ledger.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv, readConfig } from "./lib/config.js";
import { createFileStore } from "./lib/store.js";
import { createPineLabsClient, signWebhook } from "./lib/pinelabs.js";
import { createMockPineLabsClient } from "./lib/mock-pinelabs.js";
import { createCreditsService } from "./lib/credits.js";
import { formatMinor } from "./lib/pricing.js";
import { createAgenticOrgClient, createMockAgenticOrgClient } from "./lib/agenticorg.js";

const here = dirname(fileURLToPath(import.meta.url));

export function createApp(config) {
  const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
  const store = createFileStore(config.dataFile);
  const mock = config.mode === "mock" ? createMockPineLabsClient({ publicBaseUrl: config.publicBaseUrl }) : null;
  const client = mock || createPineLabsClient(config);
  const agentsLive = !!config.agents.apiKey;
  const agentClient = agentsLive ? createAgenticOrgClient(config.agents) : createMockAgenticOrgClient();
  const credits = createCreditsService({ store, client, config, log, agentClient });
  const page = (f) => readFileSync(join(here, "public", f));

  const send = (res, status, body, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  const readBody = (req) =>
    new Promise((ok, fail) => {
      let s = "";
      req.on("data", (c) => {
        s += c;
        if (s.length > 1e6) req.destroy();
      });
      req.on("end", () => ok(s));
      req.on("error", fail);
    });
  const authorized = (req) => {
    if (!config.adminToken) return true;
    const got = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    const want = Buffer.from(config.adminToken);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    try {
      if (req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, page("index.html"), "text/html; charset=utf-8");
      if (req.method === "GET" && p === "/app.js") return send(res, 200, page("app.js"), "text/javascript; charset=utf-8");
      if (req.method === "GET" && p === "/thanks") return send(res, 200, page("thanks.html"), "text/html; charset=utf-8");
      if (req.method === "GET" && p === "/health") return send(res, 200, { ok: true, mode: config.mode });

      // Public: Pine Labs posts here. Signature-verified, then confirmed via API.
      if (req.method === "POST" && p === "/api/webhooks/pinelabs") {
        const raw = await readBody(req);
        const out = await credits.handleWebhook(req.headers, raw);
        return send(res, 200, { ok: true, status: out.status || null });
      }
      // Public: the payer lands on /thanks, which asks for its link status by reference.
      if (req.method === "GET" && p === "/api/thanks") {
        const ref = url.searchParams.get("ref");
        const link = Object.values(store.read().links).find((l) => l.reference === ref);
        if (!link) return send(res, 404, { error: "Unknown reference" });
        const synced = await credits.syncLink(link.id, "redirect").catch(() => link);
        return send(res, 200, { status: synced.status, credits: synced.credits, granted: !!synced.grantedAt });
      }

      if (mock && p.startsWith("/mock/checkout/")) {
        const id = p.split("/").pop();
        const link = await mock.getPaymentLink(id).catch(() => null);
        if (!link) return send(res, 404, "Unknown mock link", "text/plain");
        if (req.method === "POST") {
          mock.markPaid(id);
          const raw = JSON.stringify({ event: "payment_link.processed", data: { payment_link_id: id, merchant_payment_link_reference: link.merchant_payment_link_reference, status: "PROCESSED", amount: link.amount } });
          const wid = "msg_" + randomUUID(), ts = String(Math.floor(Date.now() / 1000));
          const sig = signWebhook({ id: wid, timestamp: ts, rawBody: raw, secretBase64: config.webhookSecret });
          await credits.handleWebhook({ "webhook-id": wid, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` }, raw);
          res.writeHead(303, { Location: link.callback_url });
          return res.end();
        }
        const html = page("mock-checkout.html").toString()
          .replaceAll("{{amount}}", formatMinor(link.amount.value, link.amount.currency))
          .replaceAll("{{description}}", link.description.replace(/[<>&"]/g, ""))
          .replaceAll("{{email}}", String(link.customer?.email_id || "").replace(/[<>&"]/g, ""))
          .replaceAll("{{status}}", link.status);
        return send(res, 200, html, "text/html; charset=utf-8");
      }

      if (p.startsWith("/api/")) {
        if (!authorized(req)) return send(res, 401, { error: "Admin token required" });
        if (req.method === "GET" && p === "/api/summary") return send(res, 200, credits.summary());
        if (req.method === "POST" && p === "/api/topups") {
          const body = JSON.parse((await readBody(req)) || "{}");
          return send(res, 201, await credits.createTopup(body));
        }
        let m;
        if (req.method === "POST" && (m = p.match(/^\/api\/links\/([^/]+)\/sync$/))) return send(res, 200, await credits.syncLink(decodeURIComponent(m[1])));
        if (req.method === "POST" && p === "/api/reconcile") return send(res, 200, { checked: await credits.reconcileOpen() });
        if (req.method === "GET" && (m = p.match(/^\/api\/users\/([^/]+)\/balance$/))) {
          const email = decodeURIComponent(m[1]);
          return send(res, 200, { email, balance: credits.balance(email) });
        }
        if (req.method === "GET" && p === "/api/agents") {
          return send(res, 200, { live: agentsLive, runCredits: config.agents.runCredits, agents: await agentClient.listAgents() });
        }
        if (req.method === "POST" && (m = p.match(/^\/api\/agents\/([^/]+)\/run$/))) {
          const body = JSON.parse((await readBody(req)) || "{}");
          return send(res, 200, await credits.runAgent({ agentId: decodeURIComponent(m[1]), ...body }));
        }
        if (req.method === "POST" && p === "/api/credits/spend") {
          const body = JSON.parse((await readBody(req)) || "{}");
          return send(res, 200, credits.spend(body));
        }
      }
      send(res, 404, { error: "Not found" });
    } catch (e) {
      const status = e.status && e.status < 500 ? e.status : 500;
      if (status === 500) log(`error ${req.method} ${p}: ${e.message}`);
      send(res, e.body || e.upstream ? 502 : status, { error: e.message });
    }
  });

  return { server, credits, store, mock };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadDotEnv(join(here, ".env"));
  let config;
  try {
    config = readConfig();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  config.dataFile ||= join(here, "data", `ledger.${config.mode}.json`);
  const { server, credits } = createApp(config);
  server.listen(config.port, () => {
    console.log(`Provn credits console (${config.mode.toUpperCase()}) on http://localhost:${config.port}`);
    console.log(`Webhook URL for the Pine Labs dashboard: ${config.publicBaseUrl}/api/webhooks/pinelabs`);
  });
  // Poll open links so credits land even when Pine Labs can't reach this machine.
  setInterval(() => credits.reconcileOpen().catch(() => {}), 20_000).unref();
}
