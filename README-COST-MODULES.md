# PROVN Cost Guard + Estimator

Local release 0.2.0 reconciles the credit PRD with the existing phase-1 estimator, intake service and package architecture. Both estimator APIs share one calculation engine. Included: credit previews, approval above 50 credits, account allowances/top-ups, atomic run holds, provider hard caps, bounded retry attempts, platform-failure credit returns, authenticated APIs and PostgreSQL adapters.

```sh
pnpm install --frozen-lockfile
pnpm --filter @buildwise/cost-demo dev
```

Open http://127.0.0.1:3210. This is a local simulation with no real spend, no keys and no external service calls.

- [Integration guide](docs/cost-modules/INTEGRATION.md): APIs, worker/billing examples, policy decisions, phase-1 compatibility and handoff steps.
- [Verification](docs/cost-modules/VERIFICATION.md): tests, builds and unverified production boundaries.
- [Credit PRD](docs/provn-vision-prd.md): product requirements.

The team's production UI, payment verification, router/provider adapter, verified BYOK keys, deployment and hosted Supabase integration remain separate. Team pooling and cross-module fulfillment are not claimed. All authored product UI uses PROVN; internal `@buildwise` imports remain compatible.
