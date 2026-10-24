# Phase 4 - Deploy

PRD: F11, S6.

## Goal

The built workspace becomes a live frontend on Vercel backed by its own Supabase project, with the URL stored but hidden from the user until the audit releases it.

## Supabase project per app

Creating a project through the Management API takes minutes and is limited by plan.
For the day, a pool of empty projects is created ahead of time (`scripts/provision-pool.ts`, target 10) and stored in `supabase_pool`.
On deploy:

1. Assign a free pool project to the build (row lock).
2. Apply the generated migrations through the Management API SQL endpoint.
3. Configure Auth: site URL and redirect URLs set to the Vercel URL; email provider on; Google on if credentials are configured.
4. Restore masked sample data into the seed and run it.
5. If the pool is empty: create a project on demand and tell the user deploy will take a few extra minutes.

## Vercel

1. Create a Vercel project named `bw-<short_build_id>`.
2. Set env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   The service key is never set on the generated app; it does not need one.
3. Upload the workspace files and create a production deployment through the API; wait for `READY`.
4. Store `url` in `deployments`; build status moves to `auditing`.

## Security headers (S6)

Set in the template's `next.config` and checked by the audit: CSP, HSTS, X-Frame-Options `DENY`, Referrer-Policy `strict-origin-when-cross-origin`.

## Failure handling

- Vercel build failure: logs go back to the harness as a fix request (counts as a retry).
- Supabase migration failure: same.
- After retries are exhausted: build `failed`, user sees what failed, operator sees it in the queue.

## Acceptance

- The 3 fixture builds from Phase 3 deploy and load in a browser; sign-up works against their own Supabase project.
- Deploy stage under 5 minutes per app with a pool project available.
- The deployed bundle contains only the anon key (verified again in Phase 5).
