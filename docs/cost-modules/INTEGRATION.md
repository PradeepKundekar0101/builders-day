# Cost Guard + Estimator integration guide

Version 0.1.0. Prepared against builders-day commit `39501f2ba9e3794cc703662f71affc28db650b2a`, branch `phase-0-foundation`, on 24 October 2026.

The repository uses the name Buildwise. These packages implement the Cost Guard + Estimator work discussed as part of Conduit. They use the existing pnpm workspace, TypeScript, Zod specification, Next.js APIs, Supabase schema, and build events.

## Run the local demo

From the extracted source directory, use the repository's Node 26+ and pnpm tooling:

```sh
pnpm install --frozen-lockfile
pnpm --filter @buildwise/cost-demo dev
```

Open http://127.0.0.1:3210. No environment variables, account, Supabase instance, model key, or payment credentials are needed. The demo is a separate Next.js workspace so it can run without the foundation app's authentication setup. All spending is simulated. Its mutation API refuses production mode; use `dev`, not `start`, for demonstrations. The server listens on loopback.

1. Start with all booking features selected: approximate customer price $6.16, worker model budget $2.58.
2. Choose the $4.96 scope suggestion to defer email and the optional dashboard. The required scope remains intact. Worker budget becomes $1.98.
3. Lock the quote. The server recomputes from the fixed fixture and validates selections, rather than trusting the displayed price.
4. Run a simulated call twice. Each reserves $0.90, starts once, settles $0.65, and releases $0.25. Total spend is $1.30.
5. The third request cannot reserve $0.90 against the remaining $0.68. It pauses before spending.
6. Approve exactly $1 more. The cap becomes $2.98. Run the next call and then stop.
7. Start a new demo and try the concurrent reservations button. Two $1.50 requests compete against one budget; only an affordable number is admitted. Reservations remain held because these calls have not been settled.

The demo uses server memory, resets on restart, and is not a payment or durable accounting system. Reloading the page starts a new UI session. It does not claim that an app has been built. The fixed synthetic approver exists only in the demo API.

## What is included

| Path | Responsibility |
|---|---|
| `packages/estimator` | Pure cost calculation, catalog, revision-bound selections, optional-scope suggestions |
| `packages/cost-guard` | Atomic-store contract, reservation lifecycle, idempotent settlement, exact approval cap, worker helper |
| `apps/cost-demo` | Local interactive example using both real packages and a simulated worker |
| `apps/web/app/api/cost` | Authenticated estimate preview and owner-scoped budget status/decision routes |
| `apps/web/lib/cost/server.ts` | Server-only identity and service-role adapter |
| `supabase/migrations/20261024010000_cost_guard.sql` | Persistent state, command journal, pricing versions, RPCs, build aggregates and events |

## Estimator contract

```ts
import { estimate, defaultSelection, suggestAlternatives } from '@buildwise/estimator';
import { SpecSchema } from '@buildwise/shared';

const spec = SpecSchema.parse(storedSpec);
const specRevision = `${specRow.id}:${specRow.version}`;
const selection = defaultSelection(spec, specRevision);
const quote = estimate({ spec, specRevision, selection, pricing });
const alternatives = suggestAlternatives(
  { spec, specRevision, selection, pricing },
  5, // customer price target, USD
);
```

The result preserves `costUsd`, `lowUsd`, `highUsd`, `hours`, `modelBudgetUsd`, and `drivers`. It also includes `tokens`, `featureCosts`, `weightsVersion`, `specRevision`, `selection`, and `approximate: true`.

Selections contain `{specRevision, selectedIds}`. IDs are `page:<index>`, `entity:<name>`, `auth`, and `integration:<kind>`. Page IDs are stable only within an immutable spec revision. If any spec content or page order changes, create a new spec revision and reselect. Do not edit the stored JSON under an existing revision.

`pages` means standalone pages; do not list CRUD forms/list screens again because entity pricing already includes them. Intake must enforce this convention. Owner-scoped entities and the admin dashboard require authentication. Enabled auth and must-have features cannot be removed. Other cross-feature dependencies are not represented in the existing SpecSchema; extend the schema and catalog rules together before offering such combinations.

