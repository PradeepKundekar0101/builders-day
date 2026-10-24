# Buildwise analytics

Status: integration prepared and dedicated PostHog Cloud project configured. Production deployment and event delivery are not verified yet.

## Configuration

Project: [Buildwise Production](https://eu.posthog.com/project/318549), in the separate Buildwise organization, with timezone Asia/Kolkata. The existing portfolio project is untouched. Heatmaps are enabled; session replay, console and network recording are disabled. No paid plan was selected.

The actual public ingestion configuration is in the git-ignored `apps/web/.env.local`. Use the project's settings to retrieve it for Vercel.

Set these build-time variables on the existing Vercel `conch-s-team / buildwise` project:

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`: public project ingestion token, not a personal API key.
- `NEXT_PUBLIC_POSTHOG_HOST`: the ingestion host returned by that project's settings.
- `NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS`: `getbuildwise.vercel.app`.

Redeploy after setting variables; Next.js embeds them at build time. Missing configuration disables analytics without preventing startup. Localhost and all other hostnames are excluded by default. For QA use a separate PostHog test project and explicitly allow the preview hostname.

The source branch for this change is based on `phase-0-foundation`. Confirm the actual production source before merging; `phase-1-intake-estimator` has later work. The deployment runbook establishes the production team/project, but current Vercel access cannot inspect it.

## Metrics

| Requested metric | Available foundation / definition |
| --- | --- |
| Onboarded users | `authenticated_app_opened` records a verified signed-in user reaching `/apps` or a child route. Count unique users, not events. Label as authenticated app visitors until the product owner defines onboarding completion. It includes returning users and is not a new signup count. |
| Paid users | Pending verified payment implementation. Capture a server event only after a successful payment webhook is verified, using the auth user ID and a stable transaction ID for deduplication. Count distinct paying users; exclude test mode, failed payments and promotional credits. No payment event is fabricated by this integration. |
| Average stay | PostHog web analytics session duration using pageview/pageleave and session IDs. This is elapsed session duration, not active attention time. Show the date window and session count. |
| Clicks | Masked `$autocapture` click events and heatmaps. Text/attributes are masked; use element structure and coordinates. Session replay is disabled. |

Analytics starts at installation; it cannot recover earlier usage automatically. Keep test accounts, team use, incentives and real payments distinguishable before presenting results. Detailed custom event definitions and dashboards remain pending the user's event list.

## Privacy and identity

Only the opaque verified Supabase user ID is passed to PostHog. Account switching/logout resets identity. No email, prompt, form value, clipboard content, replay, console or network recording is intentionally captured. Auth endpoint events are dropped. URL query strings/fragments and sensitive property names are stripped before sending. Review dynamic path segments and CSS classes before adding future routes with user content.

## Release verification

1. Run lint, typecheck, unit tests and production build with the project's normal app environment.
2. Use a test project to confirm one pageview per client navigation, click events, heatmaps and pageleave/session duration.
3. Sign in, open `/apps`, sign out and switch users; confirm distinct-user identity is reset and no auth tokens or email appear in event properties.
4. Configure production values and deploy the correct production branch. Confirm Vercel READY and production alias resolution.
5. Confirm real events appear in the Buildwise project's live events view. Do not claim success from a GitHub push alone.

Sources: [PostHog Next.js setup](https://posthog.com/docs/libraries/next-js), [autocapture](https://posthog.com/docs/product-analytics/autocapture).
