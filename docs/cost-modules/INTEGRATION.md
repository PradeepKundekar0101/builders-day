# PROVN Cost Guard + Estimator: credit integration

Version 0.2.0, 24 October 2026. Reconciled locally with `phase-1-intake-estimator` at `614c94a846d474c0dd95bd063f9f6d6c5d27ec00` and the credit PRD merged into `phase-0-foundation` at `597bd4d55c21c66447ec68ca148bde632ef80fcf`. The internal `@buildwise` namespace is retained for compatibility. The vision PRD takes precedence over older dollar/payment flow documents.

## Run the demo

Use the repository's requested Node 26+ and pnpm 12.4.2:

```sh
pnpm install --frozen-lockfile
pnpm --filter @buildwise/cost-demo dev
```

Open http://127.0.0.1:3210. No keys, payment account, Supabase or model calls are needed. All balances, attempts, evidence and refunds are simulated. The mutation API refuses production mode and the dev server binds to loopback. Demo state resets on server restart; New demo creates a separate simulated account.

Try these flows:

1. Managed + Builder: full scope is 616 credits, estimated 430k tokens and 5.75 effort hours. Lock, then explicitly approve 616 credits and start. Available balance goes from 2,500 to 1,884; 616 credits are held.
2. Simulate the same failure twice. Each attempt uses 65 provider-cost credits. The second identical failure pauses the run. A third attempt cannot start without explicit bounded resume approval.
3. Confirm platform failure. The 616 held credits return; provider expense remains 130 credits. These are separate ledgers.
4. New demo: run a successful attempt, complete and charge the quote, then simulate a staff refund. Refunds cannot credit the charge twice.
5. Free plan: a 616-credit quote cannot start against 300 credits, even after approval.
6. Change the customer target to 500 credits. The suggested 496-credit scope defers email and the optional dashboard, preserving required features.
7. BYOK: preview shows no platform model/setup charge, with provider-cost forecast still visible. Local execution is simulated only. The authenticated production route rejects BYOK until verified key ownership is integrated.

## Reconciliation with phase 1

There is one arithmetic engine in `packages/estimator/src/pricing.ts`. Feature defaults derive from phase 1's `FEATURES_V1`. Both APIs remain available:

```ts
import {
  estimate, defaultSelection, validatedInputFromSelection,
  estimateSpec, defaultSpecSelection, suggestAlternatives,
} from '@buildwise/estimator';

// Existing phase-1 count/name interface:
const names = defaultSelection(spec);
const legacy = estimate(validatedInputFromSelection(spec, names));

// Revision-bound interface for executable credit quotes:
const specRevision = `${specRow.id}:${specRow.version}`;
const selection = defaultSpecSelection(spec, specRevision);
const quote = estimateSpec({ spec, specRevision, selection, pricing });
const alternatives = suggestAlternatives(
  { spec, specRevision, selection, pricing },
  targetCredits / 100, // backwards-compatible helper takes USD
);
```

`estimate` preserves phase-1 return fields and adds credits. Our previous `estimate(specInput)` API is now `estimateSpec`; previous revision-based `defaultSelection` is now `defaultSpecSelection`. All included callers are updated. Phase-1 `inputFromSelection` remains permissive for source compatibility; server quote creation uses `validatedInputFromSelection`, which rejects unknown/duplicate selections, missing required features and missing auth dependencies. Intake tests now verify optional scope removal while retaining required scope.

Both APIs return `costCredits`, `lowCredits`, `highCredits`, `modelBudgetCredits`, `requiresApproval`, `billingMode`, tokens and effort hours. Existing USD fields remain for compatible database storage. One credit = $0.01. `requiresApproval` on a preview uses the default 50-credit threshold; the wallet's locked run is authoritative for an account-specific threshold.

Revision selections use `page:<index>`, `entity:<name>`, `auth`, `integration:<kind>`. Create a new spec revision for any content/order change. Standalone pages must exclude CRUD forms/lists already priced within entities. Required features and enabled auth stay included. Entity and admin-dashboard selections require auth.

Pricing remains provisional: $6 per million blended tokens, 2x model margin, $1 setup allowance, +/-30% range. These are planning assumptions, not current provider rates. The PRD's +/-20% accuracy is a target that requires real usage calibration, not a verified result. Hours represent heuristic effort, not elapsed runtime or a delivery promise. BYOK preview treats platform model and setup work as plan-covered; explicit third-party integration fees remain separate. No plan/model entitlement enforcement is claimed here.

## Two ledgers

