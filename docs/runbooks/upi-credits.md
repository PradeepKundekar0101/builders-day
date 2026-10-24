# Buildwise QR credit purchases

## Selected flow

Buy credits → scan the owner's exact QR → pay → credits added after staff verifies receipt. ₹1 = 1 credit. No customer transaction-reference form. No payment gateway is used in this journey.

The original `IMG_6587.png` is preserved byte-for-byte at `apps/web/public/payments/owner-upi-qr.png`. CSS displays its QR region; the download returns the original screenshot. The screenshot lists different UPI IDs from the earlier typed ID, so the application uses only the supplied QR. It neither generates a replacement nor asserts the QR's decoded recipient. The QR does not prefill an amount; customers enter the selected amount in their UPI app.

## Estimate integration

The build estimate shows required credits and current balance. When insufficient, Buy credits opens `/credits` with the saved session UUID, reviewed revision and rounded-up shortfall. Purchases are ₹100 minimum and ₹10,000 maximum; the estimate explains when more than one top-up is needed. These are purchase limits, not exchange rates for model costs.

Creating a pending payment validates ownership and the current build revision. Navigation context is stored with the payment, so reloading checkout resumes it. One pending payment per account prevents duplicate requests. Returning to `/apps/build` fetches a fresh estimate for that saved version and current wallet balance. Changed or unreviewed drafts must be resolved before building. Payment never starts a build automatically. Explicit scope/charge approval and the server-side wallet reservation remain required.

## Staff verification

Staff open `/admin/payments` via the approvals page, check the actual receipt in the bank or PhonePe app, match amount and payer to the customer, and enter the verified 12-digit bank UPI reference. The checkbox and reference are required to approve. An ambiguous payer match must be resolved with the customer before approval; matching amount alone is insufficient.

Approval locks the purchase and wallet and atomically updates balance, audit journal and payment status. Repeated approval cannot add credits twice. Unique bank references prevent funding different purchases with one receipt. Browser roles cannot write these tables or execute the approval function. Existing admin/operator roles are used; no new permissions are assigned.

The customer page polls every five seconds while visible and checks again on focus. Pending purchases survive reloads. Rejected requests add no credits. Wrong-amount receipts, rejected references and refunds require an audited staff resolution; no automatic refund/reversal is implemented.

## Deployment prerequisites

Local only. Apply the existing wallet migration first, then `20261024041000_manual_upi.sql` and `20261024042000_manual_payment_build_context.sql`. The manual migrations have not been applied to production. Configure the existing Supabase service credentials securely. Verify the recipient and the authorized staff account before live activation. Production migration and deployment require explicit approval.

The previous PhonePe merchant gateway code is dormant and not used by this UI. Keep `PHONEPE_PAYMENTS_ENABLED=false`; no merchant account is needed for the selected manual flow. `20261024040000_credit_purchases.sql` belongs to that unused gateway flow.

## Verification

`pnpm --filter web test` includes actual PostgreSQL-engine tests via PGlite that apply the manual migrations to an isolated ledger. Tests cover pending purchase, receipt approval, credit balance, explicit build approval/reservation, duplicate approval, duplicate reference rollback, rejected payments, nonstaff approval, browser-role writes and duplicate pending purchases. Context/API tests verify safe return paths, amount limits and changed/inaccessible drafts.

`node apps/web/e2e/fixtures/qr-journey-preview.mjs` serves a loopback-only QA harness on port 3126. It renders the real build, checkout and admin components using simulated identities and estimate responses, and the real manual approval SQL against a separate in-memory database. It never makes a real payment or executes a build worker. Browser QA verified the 150-credit shortfall → exact QR → reload → admin receipt approval → 150-credit wallet → original build estimate → explicit build approval readiness journey.

Live Supabase authentication, phone-to-QR scanning, actual receipt matching and production worker execution still need a deployment-environment smoke test. The local tests do not prove real payment receipt.
