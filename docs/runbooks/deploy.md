# Deploy runbook

How Buildwise production is set up, so it can be rebuilt from scratch.
Secrets live only in `.env.deploy.local` (git-ignored) and in the Vercel and Supabase dashboards.

## Production

- Web: https://getbuildwise.vercel.app (Vercel team `conch-s-team`, project `buildwise`).
- Database and auth: Supabase project `building`, ref `bxnmselwdjodquzuzglo`, region ap-south-1.

## Supabase

1. Link once: `pnpm exec supabase link --project-ref bxnmselwdjodquzuzglo -p "$SUPABASE_DB_PASSWORD"`.
   Linking rewrites `supabase/.temp/postgres-version`; restore `17.6.1.167` for local work (see the Phase 0 ledger).
2. Apply migrations: `pnpm exec supabase db push -p "$SUPABASE_DB_PASSWORD"`.
3. Push auth settings: `pnpm exec supabase config push --project-ref bxnmselwdjodquzuzglo`.
   Production overrides live under `[remotes.production]` in `supabase/config.toml`.
   Review the printed diff before answering yes.
4. Auth email goes through Resend SMTP (`smtp.resend.com`, sender `PROVN <no-reply@auth.brokwise.com>`).
   `RESEND_API_KEY` must be in the environment when running `config push`; the config reads it with `env(RESEND_API_KEY)`.
   With custom SMTP, Supabase allows 30 auth emails per hour by default; raise it in the dashboard (Authentication > Rate Limits) before a large event.
5. Email templates only work for links the app starts, because they build the URL from `{{ .RedirectTo }}`.
   Emails sent from the Supabase dashboard have no redirect and produce a broken link; invite users through the app instead.

## Vercel

- Project settings: root directory `apps/web`, framework Next.js, Node 24.x.
- Functions run in `bom1` (Mumbai), next to the database, via `apps/web/vercel.json`. The default `iad1` adds a round trip across the world to every query.
- Server secrets (type secret, production and preview): `SUPABASE_SERVICE_ROLE_KEY`, `MASK_MAP_KEY` (32 random bytes, base64), `AGENT_API_TOKEN` (64 hex chars). Rotating `MASK_MAP_KEY` makes existing ideas unreadable; they are marked failed.
- Environment (production and preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (type config, it is public by design), `ENABLE_EXPERIMENTAL_COREPACK=1`.
- Production only: `NEXT_PUBLIC_SITE_URL=https://getbuildwise.vercel.app`; previews fall back to `NEXT_PUBLIC_VERCEL_BRANCH_URL`.
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` stays unset until the Google provider is configured in Supabase.
- Deploy from the repo root: `vercel deploy --prod --scope conch-s-team`. `.vercelignore` keeps local secrets out of the upload.

## Verify

```bash
set -a && . ./.env.deploy.local && set +a
E2E_BASE_URL=https://getbuildwise.vercel.app pnpm --filter web exec playwright test
```

The suite creates users ending in `@test.buildwise.local`; delete them afterwards so they do not count as real signups.
