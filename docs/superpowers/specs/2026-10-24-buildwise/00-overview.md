# Buildwise - Phase Plan Overview

Source: "PRD - Buildwise: AI builder that prices before it builds" (Oct 24, 2026).
This folder splits the PRD into phases that are each shippable and testable on their own.
Each phase file is a spec a builder can plan and implement from.

## Intent

A founder types an idea, gets a dollar and hour quote in under 60 seconds, approves and pays a fixed price, and receives a deployed app whose URL is released only after a security audit passes.
Nothing is built before payment, and the build cannot silently overspend the quote.

## Phases

| Phase | Name | PRD items | Exit test (E2E) |
|-------|------|-----------|-----------------|
| 0 | Foundation | Repo, auth part of F1, S7, data model, deploy pipeline | A user signs up on the live Buildwise URL and lands on an empty "My apps" page |
| 1 | Intake and Estimator | F1, F2, F3, F4, F16, operator approval | Idea submitted, intake agent asks questions, estimate with live toggles shown in under 60 s, share link works |
| 2 | Approval and Payment | F5, F6, S7 | User locks a quote, pays in Pine Labs test mode, verified webhook marks it paid and queues a build |
| 3 | Build Harness | F7, F8, F9, F10, S2, S3, S4 | A paid quote produces a working app in a local workspace, with live logs and a budget pause at 110 % |
| 4 | Deploy | F11, S6 | The built app is live on Vercel against its own Supabase project |
| 5 | Audit and Release | F12, F13, S1, S2, S5, S8 | Audit runs, fixes loop back to the build, URL released on pass or explicit override |
| 6 | Dashboard, Metrics and Ops | F14, F15, A/B protocol, follow-up agent | Quoted vs actual per build, admin queue, A/B table from raw runs |
| 7 | Launch | Track deliverables | Volunteer run recorded, video, posts, submission |

P0 demo path = Phases 0 to 4 plus the minimum of Phase 5 (RLS and service-key checks).
The PRD wants this by 2 PM.

## Dependency graph

```
0 Foundation
 ├─> 1 Intake + Estimator ─> 2 Approval + Payment ─┐
 └─> 3 Build Harness (can start in parallel, driven by a fixture spec) ─┴─> 4 Deploy ─> 5 Audit ─> 6 Dashboard/Ops
7 Launch runs alongside from Phase 1 onward (QR code once estimates work).
```

Phase 3 does not need Phase 2 to start: the worker can be developed against a hand-written spec fixture and a fake "paid" row.
That is the main parallelism available to a team of 3 to 4.

## Repo layout (builder's call, recorded here)

```
apps/web          Next.js (App Router, TypeScript, Tailwind) - UI and API route handlers
apps/worker       Long-running Node service - build harness, deploy, audit
packages/shared   Zod spec schema, DB types, constants
packages/estimator  Pure estimator function + feature table
packages/masker   PII and secret masker
templates/generated-app  The one Next.js + Supabase template every generated app starts from
supabase/migrations      Buildwise's own schema
e2e/              Playwright journey tests
```

Tooling: pnpm workspaces, TypeScript strict, ESLint, Prettier, Vitest for units, Playwright for E2E, GitHub Actions running lint, typecheck and tests on every push.

## Cross-cutting decisions

These were not settled by the PRD; each is marked as a builder's call and can be overridden.

1. **API lives in Next.js route handlers**, not a separate Node server.
   The PRD says "Node API"; route handlers are Node and save a deploy.
   The build worker is the only separate service, because Agent SDK runs last minutes and do not fit serverless timeouts.
2. **Worker hosting:** Railway or Fly.io (one always-on container).
   A teammate's laptop is the fallback for the day.
3. **Job queue:** the `builds` table itself, claimed with `FOR UPDATE SKIP LOCKED` through a Postgres function.
   No Redis, no extra infra.
4. **Live logs:** worker inserts `build_events` rows; the browser subscribes with Supabase Realtime, scoped by RLS.
5. **Currency:** estimator shows USD; checkout charges INR at a fixed FX rate stored on the quote (`fx_rate`, default 84.0, config).
   Both amounts are shown on the approval screen.
6. **CDN for generated apps:** Vercel via API token (PRD open question).
7. **Supabase project per generated app:** created through the Management API.
   Project creation is slow and plan-limited, so a pool of pre-created projects is provisioned at the start of the day and assigned on deploy (see Phase 4).
8. **Model:** the harness model id is config, default `claude-sonnet-5-5`.
   The estimator keeps the PRD's blended $6 per 1M tokens, labelled approximate.
9. **Harness budget = pre-margin model cost of the quote** (the `sum(w_i * t_i * p)` part).
   The full quote includes a 2x margin; capping at the full quote would let a build eat the margin.
   The harness pauses when projected spend exceeds this budget by more than 10 %.
10. **AgenticOrg integration is behind an adapter** with two modes: outbound webhook (preferred) and polling (fallback), because the PRD leaves this open.

## Open questions carried from the PRD

- Which Pine Labs product and test credentials are issued at kickoff (blocks Phase 2).
- Does AgenticOrg support outbound webhooks and tool calls to our API, or do we poll (affects Phase 1 adapter mode only).
- Who plays operator for flagged specs (needs one account with `role = 'operator'`).

## Definition of done for every phase

- Lint, typecheck and all tests green in CI.
- The phase's E2E exit test passes against the deployed environment, not only locally.
- UI checked at desktop and phone width; nothing visibly off.
- Every new table has RLS on with owner-scoped policies.
