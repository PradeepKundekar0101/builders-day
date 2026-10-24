import { test } from "node:test";
import assert from "node:assert/strict";
import { quote } from "../lib/pricing.js";
import { readConfig } from "../lib/config.js";
import {
  buildPaymentLinkRequest,
  createPineLabsClient,
  signWebhook,
  verifyWebhookSignature,
} from "../lib/pinelabs.js";
import { createApp } from "../server.mjs";

const pricing = { creditsPerUsd: 100, minTopupUsd: 1, chargeCurrency: "INR", usdToInr: 88 };

test("pricing: $1 = 100 credits, charged in paise, $1 minimum", () => {
  const q = quote(5, pricing);
  assert.equal(q.credits, 500);
  assert.deepEqual(q.charge, { currency: "INR", minor: 44000 });
  assert.equal(q.walletUnits, 5_000_000);
  assert.equal(quote(1.25, pricing).credits, 125);
  assert.throws(() => quote(0.99, pricing), /Minimum/);
  assert.throws(() => quote(1.001, pricing), /two decimals/);
  assert.equal(quote(2, { ...pricing, chargeCurrency: "USD" }).charge.minor, 200);
});

test("webhook signature: accepts Pine Labs format, rejects tampering and stale events", () => {
  const secretBase64 = Buffer.from("abc1234").toString("base64");
  const rawBody = '{"event":"payment_link.processed"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = signWebhook({ id: "msg_1", timestamp: ts, rawBody, secretBase64 });
  const headers = {
    "webhook-id": "msg_1",
    "webhook-timestamp": ts,
    "webhook-signature": `v1,${sig}`,
  };
  assert.equal(verifyWebhookSignature({ headers, rawBody, secretBase64 }).ok, true);
  assert.equal(verifyWebhookSignature({ headers, rawBody: rawBody + " ", secretBase64 }).ok, false);
  assert.equal(
    verifyWebhookSignature({
      headers: { ...headers, "webhook-timestamp": "1000" },
      rawBody,
      secretBase64,
    }).ok,
    false,
  );
});

test("payment link request matches the Pine Labs create-link schema", () => {
  const body = buildPaymentLinkRequest({
    reference: "provn_x",
    quote: quote(3, pricing),
    user: { email: "a@b.co", name: "Asha Rao", phone: "9876543210" },
    callbackUrl: "http://localhost/thanks",
    expiresAt: "2026-10-25T00:00:00Z",
  });
  assert.deepEqual(body.amount, { value: 26400, currency: "INR" });
  assert.equal(body.merchant_payment_link_reference, "provn_x");
  assert.equal(body.customer.first_name, "Asha");
  assert.equal(body.customer.mobile_number, "9876543210");
});

test("client fetches a token once, then sends Bearer + Request-ID headers", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = url.endsWith("/token")
      ? { access_token: "tok", expires_at: new Date(Date.now() + 3600e3).toISOString() }
      : { payment_link_id: "pl-1", payment_link: "https://pay/x", status: "CREATED" };
    return new Response(JSON.stringify(body), { status: url.endsWith("/token") ? 200 : 201 });
  };
  const c = createPineLabsClient({
    baseUrl: "https://uat",
    clientId: "id",
    clientSecret: "s",
    fetchImpl,
  });
  await c.createPaymentLink({});
  await c.getPaymentLink("pl-1");
  assert.equal(calls.filter((x) => x.url.endsWith("/token")).length, 1);
  assert.equal(calls[1].url, "https://uat/api/pay/v1/paymentlink");
  assert.equal(calls[1].init.headers.Authorization, "Bearer tok");
  assert.ok(calls[1].init.headers["Request-ID"]);
});

test("mock end to end: link -> pay -> signed webhook -> credits granted once -> spend", async () => {
  const config = readConfig({ PINELABS_MODE: "mock", PORT: "0" });
  const { server, credits } = createApp(config);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicBaseUrl = base;
  try {
    const link = await credits.createTopup({ email: "Dev@Provn.ai", name: "Dev One", usd: 7 });
    assert.equal(link.credits, 700);
    const id = link.id;
    const pay = await fetch(`${base}/mock/checkout/${id}`, { method: "POST", redirect: "manual" });
    assert.equal(pay.status, 303);
    assert.equal(credits.balance("dev@provn.ai"), 700);
    await credits.syncLink(id); // replays must not double-grant
    await fetch(`${base}/mock/checkout/${id}`, { method: "POST", redirect: "manual" });
    assert.equal(credits.balance("dev@provn.ai"), 700);

    const s = credits.summary();
    assert.equal(s.users[0].paidUsd, 7);
    assert.equal(s.users[0].creditsGranted, 700);
    assert.equal(s.webhooks[0].verified, true);
    assert.deepEqual(s.ledger[0].walletCommand, {
      type: "topup",
      id: `pinelabs:${id}`,
      units: 7_000_000,
      paymentRef: id,
    });

    const spent = await fetch(`${base}/api/credits/spend`, {
      method: "POST",
      body: JSON.stringify({
        email: "dev@provn.ai",
        credits: 40,
        reason: "router run",
        idempotencyKey: "r1",
      }),
    }).then((r) => r.json());
    assert.equal(spent.balance, 660);
    await fetch(`${base}/api/credits/spend`, {
      method: "POST",
      body: JSON.stringify({ email: "dev@provn.ai", credits: 40, idempotencyKey: "r1" }),
    });
    assert.equal(credits.balance("dev@provn.ai"), 660);
    const tooMuch = await fetch(`${base}/api/credits/spend`, {
      method: "POST",
      body: JSON.stringify({ email: "dev@provn.ai", credits: 5000 }),
    });
    assert.equal(tooMuch.status, 402);

    const forged = await fetch(`${base}/api/webhooks/pinelabs`, {
      method: "POST",
      body: "{}",
      headers: {
        "webhook-id": "x",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,bad",
      },
    });
    assert.equal(forged.status, 401);
  } finally {
    server.close();
  }
});

test("agent runs charge credits only when completed, and need a balance", async () => {
  const config = readConfig({ PINELABS_MODE: "mock", PORT: "0", AGENT_RUN_CREDITS: "10" });
  const { server, credits } = createApp(config);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicBaseUrl = base;
  try {
    const agents = await fetch(`${base}/api/agents`).then((r) => r.json());
    assert.equal(agents.live, false);
    const id = agents.agents[0].id;
    const broke = await fetch(`${base}/api/agents/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", task: "hi" }),
    });
    assert.equal(broke.status, 402);
    const link = await credits.createTopup({ email: "a@b.co", usd: 1 });
    await fetch(`${base}/mock/checkout/${link.id}`, { method: "POST", redirect: "manual" });
    const run = await fetch(`${base}/api/agents/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", task: "portfolio summary" }),
    }).then((r) => r.json());
    assert.equal(run.status, "completed");
    assert.equal(run.charged, 10);
    assert.equal(run.balance, 90);
    assert.equal(credits.summary().runs.length, 1);
    const bad = await fetch(`${base}/api/agents/ap_processor/run`, {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co", task: "x" }),
    });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