| Ledger | Purpose | Enforcement |
|---|---|---|
| Credit wallet | Customer allowances, top-ups, quoted holds, charges, refunds | Atomic account CAS, explicit approval above threshold, available-balance check |
| Provider guard | Actual model expense and pending usage | Reserve conservative maximum before dispatch, start once, settle actual usage, stop on breach |

One integer unit = one micro-dollar = 0.0001 credit. Use `creditsToUnits`, `unitsToCredits` and `usdToMicros`; do not calculate balances with floating-point additions. A refund never reduces provider spend or original charged history.

Monthly allowances are Free 300, Builder 2,500, Pro 7,000. Top-ups require at least 100 credits and a unique verified payment reference. No money is collected by the package. Allowances use a trusted, monotonic `YYYY-MM` period and a stable command ID.

Policy choices where the PRD is silent: unused monthly credits do not roll over; paid top-ups remain available. Existing holds keep their original period. Unused old-period allowance expires on ordinary settlement, while confirmed platform-failure compensation is returned as durable paid credits. Plan changes within an already-granted month are not automatically prorated. Team pooling and custom plans need a team identity/entitlement adapter. These choices are explicit and can be revised before launch.

## Database and authenticated API

Apply migrations in order to a local/staging Supabase database, then regenerate types:

```sh
pnpm exec supabase start
pnpm exec supabase migration up --local
pnpm db:types
```

No hosted migration has been run by this handoff. The new migrations add immutable pricing, per-build provider accounts/journals, credit wallet accounts/journals, service-role RPCs, micro-dollar precision, and quote billing mode/revision. Locked credit quotes cannot change their numeric/scope snapshot. The existing foundation and phase-1 hardening migrations are preserved.

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL`. The service client remains server-only. Public mutations require same-origin requests and authenticated identity. The request cannot choose its wallet owner or approver.

| Endpoint | Body / behavior |
|---|---|
| `POST /api/cost/estimate` | `{specId, selection, pricingVersion: "v1", billingMode: "managed"}`; recomputed preview; BYOK previews supported |
| `GET /api/cost/wallet` | Current owner's balance, holds, charges, refunds and runs |
| `POST /api/cost/wallet` | `{decisionId: UUID, thresholdCredits: 50}`; applies to future quotes |
| `POST /api/cost/wallet/runs` | `{runId: UUID, specId, selection, pricingVersion: "v1", billingMode: "managed"}`; immutable locked quote + wallet run |
| `POST /api/cost/wallet/runs/:id` | `{action: "approve", decisionId: UUID, capCredits: 616}`, `{action: "start", decisionId: UUID}`, or `{action: "resume", decisionId: UUID, extraAttempts: 1}` |
| `GET /api/cost/budget/:buildId` | Owner-scoped provider ledger |
| `POST /api/cost/budget/:buildId` | Legacy exact cap approval or stop; cap increases on wallet-funded runs are rejected and require a new quote |

Quote creation recomputes from the owner's stored spec and immutable pricing. Operator-pending/rejected specs are blocked. Retrying a run UUID must match the same quote exactly. A failed preparation may leave an inert locked quote, but no funds move until start. Approval must match the locked cap exactly. Start atomically reserves credits and inserts the existing `builds` row using the quote's provider budget. Concurrent retries cannot create another funded build for that quote. No new user-supplied price is trusted.

The authenticated BYOK execution path deliberately refuses to start until the router verifies a provider credential belongs to the account and routes every call through that credential. A client `billingMode` flag cannot authorize platform-funded calls for free.

These endpoints are ready for the team's authenticated UI to call; that UI is not mounted by this module. The standalone demo is the visual reference. No browser endpoint accepts top-ups, monthly grants, actual usage, settlement or refunds.

## Trusted billing and worker integration

```ts
import {
  CreditWallet, PostgresWalletStore, CostGuard, PostgresStore,
  creditsToUnits, runCreditAttempt, runBoundedCall,
} from '@buildwise/cost-guard';

const wallet = new CreditWallet(new PostgresWalletStore(serviceClient));
const guard = new CostGuard(new PostgresStore(serviceClient));

// ONLY after billing verifies payment signature, recipient, currency, amount,
// event identity and settlement. Persist a stable ID; never trust browser totals.
await wallet.execute(accountId, {
  type: 'topup', id: verifiedEventId, paymentRef: verifiedPaymentId,
  units: creditsToUnits(verifiedPurchasedCredits),
});
// On verified entitlement provisioning / monthly renewal:
await wallet.execute(accountId, {
  type: 'allowance', id: renewalEventId, plan: 'builder', period: '2026-10',
});