Defaults use the repository's provisional $6 per million blended tokens, 2x model margin, $1 deployment allowance, and +/-30% range. They are not current provider prices. Model budget excludes margin and other fees. Hours are a heuristic effort estimate, not a delivery promise. Monthly subscriptions, INR collection, refunds, and runtime service costs remain outside these packages.

Alternatives defer optional features in descending model-cost order, accumulating a valid reduced scope. They report `achievable: false` when required scope still exceeds the target. This is a deterministic heuristic, not a globally optimal product planner. Nothing applies until the user chooses it.

## Quote and payment integration

The production `POST /api/cost/estimate` endpoint accepts:

```json
{
  "specId": "a-real-spec-uuid",
  "selection": {
    "specRevision": "a-real-spec-uuid:1",
    "selectedIds": ["page:0", "auth", "entity:appointments"]
  },
  "pricingVersion": "v1"
}
```

It verifies the signed-in owner, loads stored spec and pricing, and computes a preview. It does not insert or lock a quote. Requests from the browser must carry a same-origin `Origin`; configure `NEXT_PUBLIC_SITE_URL` to the actual app origin.

The payment/quote owner must wire its existing phase-2 flow as follows:

1. Persist a draft with `selected_features = selection`, `weights_version = pricing.version`, and the estimator output mapped to existing quote columns.
2. At lock time, load the authoritative spec and pricing again and rerun the estimator. Ignore all client-supplied numeric prices.
3. Freeze spec revision, selections and pricing version. Prevent edits to locked/paid quotes through server authorization or a database constraint. This handoff does not implement the team's payment or quote-lock workflow.
4. Only the verified payment webhook creates a build with `budget_usd = model_budget_usd`. The guard will not initialize for an unpaid quote.
5. Quote revisions after lock require a new quote/payment decision. Do not overwrite a paid quote or initialize a replacement budget to erase spending.

The library leaves the repo's 10% tolerance unapproved. Its initial hard cap is exactly `builds.budget_usd`. If the team wants a 110% ceiling, explicitly disclose and authorize that amount before execution. Forecast-based early pauses are not implemented in this release; the hard before-call admission gate is.

## Database setup and production adapter

Apply the new migration after the existing foundation migration to a local or staging Supabase database. No remote migration has been applied by this handoff.

```sh
pnpm exec supabase start
pnpm exec supabase migration up --local
pnpm db:types
```

The migration adds:

- Immutable `cost_pricing_versions`, seeded with v1. Insert a new version rather than updating old prices.
- `cost_guard_accounts`, containing versioned per-build state and reservations.
- `cost_guard_journal`, containing every committed command and state version.
- `cost_guard_read` and `cost_guard_cas`, executable only by `service_role`.
- Micro-dollar precision on model budget/spend columns.

Accounts and journal have RLS enabled and no browser policies. The trusted service owns transitions. SQL adds defensive checks but does not duplicate the entire TypeScript state machine. Never expose the generic CAS RPC or raw next-state JSON through a public server endpoint. Do not give an LLM service-role credentials.

State updates use a version check under database locks. Reservation, usage, approval, build aggregates, and budget event writes commit together. Losing concurrent updates reread and recompute. A command ID must be reused when retrying an uncertain operation. Starting the same call twice is denied. Repeated identical settlement does not increase spend twice; conflicting settlement is rejected.

This version uses one JSON state row per build plus a journal. It is suited to bounded builds, not an unbounded billing ledger. Large workloads should normalize reservations/usage and add retention without losing unsettled reservations or audit history.

The server adapter uses `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the existing session client. It uses a narrow untyped RPC client until database types are regenerated. Keys stay in server-only code.

```ts
import { CostGuard, PostgresStore } from '@buildwise/cost-guard';

// serviceClient is an authenticated service-role client owned by trusted worker code.
const guard = new CostGuard(new PostgresStore(serviceClient));
const status = await guard.status(buildId);
```

The first read initializes from a paid build with zero existing usage. Existing builds with recorded usage require an explicit migration, rather than silently resetting the ledger. On approval, the new cap is recorded with actor and exact micro-dollar amount, then the paused build is requeued. Worker claim/heartbeat handling remains owned by the worker.

## Worker integration

Use integer micro-dollars: $1 = 1,000,000 micros. Keep actual provider rates separate from the estimator's blended planning rate. Compute a conservative upper bound using the known input, maximum output/reasoning tokens, cache charges, tool fees, and the provider rate version. Set provider limits accordingly. Do not reserve only the expected average.

```ts
import { runBoundedCall } from '@buildwise/cost-guard';

