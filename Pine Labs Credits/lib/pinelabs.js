// Minimal Pine Labs Online (Plural v2) client: OAuth token, payment links, webhook signatures.
// Docs: https://www.pinelabs.com/docs/online-payments/api/payment-links/create-payment-link
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** Statuses Pine Labs reports for a payment link. PROCESSED means paid. */
export const PAID_STATUSES = new Set(["PROCESSED", "PAID"]);
export const OPEN_STATUSES = new Set(["CREATED", "CLICKED", "PAYMENT_INITIATED", "ACTIVE"]);

export function createPineLabsClient({ baseUrl, clientId, clientSecret, apiKey, fetchImpl = fetch }) {
  let token = null; // { value, expiresAt }

  const headers = (extra = {}) => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    "Request-ID": randomUUID(),
    "Request-Timestamp": new Date().toISOString(),
    ...extra,
  });

  async function call(path, init) {
    const res = await fetchImpl(baseUrl + path, init);
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const msg = body?.message || body?.error_message || body?.code || text.slice(0, 300);
      const err = new Error(`Pine Labs ${init.method || "GET"} ${path} -> ${res.status}: ${msg}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  async function accessToken() {
    if (apiKey && !clientId) return apiKey;
    if (token && token.expiresAt - Date.now() > 60_000) return token.value;
    const body = await call("/api/auth/v1/token", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    });
    const expiresAt = body.expires_at ? Date.parse(body.expires_at) : Date.now() + 30 * 60_000;
    token = { value: body.access_token, expiresAt };
    return token.value;
  }

  const authed = async (path, init = {}) =>
    call(path, { ...init, headers: headers({ Authorization: `Bearer ${await accessToken()}` }) });

  return {
    accessToken,
    /** Returns Pine Labs' response; the payer URL is `payment_link`. */
    createPaymentLink: (req) =>
      authed("/api/pay/v1/paymentlink", { method: "POST", body: JSON.stringify(req) }),
    getPaymentLink: (paymentLinkId) =>
      authed(`/api/pay/v1/paymentlink/${encodeURIComponent(paymentLinkId)}`, { method: "GET" }),
    cancelPaymentLink: (paymentLinkId) =>
      authed(`/api/pay/v1/paymentlink/${encodeURIComponent(paymentLinkId)}/cancel`, { method: "PUT" }),
  };
}

/** Builds the create-link request body for one credits top-up. */
export function buildPaymentLinkRequest({ reference, quote, user, callbackUrl, expiresAt }) {
  const [first, ...rest] = (user.name || user.email.split("@")[0]).trim().split(/\s+/);
  const customer = { email_id: user.email, first_name: first, last_name: rest.join(" ") || undefined };
  if (user.phone) Object.assign(customer, { mobile_number: user.phone, country_code: "91" });
  return {
    merchant_payment_link_reference: reference,
    amount: { value: quote.charge.minor, currency: quote.charge.currency },
    description: `Provn credits: ${quote.credits} credits ($${quote.usd.toFixed(2)})`,
    expire_by: expiresAt,
    callback_url: callbackUrl,
    customer,
    merchant_metadata: { provn_user: user.email, credits: String(quote.credits), usd: quote.usd.toFixed(2) },
  };
}

/**
 * Verifies a Pine Labs webhook. Signed string is `${webhook-id}.${webhook-timestamp}.${rawBody}`,
 * HMAC-SHA256 with the base64-decoded secret, base64 output, sent as "v1,<sig>" (possibly several, space separated).
 */
export function verifyWebhookSignature({ headers, rawBody, secretBase64, toleranceSec = 600, now = Date.now() }) {
  const id = headers["webhook-id"];
  const ts = headers["webhook-timestamp"];
  const sigHeader = headers["webhook-signature"] || headers["webhook_signature"];
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing webhook headers" };
  if (Math.abs(now / 1000 - Number(ts)) > toleranceSec) return { ok: false, reason: "timestamp outside tolerance" };
  const expected = signWebhook({ id, timestamp: ts, rawBody, secretBase64 });
  const exp = Buffer.from(expected);
  for (const part of String(sigHeader).split(" ")) {
    const got = Buffer.from(part.replace(/^v1,/, ""));
    if (got.length === exp.length && timingSafeEqual(got, exp)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

export function signWebhook({ id, timestamp, rawBody, secretBase64 }) {
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
}

/** Pulls the payment link id / reference out of any payment-link or order webhook shape. */
export function parseWebhookEvent(body) {
  const d = body?.data || body?.payload || body || {};
  return {
    event: body?.event || body?.event_type || "unknown",
    paymentLinkId: d.payment_link_id || d.payment_link?.payment_link_id || null,
    reference: d.merchant_payment_link_reference || d.merchant_order_reference || null,
    status: d.status || null,
    amount: d.amount || null,
    orderId: d.order_id || null,
  };
}
