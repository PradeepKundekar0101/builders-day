# Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, empty Buildwise with email and Google sign-in, the full data model under RLS, and CI, so every later phase plugs in without schema rework.

**Architecture:** pnpm monorepo.
`apps/web` is a Next.js App Router app (UI and, from Phase 1, API route handlers) using `@supabase/ssr`.
`packages/shared` holds the Zod spec schema and security helpers, `packages/db` holds generated DB types and the RLS test suite, `supabase/` holds migrations and local config.
Users only read their own rows; every write in later phases goes through the server with the service key.

**Tech Stack:** Node 26, pnpm 12, TypeScript strict, Next.js (latest from `create-next-app`), Tailwind, `@supabase/supabase-js`, `@supabase/ssr`, Zod, Vitest, Playwright, ESLint (flat config, typescript-eslint), Prettier, Supabase CLI (as a root devDependency), GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-buildwise/01-phase-0-foundation.md` and `00-overview.md`.

## Global Constraints

- Idea text length: 50 to 2,000 characters, enforced by a DB CHECK and exported constants `IDEA_TEXT_MIN = 50`, `IDEA_TEXT_MAX = 2000`.
- Every table in `public` has RLS enabled; user read policy is `user_id = auth.uid()` (or via a parent row's owner).
- Users get no insert, update or delete policies on any table in Phase 0.
- `deployments.url` is never readable by the `authenticated` or `anon` role directly.
- `supabase_pool` and `approvals` are not readable by normal users.
- Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` may reach the browser.
- The service-role key never appears in `apps/web/.next/static`.
- Copy never uses the em dash character; use "-".
- Commit messages carry no agent co-author line.
- UI checked at 375 px and 1280 px wide; no horizontal scroll, nothing visibly off.

## Review Focus

1. A user updating their own `profiles.role` to `admin` must fail (no update policy; tested in Task 2).
2. The `next` parameter on `/auth/confirm` and `/auth/callback` must not allow open redirects (`//evil.com`, `https://evil.com`); it falls back to `/apps` (tested in Task 3).
3. Idea text at 49 and 2,001 characters is rejected by the DB; 50 and 2,000 accepted (tested in Task 2).
4. A signed-out visit to `/apps` redirects to `/signin`; a signed-in visit to `/signin` redirects to `/apps` (tested in Task 3).
5. A missing public env var fails at startup with a message naming the variable, not a runtime crash deep in a page (tested in Task 3).

---

### Task 1: Monorepo scaffold and shared spec schema

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`, `.nvmrc` (`26`), `.env.example`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/index.ts`, `packages/shared/src/spec.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/security.ts`
- Test: `packages/shared/src/spec.test.ts`, `packages/shared/src/security.test.ts`

**Interfaces:**
- Produces (from `@buildwise/shared`, consumed as TS source; `package.json` `exports` points at `./src/index.ts`):
  - `IDEA_TEXT_MIN = 50`, `IDEA_TEXT_MAX = 2000`
  - `FieldType = "text" | "long_text" | "number" | "boolean" | "date" | "email" | "url" | "image"`
  - `IntegrationKind = "file_upload" | "payment_pinelabs" | "email" | "ai_feature" | "admin_dashboard"`
  - `SpecSchema: z.ZodType<Spec>` and `type Spec` with the shape in the spec doc
  - `findServiceRoleJwts(text: string): string[]` - returns every JWT-shaped substring whose decoded payload has `role === "service_role"`
- Root scripts: `lint`, `typecheck`, `test` (`pnpm -r test`), `format`.

- [ ] **Step 1: Scaffold root.**
`pnpm init`, workspace globs `apps/*`, `packages/*`.
Root devDependencies: `typescript`, `eslint`, `typescript-eslint`, `prettier`, `vitest`, `supabase`.
`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `target: "ES2022"`.
`.gitignore` covers `node_modules`, `.next`, `.env*` except `.env.example`, `playwright-report`, `test-results`, `supabase/.temp`.

- [ ] **Step 2: Write failing spec schema tests in `spec.test.ts`.**

```ts
const valid: Spec = {
  name: "Tiffin Tracker", summary: "Track tiffin orders",
  pages: [{ name: "Home", purpose: "Landing", mustHave: true }],
  entities: [{ name: "order", ownerScoped: true, mustHave: true,
    fields: [{ name: "customer_name", type: "text", required: true }] }],
  auth: { enabled: true, providers: ["email", "google"] },
  integrations: [{ kind: "payment_pinelabs", mustHave: true }],
};
test("accepts a valid spec", () => expect(SpecSchema.parse(valid)).toEqual(valid));
test("rejects entity names that are not snake_case identifiers", () =>
  expect(() => SpecSchema.parse({ ...valid, entities: [{ ...valid.entities[0], name: "Order Items" }] })).toThrow());