const result = await runBoundedCall({
  guard,
  buildId,
  callId: durableCallId, // persist before dispatch; same ID for retries
  taskId: 'entity:appointments',
  maxMicros: maximumPossibleCallCost,
  execute: async () => {
    // Configure a maximum output limit and disable unaccounted SDK retries.
    const response = await boundedProviderCall();
    return {
      value: response.output,
      actualMicros: priceActualProviderUsage(response.usage),
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      pricingVersion: providerRateVersion,
    };
  },
});
if (!result.executed) {
  // Do not call the provider. Pause this task and surface the reason.
}
```

The placeholder provider/pricing functions above are the worker team's adapter, not implemented providers. Every paid call, including repair loops and internal SDK calls, must pass through this boundary. Keep the guard active in experimental/control mode.

`runBoundedCall` reserves, starts once, invokes the provider, and reconciles. A provider exception leaves a started reservation held because it may already have incurred cost. A replacement worker reads the same state, queries the provider using its durable request ID, and reconciles confirmed usage. Never auto-release uncertain usage on timeout. Do not run a new call while pretending it is a retry of a started call.

`cancel` is allowed only before `start`. If a provider exceeds its reservation, the guard records the real spend, flags a breach, and freezes new calls. It cannot undo external charges. A hard cap depends on a genuinely bounded provider call; this handoff does not claim that arbitrary agents or tools can be capped automatically.

`stop` blocks new calls and marks the build failed, but does not cancel an already-running provider call or issue a refund. Reconcile in-flight usage after stopping. The worker must implement provider cancellation where supported.

## User-facing budget routes

- `GET /api/cost/budget/:id`: owner-scoped status.
- `POST /api/cost/budget/:id`: `{action: "approve", decisionId: UUID, newCapMicros: integer}` or `{action: "stop", decisionId: UUID}`.

The server derives the actor from authenticated claims, never from a request-supplied user ID. The supplied approval amount is an absolute new cap, not a delta. Show it explicitly before submitting. SQL verifies that the actor owns the build or is staff. The included user API permits the owner only; operator UI integration remains separate.

Subscribe to existing `build_events` with `type = 'budget'`, then refetch the authenticated status. The event includes cap, spend, pause and breach flags. Never treat browser state as spending authority. The separate demo page is a reference UI that can be adapted to these endpoints; it is not already mounted in the authenticated main application.

## Verification and team responsibilities

Run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @buildwise/cost-demo build
```

The SQL tests use embedded PostgreSQL (PGlite) with a minimal Supabase auth scaffold. They execute the actual foundation and new migrations, excluding only the Realtime publication statement. They test CAS contention, duplicate usage, restored service state, unauthorized approvers, RPC privileges, and immutable prices. They do not replace deployed Supabase/auth/payment integration tests.

The worker team must connect provider bounds, actual usage pricing, recovery and claim lifecycle. The intake team must supply immutable specifications and the standalone-page convention. The payment team owns quote locking, verified payment, extra-charge policy and refunds. The product team must approve commercial pricing and any tolerance. This module handles per-build budgets, not monthly allowances.

## Applying the handoff

The ZIP is a standalone source checkout for trying the demo. The companion `.patch` is the contribution for an existing clone. Apply it on a review branch based on the recorded upstream commit:

```sh
git switch -c integrate-cost-modules 39501f2ba9e3794cc703662f71affc28db650b2a
git apply --check /path/to/buildwise-cost-modules-v0.1.0.patch
git apply /path/to/buildwise-cost-modules-v0.1.0.patch
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
```

If the team has moved forward, merge the contribution on a separate branch and resolve changes to manifests, the lockfile, routes and migrations. Do not overwrite newer team files with the full ZIP.

To reproduce the release from a clean committed checkout, run `python3 scripts/package-cost-modules.py /absolute/output/directory`. The accompanying manifest records base commit, release commit, file sizes and SHA-256 checksums. Neither the ZIP nor patch contains Git credentials or environment files with secrets.
