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
4. Custom email templates are refused until a custom SMTP provider is configured (free-tier rule).
   Configure Resend SMTP first, then push the auth config.

## Vercel

- Project settings: root directory `apps/web`, framework Next.js, Node 24.x.
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
