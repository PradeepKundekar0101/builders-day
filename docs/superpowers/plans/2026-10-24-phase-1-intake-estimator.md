# Phase 1 Intake and Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Idea in plain words to a priced estimate with live feature toggles in under 60 seconds, with an intake agent asking up to 4 questions, operator review for flagged specs, and a shareable estimate link.

**Architecture:** Pure packages (`@buildwise/estimator`, `@buildwise/masker`, flag rules in `@buildwise/shared`) run identically on client and server.
The web app gets server-only route handlers: user actions (submit idea, answer, save toggles) and agent tool endpoints behind a bearer token.
The intake agent talks only to the tool endpoints, so AgenticOrg and the local Claude runner are interchangeable.

**Tech Stack:** as Phase 0, plus the Anthropic SDK for the local intake runner.

**Spec:** `docs/superpowers/specs/2026-10-24-buildwise/02-phase-1-intake-estimator.md`.

## Global Constraints

- Idea text 50 to 2,000 chars; masked before it is stored or sent to any agent.
- Estimator constants v1: `p = 6 / 1_000_000` USD per token, `m = 2.0`, `d = 1`, `w = 1.0`, `c_j = 0`, range +/- 30 %.
- Anchor: 2 pages + auth + 3 entities + payment = 330,000 tokens, model $1.98, cost $4.96, low $3.47, high $6.45, 4.25 h.
- Toggle recompute is synchronous, no network, under 300 ms.
- "Approximate" is shown next to every price.
- At most 4 agent questions per idea; the server enforces it.
- Flag when: Pine Labs payment present, third-party personal data present, or default estimate above $25.
- Agent endpoints require `Authorization: Bearer $AGENT_API_TOKEN`; user endpoints require a session and act only on the caller's rows.
- Writes use the service role on the server only.

## Review Focus

1. Toggling every feature off still renders a valid price (deploy cost only), never NaN.
2. A user cannot read or answer another user's idea through the API by guessing ids.
3. The agent asking a 5th question gets 409, and the UI never shows more than 4.
4. Masker never masks ordinary numbers like prices, years or quantities.
5. The share page signed out never leaks drivers, toggles or the idea text.

---

### Task 1: Estimator package

**Files:** `packages/estimator/{package.json,tsconfig.json,vitest.config.ts}`, `src/index.ts`, `src/features.ts`, `src/estimate.ts`, `src/selection.ts`, tests beside each.

**Interfaces:**
- `FEATURES_V1: Record<FeatureKey, { label: string; tokens: number; hours: number; unit: "per_page" | "per_entity" | "once" }>` with keys `static_page, crud_entity, auth, file_upload, payment_pinelabs, email, ai_feature, admin_dashboard`.
- `ESTIMATOR_V1 = { version: "v1", pricePerToken: 6e-6, margin: 2, deployUsd: 1, weight: 1, rangePct: 0.3 }`.
- `type EstimateInput = { pages: number; entities: number; auth: boolean; integrations: IntegrationKind[] }`.
- `estimate(input, config = ESTIMATOR_V1): Estimate` where `Estimate = { tokens, modelUsd, costUsd, lowUsd, highUsd, hours, modelBudgetUsd, lineItems: { key, label, quantity, tokens, hours, usd }[], drivers: { key: "model" | "deploy" | "integrations", label, usd }[], version }`; money rounded to cents, `modelBudgetUsd` to 4 dp.
- `type Selection = { pages: string[]; entities: string[]; auth: boolean; integrations: IntegrationKind[] }`.
- `defaultSelection(spec): Selection` (must-haves on, nice-to-haves off, auth = `spec.auth.enabled`), `inputFromSelection(spec, selection): EstimateInput` (ignores names not in the spec).

Tests: anchor case exact numbers; every feature priced alone; empty input = deploy only ($1.00, 0 h, no NaN); range rounding; selection ignores unknown names; default selection.

### Task 2: Masker package

**Files:** `packages/masker/...`, `src/index.ts`, `src/detectors.ts`, `src/checksums.ts`, tests.

