# Provn Credits · Pine Labs top-ups

Users buy Provn credits through a Pine Labs payment link. **$1 = 100 credits**, pay-as-you-go, **$1 minimum**.
This folder is a zero-dependency Node app (Node 20+) with a local admin console that shows, for every user,
what they paid and how many credits they were granted.

```bash
cd "Pine Labs Credits"
npm run mock          # no keys needed: fake checkout, full flow, http://localhost:4600
cp .env.example .env  # then fill PINELABS_CLIENT_ID / PINELABS_CLIENT_SECRET
npm start             # Pine Labs UAT (sandbox) by default
npm test
```

## How a top-up works

```
Console / platform        This server                         Pine Labs
------------------        -----------                         ---------
"Asha, $5"  ───────────►  quote: 500 credits, ₹440 (paise)
                          POST /api/auth/v1/token  ─────────►  access_token (cached until expires_at)
                          POST /api/pay/v1/paymentlink ─────►  payment_link_id + payment_link URL
           ◄───────────   link URL (send it to Asha)
                                                              Asha pays on Pine Labs' page
                          /thanks?ref=…  ◄──────────────────  redirect (callback_url)
                          /api/webhooks/pinelabs ◄──────────  signed webhook (if reachable)
                          GET /api/pay/v1/paymentlink/{id} ─►  status PROCESSED  (source of truth)
                          grant 500 credits, once per link
```

Credits are granted only after this server asks Pine Labs directly and gets `PROCESSED` with the expected
amount and currency. A webhook or redirect only triggers that check, so a forged callback can't mint credits.
Grants are keyed by `payment_link_id`, so retries, duplicate webhooks and the 20-second poller never double-grant.

Webhooks need a public URL. Locally you can skip them: open links are polled every 20 seconds, and the payer's
redirect to `/thanks` triggers an immediate check. To test webhooks, run a tunnel
(`cloudflared tunnel --url http://localhost:4600`), set `PUBLIC_BASE_URL` to the tunnel URL, set `ADMIN_TOKEN`,
and register `<PUBLIC_BASE_URL>/api/webhooks/pinelabs` in the Pine Labs dashboard.

## Currency

Pine Labs merchants settle in INR, so the payer is charged `usd × USD_TO_INR` in paise (default ₹88 per $1;
set the rate you want in `.env`). Credits are always computed from the USD amount. If your merchant account
is enabled for USD (international/MCC), set `CHARGE_CURRENCY=USD`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/topups` `{email, name?, phone?, usd}` | admin | Create a payment link |
| GET | `/api/summary` | admin | Per-user totals, links, ledger, webhook log |
| POST | `/api/links/:id/sync` | admin | Ask Pine Labs for status now; grants if paid |
| POST | `/api/reconcile` | admin | Re-check every open link |
| GET | `/api/users/:email/balance` | admin | Credit balance |
| POST | `/api/credits/spend` `{email, credits, reason, idempotencyKey}` | admin | Debit credits (402 if short) |
| POST | `/api/webhooks/pinelabs` | signature | Pine Labs webhook |
| GET | `/thanks?ref=` | public | Payer landing page |

"admin" means `Authorization: Bearer $ADMIN_TOKEN` when `ADMIN_TOKEN` is set.

## Integrating into the platform

The pieces are separated so they can be lifted into `apps/web` without this server:

- `lib/pricing.js` is pure: `quote(usd, pricing)` gives credits, the charge in minor units and `walletUnits`.
- `lib/pinelabs.js` is the Pine Labs client (token caching, create/get/cancel link) plus
  `verifyWebhookSignature` (HMAC-SHA256 over `webhook-id.webhook-timestamp.body`, base64-decoded secret).
- `lib/credits.js` is the service. It takes a `store` and a `client`, so a Supabase store can replace
  `lib/store.js` (JSON file) without touching the logic.

Every grant also records `walletCommand`, which is exactly the `topup` command of the credit wallet in
`packages/cost-guard` (PR #3): `{ type: "topup", id: "pinelabs:<linkId>", units, paymentRef: <linkId> }`.
Units there are $0.000001, so $1 = 1,000,000 units = 100 credits, matching this pricing. In the platform,
`syncLink` should apply that command to the user's wallet instead of appending to the local ledger,
and `/api/credits/spend` becomes the wallet's own debit path (Smart Router would call that).

Suggested route mapping for Next.js: `app/api/credits/topups/route.ts` → `createTopup`,
`app/api/webhooks/pinelabs/route.ts` → `handleWebhook` (read the raw body with `await req.text()` before
parsing), and a cron or queue job → `reconcileOpen`.

## Pine Labs references

- Create payment link: https://www.pinelabs.com/docs/online-payments/api/payment-links/create-payment-link
- Generate token: https://www.pinelabs.com/docs/online-payments/api/authentication/generate-token
- After payment / statuses: https://www.pinelabs.com/docs/online-payments/payment-links/post-payment
- Webhook signatures: https://www.pinelabs.com/docs/online-payments/developer-tools/webhooks/signature-verification

UAT base URL is `https://pluraluat.v2.pinepg.in`. For live, set `PINELABS_BASE_URL` to the production URL
Pine Labs gives you at go-live; the app refuses to start in live mode without it.
