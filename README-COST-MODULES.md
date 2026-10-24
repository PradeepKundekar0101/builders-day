# PROVN Cost Guard + Estimator

Local integration handoff, version 0.1.1.

Start here:

```sh
pnpm install --frozen-lockfile
pnpm --filter @buildwise/cost-demo dev
```

Open http://127.0.0.1:3210. The demo needs no keys and spends no real credits.

- [Integration guide](docs/cost-modules/INTEGRATION.md)
- [Verification record](docs/cost-modules/VERIFICATION.md)
- [Estimator](packages/estimator/src/index.ts)
- [Cost Guard](packages/cost-guard/src/index.ts)
- [Database migration](supabase/migrations/20261024010000_cost_guard.sql)

Built on upstream `39501f2ba9e3794cc703662f71affc28db650b2a`. The ZIP includes the complete source workspace and lockfile, without installed dependencies, credentials, build outputs, or Git history. A separate patch contains only this contribution for applying to the team's repository.

The estimator uses provisional repository pricing. Real model execution, payment, quote locking, and monthly credits are not connected. See the integration guide for the exact boundaries and teammate-owned connection points.
