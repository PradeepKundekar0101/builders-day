# Phase 2 - Approval and Payment

PRD: F5, F6, S7, human approval point 2.

## Goal

A fixed, locked quote paid through Pine Labs, with a verified webhook as the only thing that can start a build.

## Flow

1. User clicks "Approve and pay" on the estimate page.
2. Server re-computes the estimate from the stored selections (never trusts client numbers), sets `quotes.status = 'locked'`, freezes `cost_usd`, `model_budget_usd`, `fx_rate`, `amount_inr`.
3. Approval screen shows: features included, USD price, INR amount charged, hours, and the line "Nothing is built until payment is confirmed."
4. Server creates a Pine Labs order for `amount_inr` with the quote id as merchant reference and stores a `payments` row (`created`).
5. User is redirected to Pine Labs hosted checkout (test mode).
6. Pine Labs webhook hits `POST /api/webhooks/pinelabs`:
   - verify signature with the secret from server env; reject otherwise;
   - idempotent on `provider_order_id`;
   - re-fetch order status from the Pine Labs API before trusting the event;
   - check amount and currency match the locked quote;
   - in one transaction: payment `paid`, quote `paid`, insert `builds` row (`queued`, `budget_usd = model_budget_usd`).
7. The return URL shows a "Payment confirmed, build starting" page that waits on the build row, never on the redirect alone.

## Provider adapter

`PaymentProvider` interface with `createOrder`, `verifyWebhook`, `fetchOrder`.
Implementations: `pinelabs` (real, test mode) and `fake` (local dev and CI, with a test-only endpoint that simulates the webhook).
Exact Pine Labs endpoints depend on the product issued at kickoff; the adapter isolates that.

## Edge cases

- Locked quote unpaid for 24 h becomes `expired`; re-locking re-computes with current weights.
- Duplicate or replayed webhook does nothing the second time.
- Failed payment returns the user to the approval screen with the message from the provider.

## Acceptance

- E2E (fake provider, CI): lock, pay, webhook, build row queued.
- E2E (Pine Labs test mode, deployed): same journey with a real test payment, visible in the Pine Labs dashboard.
- Unit: tampered signature rejected, amount mismatch rejected, duplicate webhook idempotent.
- No Pine Labs secret appears in any client bundle (grep the build output in CI).