test("rejects reserved field names id, user_id, created_at", ...);   // one assertion per name
test("rejects duplicate entity names", ...);
test("rejects auth.enabled with empty providers", ...);
test("rejects ownerScoped: false", ...);
test("rejects empty pages array", ...);
test("rejects sampleData over 10000 chars", ...);
```

- [ ] **Step 3: Run `pnpm --filter @buildwise/shared test`.**
Expected: FAIL, `SpecSchema` not exported.

- [ ] **Step 4: Implement `SpecSchema` in `spec.ts`.**
Identifier regex for entity and field names: `^[a-z][a-z0-9_]{0,39}$` (these become table and column names in Phase 3).
`name` 1 to 60 chars, `summary` 1 to 500 chars, `ownerScoped: z.literal(true)`, uniqueness and reserved names via `superRefine`.

- [ ] **Step 5: Write failing tests for `findServiceRoleJwts` in `security.test.ts`.**
Build JWTs in the test with base64url header/payload and a dummy signature.
Assert: a `service_role` JWT embedded in minified JS is returned; an `anon` JWT is not; random text and a malformed `eyJ...` fragment return `[]`; two service JWTs return both.

- [ ] **Step 6: Implement `findServiceRoleJwts`.**
Regex `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`, decode the payload with `Buffer.from(..., "base64url")`, ignore parse failures.

- [ ] **Step 7: Run `pnpm lint && pnpm typecheck && pnpm test`.**
Expected: all green.

- [ ] **Step 8: Commit.**
`git commit -m "chore: scaffold monorepo and shared spec schema"`

---

### Task 2: Buildwise schema, RLS and isolation tests

**Prerequisite:** Docker Desktop running (`docker info` succeeds).

**Files:**
- Create: `supabase/config.toml` (via `pnpm supabase init`), `supabase/migrations/20261024000000_init.sql`
- Create: `supabase/templates/confirm.html`, `supabase/templates/magic_link.html`
- Create: `packages/db/package.json`, `packages/db/src/index.ts`, `packages/db/src/database.types.ts` (generated), `packages/db/vitest.config.ts`
- Create: `scripts/supabase-env.sh`
- Test: `packages/db/test/rls.test.ts`, `packages/db/test/helpers.ts`

**Interfaces:**
- Consumes: `IDEA_TEXT_MIN`, `IDEA_TEXT_MAX` (values mirrored in the SQL CHECK).
- Produces:
  - `@buildwise/db` exports `type Database` (generated by `supabase gen types typescript --local`).
  - SQL `public.is_staff() returns boolean` (security definer; true when the caller's `profiles.role` is `operator` or `admin`).
  - SQL `public.released_url(p_build_id uuid) returns text` (security definer; returns `deployments.url` only when the caller owns the build and `builds.status = 'released'`, else null).
  - `build_events` is in the `supabase_realtime` publication.
  - Root script `db:types` regenerates `database.types.ts`; `test:db` runs `packages/db` tests.
  - `scripts/supabase-env.sh` writes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env` into `.env.test`.

- [ ] **Step 1: `pnpm supabase init`, then configure `config.toml`.**
`[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/**"]`.
`[auth.email.template.confirmation]` and `[auth.email.template.magic_link]` point at the two templates.
Both templates link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/apps`, subject "Your Buildwise sign-in link".
`[auth.external.google] enabled = true`, `client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"`, `skip_nonce_check = false`; document both vars in `.env.example`.