**Interfaces:**
- `mask(text: string, existing?: MaskMap): { text: string; map: MaskMap }`, `type MaskMap = Record<string, string>` placeholder to original.
- `unmask(text: string, map: MaskMap): string`.
- Placeholders `{{SECRET_n}}`, `{{PII_EMAIL_n}}`, `{{PII_PHONE_n}}`, `{{PII_CARD_n}}`, `{{PII_AADHAAR_n}}`; the same value always gets the same placeholder.
- `luhnValid(digits)`, `verhoeffValid(digits)`.

Tests: each detector positive; Luhn-invalid 16 digits and Verhoeff-invalid 12 digits are left alone; prices, years, quantities, order numbers left alone; round trip `unmask(mask(x)) === x`; stable placeholders across repeats and with an existing map.

### Task 3: Flag rules

**Files:** `packages/shared/src/flags.ts`, test.

**Interfaces:** `flagReasons(spec: Spec, defaultCostUsd: number): FlagReason[]`, `FlagReason = "payment" | "third_party_personal_data" | "over_budget_threshold"`, `FLAG_COST_THRESHOLD_USD = 25`.
Personal data = any entity field of type `email`, or a field name containing `phone`, `mobile`, `address`, `dob`, `birth`, `aadhaar`, `pan`, `passport`.

### Task 4: Phase 1 schema

**Files:** `supabase/migrations/20261024000200_intake.sql`, `packages/db/test/intake.test.ts`.

- `ideas.question_count int not null default 0 check (question_count between 0 and 4)`; `ideas.mask_map_enc bytea` (pgcrypto, key from `app.mask_key` setting supplied by the server per call; no plaintext map stored).
- `intake_messages` gains `kind text check (kind in ('question','answer','note'))`.
- `quotes.share_slug` default `encode(gen_random_bytes(9), 'base64url')`-style random slug.
- RPC `public.shared_estimate(p_slug text)` security definer, granted to `anon, authenticated`, returns only `{ name, summary, cost_usd, low_usd, high_usd, hours, features: text[] }`.
- Tests: share RPC returns headline only and nothing for unknown slugs; question_count cap enforced.

### Task 5: Server data layer and user routes

**Files:** `apps/web/lib/server/{env.ts,db.ts,ideas.ts,quotes.ts}`, `apps/web/app/api/ideas/route.ts` (POST), `app/api/ideas/[id]/answers/route.ts` (POST), `app/api/quotes/[id]/route.ts` (PATCH selection).
- `requireUser()` from session claims, 401 otherwise; every query filters by that user id.
- Submitting an idea masks text, stores it, then notifies the intake adapter.

### Task 6: Agent tool endpoints and adapter

**Files:** `apps/web/app/api/agent/ideas/route.ts` (GET submitted, poll mode), `app/api/agent/ideas/[id]/questions/route.ts`, `.../answers/route.ts`, `.../spec/route.ts`, `app/api/agent/specs/[id]/estimate/route.ts`, `apps/web/lib/server/intake-adapter.ts`.
- Spec POST validates with `SpecSchema`, 422 with Zod issues; computes default estimate, flags, creates draft quote, creates `approvals` row when flagged.
- 5th question gets 409.

### Task 7: Local intake runner

**Files:** `apps/intake-agent/` (Node, tsx), `agents/intake/prompt.md`.
Polls `GET /api/agent/ideas`, runs Claude with tools mapped 1:1 to the tool endpoints, honours the 4-question cap.
Same prompt is pasted into AgenticOrg when access is available.

### Task 8: UI

**Files:** `app/new/page.tsx` (idea form), `app/ideas/[id]/page.tsx` (intake chat, waits for spec), `app/ideas/[id]/estimate.tsx` (client toggles), `app/e/[slug]/page.tsx` (share), `app/apps/page.tsx` (list ideas), `app/admin/approvals/page.tsx` (operator queue).

### Task 9: E2E

`e2e/intake.spec.ts`: submit idea, a fake agent (test helper hitting the agent endpoints) asks 2 questions, user answers, spec posted, estimate visible, toggle changes price, share link signed out shows headline only; flagged idea waits for operator approval.
