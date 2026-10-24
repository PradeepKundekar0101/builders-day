# Phase 0 - Foundation

## Goal

A deployed, empty Buildwise with sign-up, a complete data model under RLS, and CI.
Everything later plugs into this without schema rework.

## Scope

- Monorepo scaffold as laid out in the overview.
- Supabase project for Buildwise; migrations in `supabase/migrations`.
- Auth: email (magic link) and Google via Supabase Auth (the auth half of F1).
- Deploy `apps/web` to Vercel with preview deploys per branch.
- CI: lint, typecheck, Vitest, Playwright smoke.
- Secrets only in server env (S7): Supabase service key, Pine Labs, Anthropic, Vercel token, AgenticOrg token.

## Data model

All tables in `public`, RLS on, owner policy `user_id = auth.uid()` for select unless noted.
Writes to anything money- or build-related happen only through the server with the service key.

| Table | Key columns | Notes |
|-------|-------------|-------|
| `profiles` | `id` (= auth uid), `email`, `role` (`user` / `operator` / `admin`) | Created by trigger on sign-up |
| `ideas` | `id`, `user_id`, `text` (50 to 2,000 chars, CHECK), `links[]`, `status` | `status`: `submitted`, `in_intake`, `spec_ready`, `failed` |
| `intake_messages` | `id`, `idea_id`, `role` (`agent` / `user`), `content`, `created_at` | The agent log the jury asks for |
| `specs` | `id`, `idea_id`, `user_id`, `version`, `spec` (jsonb), `flag_reasons[]`, `operator_status` (`not_needed` / `pending` / `approved` / `rejected`) | `spec` validated by the shared Zod schema |
| `quotes` | `id`, `spec_id`, `user_id`, `selected_features` (jsonb), `cost_usd`, `low_usd`, `high_usd`, `hours`, `model_budget_usd`, `amount_inr`, `fx_rate`, `weights_version`, `status` (`draft` / `locked` / `paid` / `expired`), `share_slug` | Numbers are frozen once `locked` |
| `payments` | `id`, `quote_id`, `user_id`, `provider`, `provider_order_id`, `amount_minor`, `currency`, `status`, `raw_event` (jsonb) | Unique on `provider_order_id` |
| `builds` | `id`, `quote_id`, `user_id`, `mode` (`buildwise` / `control`), `status`, `budget_usd`, `spent_usd`, `tokens_in`, `tokens_out`, `retries`, `claimed_by`, timestamps | `status`: `queued`, `running`, `paused_budget`, `building_fix`, `deploying`, `auditing`, `released`, `failed` |
| `build_events` | `id`, `build_id`, `ts`, `type`, `payload` (jsonb) | Realtime enabled; streamed to the owner |
| `deployments` | `id`, `build_id`, `vercel_project_id`, `url`, `supabase_project_ref`, `status` | `url` hidden from the user until released |
| `audits` | `id`, `deployment_id`, `attempt`, `results` (jsonb), `passed`, `overridden` | |
| `approvals` | `id`, `kind` (`flagged_spec` / `budget_overrun` / `audit_override`), `subject_id`, `requested_at`, `decided_by`, `decision`, `note` | One queue for every human-in-the-loop point |
| `supabase_pool` | `project_ref`, `api_url`, `anon_key`, `service_key_secret_ref`, `assigned_build_id` | Not readable by users at all |

The deployment `url` column is guarded by a view or column privilege so a user cannot read it before `builds.status = 'released'`.

## Shared spec schema (`packages/shared`)

The contract between the intake agent, estimator and harness.

```ts
Spec = {
  name: string
  summary: string
  pages: { name: string; purpose: string; mustHave: boolean }[]
  entities: { name: string; fields: { name: string; type: FieldType; required: boolean }[]; ownerScoped: true; mustHave: boolean }[]
  auth: { enabled: boolean; providers: ("email" | "google")[] }
  integrations: { kind: "file_upload" | "payment_pinelabs" | "email" | "ai_feature" | "admin_dashboard"; mustHave: boolean; notes?: string }[]
  sampleData?: string   // masked before storage, see Phase 3
}
```

`ownerScoped` is always true for the day; it is what makes RLS generation mechanical.

## UI

- Landing page with the pitch line and a single "Price my idea" call to action.
- Sign-in page (email, Google).
- Empty "My apps" page.

## Acceptance

- E2E: visit live URL, sign up with email, see "My apps".
- A second user cannot read the first user's rows in any table (Vitest against a local Supabase, two JWTs).
- CI green on main.