- [ ] **Step 2: Write the migration.**
Tables, columns and enum-like `check` constraints exactly as in the spec's data model table.
All ids `uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `user_id uuid not null references auth.users on delete cascade` where listed.
`ideas.text` has `check (char_length(text) between 50 and 2000)`.
`payments.provider_order_id` unique.
`quotes.share_slug` unique.
`profiles.role` default `'user'`, check in (`user`, `operator`, `admin`).
Trigger `on_auth_user_created` after insert on `auth.users` calls security definer `handle_new_user()` which inserts `(id, email)` into `profiles`.
RLS on every table.
Select policies:
  - `profiles`: `id = auth.uid() or is_staff()`.
  - `ideas`, `specs`, `quotes`, `payments`, `builds`: `user_id = auth.uid() or is_staff()`.
  - `intake_messages`: owner via `ideas`; `build_events`, `deployments`: owner via `builds`; `audits`: owner via `deployments` then `builds`; all also `or is_staff()`.
  - `approvals`: `is_staff()` only.
  - `supabase_pool`: no policies.
No insert, update or delete policies for any role.
`revoke select on public.deployments from anon, authenticated; grant select (id, build_id, vercel_project_id, supabase_project_ref, status, created_at) on public.deployments to authenticated;`
Grant execute on `released_url` to `authenticated`.
`alter publication supabase_realtime add table public.build_events;`

- [ ] **Step 3: `pnpm supabase start`, `pnpm supabase db reset`, `pnpm db:types`, `bash scripts/supabase-env.sh`.**
Expected: reset applies the migration with no errors; `database.types.ts` lists every table.

- [ ] **Step 4: Write failing tests in `rls.test.ts`.**
`helpers.ts`: `serviceClient()`, `createUserClient(email): Promise<{ client, userId }>` (admin `createUser` with `email_confirm: true` and a random password, then `signInWithPassword`), `seedOwnedRows(userId)` (one row per table chained idea, intake_message, spec, quote, payment, build, build_event, deployment with `url = "https://secret.example"`, audit; one approval).
Tests:
  - `profile is created with role "user" on sign-up`
  - for each user-readable table: `owner sees 1 row, other user sees 0, anon sees 0` (parameterised with `test.each`)
  - `approvals and supabase_pool are invisible to a normal user`
  - `staff (role set to operator via service client) sees other users' ideas and approvals`
  - `user cannot insert an idea` (error, row count unchanged)
  - `user cannot update own profile role` (role still `user` after attempt)
  - `selecting deployments.url as owner fails with permission denied`; `selecting deployments.id as owner succeeds`
  - `released_url returns null before release and the url after status = 'released'; returns null for another user`
  - `idea text of 49 and 2001 chars is rejected; 50 and 2000 accepted` (via service client)
  - `duplicate payments.provider_order_id is rejected`

- [ ] **Step 5: Run `pnpm test:db`.**
Expected: tests that depend on correct policies pass if the migration is right; fix the migration until every test passes.
Then temporarily drop one select policy in a scratch reset and confirm the matching test fails, to prove the suite bites; restore.

- [ ] **Step 6: Commit.**
`git commit -m "feat(db): buildwise schema with owner-scoped RLS and isolation tests"`

---

### Task 3: Web app with sign-in, landing and My apps

**Files:**
- Create: `apps/web` via `pnpm create next-app@latest apps/web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm`, then trim the starter page and assets.
- Create: `apps/web/lib/env.ts`, `apps/web/lib/safe-next.ts`, `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/browser.ts`, `apps/web/lib/supabase/session.ts`
- Create: `apps/web/middleware.ts` (or `proxy.ts` if the installed Next version names request middleware that way)
- Create: `apps/web/app/page.tsx`, `apps/web/app/signin/page.tsx`, `apps/web/app/signin/signin-form.tsx`, `apps/web/app/auth/confirm/route.ts`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/auth/signout/route.ts`, `apps/web/app/apps/page.tsx`
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/helpers.ts`
- Test: `apps/web/lib/env.test.ts`, `apps/web/lib/safe-next.test.ts`, `apps/web/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `type Database` from `@buildwise/db`; `.env.test` from Task 2.
- Produces:
  - `publicEnv: { supabaseUrl: string; supabaseAnonKey: string; siteUrl: string }` and `parsePublicEnv(raw: Record<string, string | undefined>): typeof publicEnv` (throws `Error` whose message lists every missing or invalid variable name). `publicEnv` reads each `process.env.NEXT_PUBLIC_*` by literal name so Next inlines them.
  - `safeNext(raw: string | null): string` returns `raw` only if it starts with `/` and not `//` or `/\`, else `"/apps"`.
  - `createSupabaseServerClient(): Promise<SupabaseClient<Database>>` (cookies-based, `@supabase/ssr`).
  - `createSupabaseBrowserClient(): SupabaseClient<Database>`.
  - `updateSession(request): Promise<NextResponse>` used by middleware: refreshes the session; redirects unauthenticated `/apps*` to `/signin?next=<path>`; redirects authenticated `/signin` to `/apps`.
  - Routes: `GET /auth/confirm?token_hash&type&next` (calls `verifyOtp`, then redirects to `safeNext(next)`, or to `/signin?error=link` on failure); `GET /auth/callback?code&next` (OAuth `exchangeCodeForSession`, same redirects); `POST /auth/signout` (signs out, redirects to `/`).
  - `apps/web/next.config` sets `transpilePackages: ["@buildwise/shared", "@buildwise/db"]`.

