// Credits service: create top-up links, confirm payment with Pine Labs, grant credits exactly once.
import { randomBytes } from "node:crypto";
import { quote as priceQuote } from "./pricing.js";
import {
  OPEN_STATUSES,
  PAID_STATUSES,
  buildPaymentLinkRequest,
  parseWebhookEvent,
  verifyWebhookSignature,
} from "./pinelabs.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const now = () => new Date().toISOString();

/** The platform wallet command (packages/cost-guard WalletCommandSchema "topup") for a paid link. */
export const toWalletTopup = (link) => ({
  type: "topup",
  id: `pinelabs:${link.id}`,
  units: link.walletUnits,
  paymentRef: link.id,
});

export function createCreditsService({ store, client, config, log = () => {} }) {
  const { pricing } = config;

  function upsertUser(db, { email, name, phone }) {
    const key = email.toLowerCase();
    const u = (db.users[key] ||= { email: key, name: "", phone: "", createdAt: now() });
    if (name) u.name = name;
    if (phone) u.phone = phone;
    return u;
  }

  async function createTopup({ email, name, phone, usd }) {
    email = String(email || "").trim().toLowerCase();
    if (!EMAIL.test(email)) throw Object.assign(new Error("Enter a valid email"), { status: 400 });
    if (phone && !/^\d{10}$/.test(phone)) throw Object.assign(new Error("Phone must be 10 digits"), { status: 400 });
    let q;
    try {
      q = priceQuote(usd, pricing);
    } catch (e) {
      throw Object.assign(e, { status: 400 });
    }
    const reference = "provn_" + randomBytes(8).toString("hex");
    const expiresAt = new Date(Date.now() + config.linkExpiryHours * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
    const req = buildPaymentLinkRequest({
      reference,
      quote: q,
      user: { email, name, phone },
      callbackUrl: `${config.publicBaseUrl}/thanks?ref=${reference}`,
      expiresAt,
    });
    const res = await client.createPaymentLink(req);
    const r = res.data || res;
    return store.tx((db) => {
      upsertUser(db, { email, name, phone });
      const link = {
        id: r.payment_link_id,
        reference,
        email,
        usd: q.usd,
        credits: q.credits,
        walletUnits: q.walletUnits,
        charge: q.charge,
        rate: q.rate,
        url: r.payment_link || r.payment_link_url,
        status: r.status || "CREATED",
        orderId: r.order_id || null,
        mode: config.mode,
        expiresAt: r.expire_by || expiresAt,
        createdAt: now(),
        updatedAt: now(),
        paidAt: null,
        grantedAt: null,
        problem: null,
      };
      db.links[link.id] = link;
      log(`link ${link.id} created for ${email}: $${q.usd} -> ${q.credits} credits`);
      return link;
    });
  }

  /** Asks Pine Labs for the truth about one link and grants credits if it is paid. */
  async function syncLink(id, source = "manual") {
    const existing = store.read().links[id];
    if (!existing) throw Object.assign(new Error("Unknown payment link"), { status: 404 });
    const res = await client.getPaymentLink(id);
    const r = res.data || res;
    return store.tx((db) => {
      const link = db.links[id];
      link.status = r.status || link.status;
      link.orderId = r.order_id || link.orderId;
      link.updatedAt = now();
      if (PAID_STATUSES.has(link.status) && !link.grantedAt) {
        const paid = r.amount?.value;
        if (paid !== undefined && (Number(paid) < link.charge.minor || r.amount?.currency !== link.charge.currency)) {
          link.problem = `Amount mismatch: Pine Labs reports ${paid} ${r.amount?.currency}, expected ${link.charge.minor} ${link.charge.currency}`;
          return link;
        }
        if (!db.ledger.some((e) => e.type === "grant" && e.linkId === id)) {
          link.paidAt = link.paidAt || now();
          link.grantedAt = now();
          link.problem = null;
          db.ledger.push({
            id: `grant:${id}`,
            type: "grant",
            email: link.email,
            credits: link.credits,
            usd: link.usd,
            linkId: id,
            orderId: link.orderId,
            source,
            walletCommand: toWalletTopup(link),
            at: now(),
          });
          log(`granted ${link.credits} credits to ${link.email} (link ${id}, via ${source})`);
        }
      }
      return link;
    });
  }

  async function handleWebhook(headers, rawBody) {
    const sig = config.webhookSecret
      ? verifyWebhookSignature({ headers, rawBody, secretBase64: config.webhookSecret })
      : { ok: false, reason: "PINELABS_WEBHOOK_SECRET not set" };
    let body = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      /* recorded below */
    }
    const evt = parseWebhookEvent(body);
    store.tx((db) => {
      db.webhooks.unshift({ at: now(), id: headers["webhook-id"] || null, verified: sig.ok, reason: sig.reason || null, ...evt });
      db.webhooks.length = Math.min(db.webhooks.length, 200);
    });
    if (!sig.ok) throw Object.assign(new Error(`Webhook rejected: ${sig.reason}`), { status: 401 });
    // Never trust the payload alone: look the link up and confirm with Pine Labs.
    const db = store.read();
    const id = evt.paymentLinkId || Object.values(db.links).find((l) => l.reference === evt.reference)?.id;
    if (!id || !db.links[id]) return { ignored: true, event: evt.event };
    return syncLink(id, "webhook");
  }

  /** Polls every open link so credits land even without a public webhook URL. */
  async function reconcileOpen() {
    const open = Object.values(store.read().links).filter((l) => OPEN_STATUSES.has(l.status));
    for (const l of open) {
      try {
        await syncLink(l.id, "poll");
      } catch (e) {
        log(`poll ${l.id} failed: ${e.message}`);
      }
    }
    return open.length;
  }

  /** Debit credits (e.g. from Smart Router usage). Idempotent per key. */
  function spend({ email, credits, reason = "usage", idempotencyKey }) {
    email = String(email || "").toLowerCase();
    credits = Number(credits);
    if (!Number.isInteger(credits) || credits <= 0) throw Object.assign(new Error("credits must be a positive integer"), { status: 400 });
    return store.tx((db) => {
      const key = idempotencyKey ? `spend:${idempotencyKey}` : `spend:${randomBytes(8).toString("hex")}`;
      const prior = db.ledger.find((e) => e.id === key);
      if (prior) return { entry: prior, balance: balanceOf(db, email) };
      const bal = balanceOf(db, email);
      if (bal < credits) throw Object.assign(new Error(`Insufficient credits: balance ${bal}, need ${credits}`), { status: 402 });
      const entry = { id: key, type: "spend", email, credits, reason, at: now() };
      db.ledger.push(entry);
      return { entry, balance: bal - credits };
    });
  }

  function balanceOf(db, email) {
    return db.ledger
      .filter((e) => e.email === email)
      .reduce((s, e) => s + (e.type === "grant" ? e.credits : -e.credits), 0);
  }

  function summary() {
    const db = store.read();
    const users = Object.values(db.users).map((u) => {
      const links = Object.values(db.links).filter((l) => l.email === u.email);
      const paid = links.filter((l) => l.grantedAt);
      const grants = db.ledger.filter((e) => e.email === u.email && e.type === "grant");
      const spends = db.ledger.filter((e) => e.email === u.email && e.type === "spend");
      const chargedByCurrency = {};
      for (const l of paid) chargedByCurrency[l.charge.currency] = (chargedByCurrency[l.charge.currency] || 0) + l.charge.minor;
      return {
        ...u,
        links: links.length,
        paidLinks: paid.length,
        openLinks: links.filter((l) => OPEN_STATUSES.has(l.status)).length,
        paidUsd: Math.round(paid.reduce((s, l) => s + l.usd, 0) * 100) / 100,
        chargedByCurrency,
        creditsGranted: grants.reduce((s, e) => s + e.credits, 0),
        creditsSpent: spends.reduce((s, e) => s + e.credits, 0),
        balance: balanceOf(db, u.email),
        lastPaidAt: paid.map((l) => l.paidAt).sort().pop() || null,
      };
    });
    const links = Object.values(db.links).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      mode: config.mode,
      pricing,
      totals: {
        users: users.length,
        payingUsers: users.filter((u) => u.paidLinks).length,
        paidUsd: Math.round(users.reduce((s, u) => s + u.paidUsd, 0) * 100) / 100,
        creditsGranted: users.reduce((s, u) => s + u.creditsGranted, 0),
        openLinks: links.filter((l) => OPEN_STATUSES.has(l.status)).length,
      },
      users: users.sort((a, b) => b.paidUsd - a.paidUsd || a.email.localeCompare(b.email)),
      links,
      ledger: [...db.ledger].reverse().slice(0, 200),
      webhooks: db.webhooks.slice(0, 50),
    };
  }

  return { createTopup, syncLink, handleWebhook, reconcileOpen, spend, summary, balance: (e) => balanceOf(store.read(), String(e).toLowerCase()) };
}