// The existing worker claims the queued build. One attempt is an entire
// generation/repair cycle, not each individual model call.
const attempt = await runCreditAttempt({
  wallet, accountId, runId: buildId, attemptId: durableAttemptId,
  execute: async () => {
    const call = await runBoundedCall({
      guard, buildId, callId: durableProviderCallId, taskId: 'generation',
      maxMicros: conservativeProviderMaximum,
      execute: async () => {
        const response = await boundedProviderCall();
        return {
          value: response.output,
          actualMicros: priceActualUsage(response.usage),
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          pricingVersion: providerRateVersion,
        };
      },
    });
    if (!call.executed) return {
      value: null, success: false, failureFingerprint: 'provider-budget',
    };
    // Normalize errors so the same failure has the same stable fingerprint.
    return { value: call.value, success: true };
  },
});
```

The named billing/provider values above are integration inputs, not implemented Pine Labs or model clients. Their owners must supply verified events and actual usage. Disable SDK retries that escape the guard. Bound input, maximum output/reasoning tokens, cache charges and tool fees with versioned provider prices. Every paid call must pass the guard, including repair, security and routing calls.

The loop breaker admits one attempt at a time, defaults to three attempts, and pauses after two consecutive identical failure fingerprints. Owner resume grants one to three extra attempts within the existing caps. It does not add credits or increase the provider budget. SQL checks an active funded attempt before reserve/start, so bypassing the helper does not bypass the run gate. The SQL adapter also blocks legacy cap increases on wallet-funded runs.

A thrown exception leaves an attempt and provider reservation unresolved because cost may already have been incurred. Recover using the durable provider request ID, reconcile confirmed usage, then report the attempt through `wallet.execute({type: 'reportAttempt', ...})`. Never retry dispatch with the same started call ID or release uncertain usage on timeout. An unknown failure pauses for review and retains the hold. SQL blocks customer settlement until all provider reservations are settled or cancelled before start.

Trusted completion charges an amount no greater than the approved cap:

```ts
await wallet.execute(accountId, {
  type: 'finish', id: settlementId, runId: buildId,
  outcome: 'success', chargeUnits: approvedChargeUnits,
});
// Confirmed platform-caused failure before charge returns the held balance:
await wallet.execute(accountId, {
  type: 'finish', id: failureDecisionId, runId: buildId,
  outcome: 'platform_failure', chargeUnits: 0, evidenceRef: incidentReference,
});
// A confirmed fault after charging needs attributable staff review:
await wallet.execute(accountId, {
  type: 'refund', id: refundDecisionId, runId: buildId, cause: 'platform',
  evidenceRef: incidentReference, actorId: verifiedStaffId,
});
```

Choose one settlement outcome, not both examples for the same active run. Staff refunds return only the unrefunded charge; repeated payment references and repeated command IDs cannot create duplicate credits. Customer cancellation can charge only a trusted reconciled amount within the cap. Deployment/release success remains owned by the worker; wallet settlement does not prove a working app was published. Stopping the provider guard does not cancel an already-dispatched call or automatically refund credits.

## Operational boundaries

The wallet supports category tags `build`, `security`, `guild`, and `domain` in one account. Only build quote preparation is wired to the web routes; the other modules must supply their own verified prices, fulfillment and trusted settlement adapters. Guild payouts, domain buying, pooled team accounts, subscription collection and Free-plan model restrictions are not implemented here.

SQL runs behind a service-role-only boundary and trusts the TypeScript transition engine. Never expose raw CAS state or generic commands to a browser/LLM. Wallet operations serialize by account; provider operations use the same account-then-build lock order as settlement. Journals retain command IDs and evidence references. Production scaling should normalize the growing JSON run/receipt arrays and add retention/recovery without losing idempotency or open holds.

The main app's actual auth/Supabase REST, Realtime, billing callbacks, router keys and worker claim/recovery lifecycle still require team staging integration. The module does not claim production readiness or measured estimate accuracy.

## Apply and verify

The ZIP is a standalone source checkout. The patch is specifically based on phase 1, not the old foundation branch. Do not replace newer team files with the ZIP.

```sh
git switch -c integrate-provn-credits 614c94a846d474c0dd95bd063f9f6d6c5d27ec00
git apply --check /path/to/provn-cost-modules-v0.2.0.patch
git apply /path/to/provn-cost-modules-v0.2.0.patch
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @buildwise/cost-demo build
```

Review the integration diff, then merge through the team's normal GitHub process once write access is available. The local branch includes the upstream phase-1 history and new PRD. No push or hosted change was made.

See `VERIFICATION.md` for exact checks and environment limits. Repackage a clean committed checkout with `python3 scripts/package-cost-modules.py /absolute/output/directory`; the versioned manifest records base/release commits and SHA-256 hashes.
