# Phase 3 - Build Harness

PRD: F7, F8, F9, F10, S2, S3, S4, human approval point 3.
The PRD's highest risk: a harness that cannot reliably produce a working app.
The mitigation is structural: the harness fills one template, it never free-builds.

## Goal

From a paid quote's locked spec, the worker produces a working Next.js + Supabase app in a workspace, streams logs live, and never passes 110 % of the budget without a human saying yes.

## Worker loop (`apps/worker`)

1. Claim one `queued` build with `claim_next_build()` (`FOR UPDATE SKIP LOCKED`), heartbeat every 15 s; a build with a stale heartbeat goes back to `queued`.
2. Copy `templates/generated-app` into `/work/<build_id>`, `git init`, commit.
3. Mask the spec and sample data (below).
4. Run the Agent SDK session with the build prompt, the spec, and the template conventions.
5. After the agent finishes: `pnpm install`, `pnpm typecheck`, `pnpm build`, and run generated migrations against a throwaway local Postgres.
   Failures are fed back to the same session, up to 3 retries, each counted in `builds.retries`.
6. Hand off to Phase 4 (deploy).

## Template (`templates/generated-app`)

- Next.js App Router, Tailwind, Supabase SSR auth already wired (email + Google).
- Security headers already set in `next.config` (S6).
- Only the anon key referenced in client code; a lint rule forbids `SUPABASE_SERVICE_ROLE` anywhere under `app/` and `components/` (S2).
- Conventions the agent must follow, in `BUILDWISE.md` inside the template:
  - one migration per entity with `user_id uuid references auth.users`, RLS enabled, select/insert/update/delete policies on `auth.uid() = user_id` (S1);
  - writes only through server actions that check the session (S5);
  - one list page and one form page per entity, from the provided example.
- An example entity is included so the agent copies a working pattern.

## Agent SDK session

- Tools: file read, write and edit inside the workspace only; bash restricted to `pnpm` scripts in the workspace; no network except the package registry.
- Model id from config.
- System prompt includes `BUILDWISE.md`, the spec, and the file tree.

### Context management (F10)

- In context: spec, file tree, `BUILDWISE.md`, diffs of the last N edits.
- Full files only when the agent asks for them through the read tool.
- Tokens in context per turn logged as a `build_events` row (`type = 'telemetry'`) for Phase 6.

### Budget cap (F8)

- After every model turn: `spent_usd` = cumulative usage times list price, written to `builds`.
- Projection = `spent_usd` + estimated remaining (average cost per turn times remaining checklist items from the spec).
- If projection > 1.10 x `budget_usd`: stop the session cleanly, set `paused_budget`, create an `approvals` row (`budget_overrun`), show the user the projected overrun and two buttons: "Continue up to $X" or "Stop and refund".
  Refund is handled manually for the day; the button records the decision.
- Hard stop at the approved amount; there is no path that spends without a recorded decision.

### Live log (F7)

Worker writes `build_events`: `step` (human-readable), `file_changed`, `command`, `error`, `telemetry`, `budget`.
The build page subscribes via Realtime and shows steps, a progress bar from the spec checklist, and spend vs budget.
Raw model output is not shown; steps are.

## Masker (`packages/masker`, S3, S4, F9)

- Detects: emails, phone numbers (Indian and international), card-like numbers (Luhn), Aadhaar-like 12-digit numbers (Verhoeff), API keys and tokens (known prefixes such as `sk-`, `AKIA`, `ghp_`, `xox`, JWTs, and high-entropy `key=value` pairs).
- Replaces each with a stable placeholder (`{{PII_EMAIL_1}}`, `{{SECRET_1}}`).
- The placeholder map is stored encrypted, server-side, keyed by build.
- Restored only when writing the generated app's seed file at deploy; never in model context, never in logs.
- Also applied to idea text before it reaches AgenticOrg (Phase 1).

## Control mode (for the A/B protocol)

`builds.mode = 'control'` turns off context management (whole files in context), budget cap and masker, and lets the agent work outside the template conventions.
Same worker, same telemetry, so Phase 6 can compare raw numbers.

## Acceptance

- Run against 3 fixture specs (static site; auth + 3 entities; with payments): each produces an app that typechecks, builds, and whose migrations apply with RLS on every table.
- A forced low budget triggers the pause, the approval row, and the user prompt; the session stops spending.
- Masker unit tests cover each detector, including false-positive checks on ordinary numbers.
- Killing the worker mid-build leads to the build being re-claimed after heartbeat timeout.
