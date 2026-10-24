# Verification record

Date: 24 October 2026. Base: `39501f2ba9e3794cc703662f71affc28db650b2a`.

## Passed locally

- `pnpm test`: 60 tests across the workspace, including 23 added tests for these modules and routes.
- `pnpm typecheck`: all workspace packages and both Next.js applications.
- `pnpm lint`: root and main web application.
- `pnpm --filter @buildwise/cost-demo build`: static page and demo API compiled.
- `pnpm --filter web build`: existing application and new cost API routes compiled with non-secret local placeholder configuration.
- SQL migration executed in embedded PostgreSQL (PGlite), after the actual foundation migration with only the Supabase Realtime publication statement excluded.
- Database tests: persistent reservations, competing requests, re-created service reading state, duplicate usage, exact spending precision, unauthorized approver rejection, recorded approval, pricing immutability, service-only RPC privileges.
- API tests: unauthenticated and non-owner budget access rejected; actor taken from authenticated identity; invalid amount and origin rejected before execution.
- Browser inspection: optional scope reduced the estimate from $6.16 to $4.96. On the full $2.58 model budget, three calls settled $1.95 total; the fourth paused before spending. An exact $1 approval raised the cap to $3.58. A subsequent call settled total spend of $2.60. Stop disabled further execution controls. Screenshots are included.

## Environment and limits

Commands ran under the available pnpm-managed Node 24.19.0 and pnpm 11.25.0. The upstream repository requests Node 26+ and pnpm 12.4.2; retain its requested versions in the team's CI. Local tooling emitted the engine warning but the checks above passed.

The full Supabase/Docker database suite (`pnpm test:db`) and deployed authentication/payment E2E were not run. Docker was unavailable in this environment. Root `pnpm test` deliberately does not run the upstream Supabase suite; its DB script prints a reminder. PGlite exercises SQL behavior but not Supabase REST, Realtime delivery, or multiple real PostgreSQL connections.

No hosted database was changed. No actual provider, billing, payment, refund, subscription balance, or production worker was connected. No claim of measured pricing accuracy or guaranteed external-provider spending is made. The demo's layout was visually inspected at desktop width; mobile-specific device testing remains pending.

## Branding revision 0.1.1

Product-facing names and browser titles now use PROVN. The upstream @buildwise package namespace is retained for compatibility. Accounting behavior is unchanged from the tested 0.1.0 implementation.
