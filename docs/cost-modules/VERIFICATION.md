# Verification record: PROVN 0.2.0

24 October 2026. Phase-1 base: `614c94a846d474c0dd95bd063f9f6d6c5d27ec00`. Credit PRD incorporated from the foundation branch at `597bd4d55c21c66447ec68ca148bde632ef80fcf`.

## Passed locally

- `pnpm test`: 158 tests across the merged workspace. This includes 22 estimator tests, 27 guard/wallet tests and 45 main-web tests.
- `pnpm typecheck`: all packages and both Next.js applications.
- `pnpm lint`: root and web application.
- `pnpm --filter @buildwise/cost-demo build`: demo page and API compile.
- `pnpm --filter web build`: application plus estimate, provider-budget, wallet, quote preparation and run-decision APIs compile with non-secret local placeholder configuration.
- Frozen-lockfile installation validates the reconciled workspace dependency graph.
- Both estimator APIs agree on credits, model budget, tokens and hours for managed/BYOK fixtures. Executable selection validation rejects removed required features, missing auth, duplicate/unknown features and fractional counts.
- Memory-wallet tests cover threshold approval, concurrent balance holds, duplicate payment references, allowance rollover, unknown usage, attempt caps, repeated-failure pause/resume and platform refunds without double-crediting.
- PGlite executes actual foundation, phase-1 hardening, provider-guard and credit-wallet migrations. Tests verify service-only RPC privileges, immutable pricing/quotes, atomic wallet hold + build creation, competing starts, recovery, active-attempt enforcement, no legacy cap bypass, settlement blocked on unresolved provider usage, preserved expense after refunds, staff attribution and operator-review gating.
- Authenticated-route tests reject anonymous and foreign-run access, derive the owner/actor from authenticated claims, enforce origin, reject browser funding/settlement commands, recompute locked prices, verify idempotent retries and reject unverified BYOK execution.
- Browser check: 616-credit quote requires approval; starting against Builder 2,500 holds 616 and leaves 1,884 available. Two identical simulated failures pause after 130 provider-cost credits. Confirmed platform failure restores the wallet to 2,500, releases the hold and preserves the 130 expense. Free 300 cannot start the same quote. BYOK preview shows zero platform credits and preserves the provider forecast. Updated screenshots are included.

## Environment and limits

Local checks used Node 24.19.0 and pnpm 11.25.0 available in the environment. Upstream requests Node 26+ and pnpm 12.4.2; its version declarations are preserved. Local commands emitted an engine warning. Run the same checks in the team's pinned CI before merging.

Docker is unavailable. Full Supabase/auth E2E and `pnpm test:db` were not run. Root `pnpm test` deliberately skips that upstream database suite. PGlite uses minimal auth scaffolding and omits the Supabase Realtime publication statement; it does not test Supabase REST, auth sessions, Realtime delivery or independent networked PostgreSQL connections.

No hosted database, payment, subscription, real provider, BYOK key or production worker was connected. No GitHub push or merge was performed. Browser review covered desktop width, not mobile devices. Estimate accuracy remains unmeasured; +/-20% is the PRD target, while provisional displayed ranges remain +/-30%.

The production integration tasks and explicit policy choices are documented in `INTEGRATION.md`. This is a tested local module and handoff, not evidence of a completed production product.
