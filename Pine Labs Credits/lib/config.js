// Reads settings from process.env, after loading an optional .env file next to server.mjs.
import { existsSync, readFileSync } from "node:fs";

export const UAT_BASE_URL = "https://pluraluat.v2.pinepg.in";

export function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

export function readConfig(env = process.env) {
  const mode = (env.PINELABS_MODE || "uat").toLowerCase();
  if (!["mock", "uat", "live"].includes(mode))
    throw new Error(`PINELABS_MODE must be mock, uat or live (got "${mode}")`);
  const port = num(env.PORT, 4600);
  const cfg = {
    mode,
    port,
    publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ""),
    baseUrl: (env.PINELABS_BASE_URL || (mode === "live" ? "" : UAT_BASE_URL)).replace(/\/$/, ""),
    clientId: env.PINELABS_CLIENT_ID || "",
    clientSecret: env.PINELABS_CLIENT_SECRET || "",
    // Optional pre-issued key, sent as the Bearer token instead of fetching one with client id/secret.
    apiKey: env.PINELABS_API_KEY || "",
    webhookSecret: env.PINELABS_WEBHOOK_SECRET || "",
    adminToken: env.ADMIN_TOKEN || "",
    linkExpiryHours: num(env.LINK_EXPIRY_HOURS, 24),
    dataFile: env.DATA_FILE || "",
    agents: {
      baseUrl: (env.AGENTICORG_BASE_URL || "https://agenticorg.hackathon.pinelabs.com").replace(
        /\/$/,
        "",
      ),
      apiKey: env.AGENTICORG_API_KEY || "",
      // Provn credits charged for each completed agent run.
      runCredits: num(env.AGENT_RUN_CREDITS, 10),
    },
    pricing: {
      creditsPerUsd: num(env.CREDITS_PER_USD, 100),
      minTopupUsd: num(env.MIN_TOPUP_USD, 1),
      chargeCurrency: (env.CHARGE_CURRENCY || "INR").toUpperCase(),
      usdToInr: num(env.USD_TO_INR, 88),
    },
  };
  if (mode === "mock" && !cfg.webhookSecret) {
    // Mock checkout signs its own webhooks, so the real verification path is exercised.
    cfg.webhookSecret = Buffer.from("provn-mock-webhook-secret").toString("base64");
  }
  if (mode !== "mock") {
    const missing = [];
    if (!cfg.apiKey && !cfg.clientId) missing.push("PINELABS_CLIENT_ID");
    if (!cfg.apiKey && !cfg.clientSecret) missing.push("PINELABS_CLIENT_SECRET");
    if (!cfg.baseUrl) missing.push("PINELABS_BASE_URL (required for live)");
    if (missing.length)
      throw new Error(
        `Missing ${missing.join(", ")}. Copy .env.example to .env, or run with PINELABS_MODE=mock.`,
      );
  }
  return cfg;
}