- [ ] **Step 1: Write failing unit tests.**
`env.test.ts`: `parsePublicEnv({})` throws with a message containing all three variable names; a non-URL `NEXT_PUBLIC_SUPABASE_URL` throws naming it; valid input returns the mapped object.
`safe-next.test.ts`: `"/apps"` and `"/apps/123?x=1"` pass through; `null`, `""`, `"//evil.com"`, `"/\\evil.com"`, `"https://evil.com"`, `"apps"` return `"/apps"`.

- [ ] **Step 2: Run `pnpm --filter web test`.**
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `env.ts`, `safe-next.ts`, the Supabase clients, `updateSession` and middleware.**
Middleware matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image files.

- [ ] **Step 4: Run unit tests.**
Expected: PASS.

- [ ] **Step 5: Write failing Playwright tests in `e2e/auth.spec.ts`.**
`playwright.config.ts`: `baseURL` from `E2E_BASE_URL` or `http://localhost:3000`; local `webServer` runs `pnpm dev` with `.env.test` values mapped to the `NEXT_PUBLIC_*` names; projects `desktop` (1280x800) and `mobile` (375x812).
`helpers.ts`: `signInViaGeneratedLink(page, email)` creates the user with the admin API if missing, calls `auth.admin.generateLink({ type: "magiclink", email })`, and visits `/auth/confirm?token_hash=<properties.hashed_token>&type=email&next=/apps`.
Tests:
  - `landing shows the pitch and Price my idea goes to sign-in`: heading "Know the price before you build.", subtext "Tell us your idea, see what it costs before you spend a rupee, approve it, and we build and deploy it securely.", clicking "Price my idea" lands on `/signin`.
  - `signed-out /apps redirects to /signin?next=%2Fapps`.
  - `email sign-up through the form` (local only, skipped when `E2E_BASE_URL` is set): fill a fresh email, click "Email me a sign-in link", see "Check your email for a sign-in link.", fetch the newest message for that address from the local Mailpit API (`http://127.0.0.1:54324/api/v1/`), open its `/auth/confirm` link, land on `/apps` showing heading "My apps", empty state "No apps yet. Describe an idea and get a price in under a minute.", and the user's email in the header.
  - `generated-link sign-in lands on My apps` (runs locally and against the deployed URL).
  - `signed-in /signin redirects to /apps`.
  - `sign out returns to landing and /apps redirects again`.
  - `Continue with Google starts the OAuth flow`: `page.waitForRequest(/\/auth\/v1\/authorize\?provider=google/)` after clicking.
  - `bad token shows an error`: `/auth/confirm?token_hash=nope&type=email` lands on `/signin` showing "That sign-in link is invalid or expired. Request a new one."
  - `no horizontal scroll`: on `/`, `/signin`, `/apps`, `document.documentElement.scrollWidth <= window.innerWidth`.

- [ ] **Step 6: Run `pnpm --filter web e2e`.**
Expected: FAIL, pages missing.

- [ ] **Step 7: Build the pages.**
Follow the frontend-design skill for a clean, intentional look; one accent color; system font stack or one Google font.
Header on every page: "Buildwise" wordmark left; right side shows "Sign in" when signed out, the email and a "Sign out" button when signed in.
Sign-in page: "Continue with Google" button, divider "or", email input, "Email me a sign-in link" button, sent state, and the `?error=link` message.
`signInWithOtp` uses `options.emailRedirectTo = publicEnv.siteUrl + "/apps"` and `shouldCreateUser: true`.
`signInWithOAuth` uses `redirectTo = publicEnv.siteUrl + "/auth/callback?next=" + safeNext(next)`.

- [ ] **Step 8: Run `pnpm --filter web e2e` and unit tests.**
Expected: all PASS on both projects.
Take screenshots of `/`, `/signin`, `/apps` at both widths and fix anything visibly off before moving on.

- [ ] **Step 9: Commit.**
`git commit -m "feat(web): landing, email and Google sign-in, My apps shell"`

---

### Task 4: Client bundle secret scan and CI

**Files:**
- Create: `scripts/check-client-bundle.ts`
- Create: `.github/workflows/ci.yml`
- Test: `scripts/check-client-bundle.test.ts` (fixture directory created in the test with `fs.mkdtemp`)

**Interfaces:**
- Consumes: `findServiceRoleJwts` from `@buildwise/shared`.
- Produces: `scanClientBundle(dir: string, forbiddenValues: string[]): { file: string; reason: string }[]` and a CLI (`pnpm check:bundle`) that scans `apps/web/.next/static`, uses `SUPABASE_SERVICE_ROLE_KEY` (if set) as a forbidden value, also flags the literal strings `SUPABASE_SERVICE_ROLE_KEY` and `service_role`, prints findings, exits 1 if any.

- [ ] **Step 1: Write failing tests.**
`clean bundle returns []`; `file containing a service_role JWT is reported`; `file containing the forbidden literal value is reported`; `nested directories are scanned`; `.js, .mjs, .css, .html, .json and .map files are all scanned`; every finding carries the file path relative to `dir`.

- [ ] **Step 2: Run tests, expect FAIL; implement; run, expect PASS.**

- [ ] **Step 3: Write `ci.yml`.**
Triggers: push and pull_request.
Job `checks`: checkout, `pnpm/action-setup`, `actions/setup-node` with `.nvmrc` and pnpm cache, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
Job `db-and-e2e`: same setup, `pnpm supabase start`, `bash scripts/supabase-env.sh`, `pnpm test:db`, `pnpm --filter web build` with env from `.env.test`, `pnpm check:bundle`, `pnpm exec playwright install --with-deps chromium`, `pnpm --filter web e2e`, upload `playwright-report` on failure.

- [ ] **Step 4: Verify locally.**
Run `pnpm --filter web build && SUPABASE_SERVICE_ROLE_KEY=<local key> pnpm check:bundle`.
Expected: exit 0, "No server secrets found in client bundle."

- [ ] **Step 5: Commit, push the branch, and confirm both CI jobs pass on GitHub (`gh run watch`).**
`git commit -m "ci: lint, typecheck, unit, RLS, e2e and client bundle secret scan"`

---

### Task 5: Hosted Supabase and Vercel deploy

**Needs the user:** creating hosted projects and setting secrets acts on the user's accounts.
Confirm with the user before each create step; the user supplies or approves Google OAuth credentials and the SMTP provider.

**Files:**
- Create: `docs/runbooks/deploy.md` (the exact commands and dashboard settings used, so the environment is reproducible)
- Modify: `.env.example` (add any new variable names)

**Interfaces:**
- Consumes: migration from Task 2, web app from Task 3, E2E suite from Task 3.
- Produces: a hosted Supabase project with the migration applied; a Vercel project for `apps/web` (root directory `apps/web`) with production env vars; the production URL recorded in `docs/runbooks/deploy.md`.

- [ ] **Step 1: Hosted Supabase.**
Create the project (region `ap-south-1`), `pnpm supabase link`, `pnpm supabase db push`.
Expected: `supabase migration list` shows the init migration applied remotely.

- [ ] **Step 2: Auth settings on the hosted project.**
Site URL = the Vercel production URL; redirect allow-list includes it plus `https://*-<team>.vercel.app/**` for previews.
Email templates set to the same `/auth/confirm` links as `supabase/templates`.
Custom SMTP configured (Resend or similar): the built-in sender is rate limited to a few emails per hour, which would block the 20-signup target.
Google provider enabled with the OAuth client whose authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.

- [ ] **Step 3: Vercel.**
`vercel link` with root directory `apps/web`; set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` for production and preview; connect the GitHub repo so pushes deploy.
No service-role key is set on Vercel in Phase 0.

- [ ] **Step 4: Deploy and run the E2E suite against production.**
`E2E_BASE_URL=<prod url> SUPABASE_URL=<hosted url> SUPABASE_SERVICE_ROLE_KEY=<hosted key, from the shell only> pnpm --filter web e2e`
Expected: every test except the local-only Mailpit test passes on both viewports.

- [ ] **Step 5: Manual check of the real journey.**
Sign up on the live URL with a real inbox and with Google; both land on "My apps".
Check the pages on a phone.

- [ ] **Step 6: Write `docs/runbooks/deploy.md` and commit.**
`git commit -m "docs: deploy runbook for hosted Supabase and Vercel"`
