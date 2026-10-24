# PROVN live-flow verification, 24 October 2026

## Verified sources

GitHub default `phase-0-foundation` at 8852719 contains Prompt Studio and analytics. `feat/prompt-studio-resume-integration` at 91fd4fb contains saved history and the build-event connector. `phase-1-intake-estimator` at 5f74a14 contains intake, cost/credit APIs, guarded wallet reservations, email-link fixes and migrations. These branches are reconciled locally on `codex/prompt-studio-google-sso`; this work has not been published.

The smart router exists separately on `feat/smart-model-router`. It is not a build worker. Its chat endpoint can return a demo response on provider failures, so it must not be treated as successful product generation.

## Authentication

The deployed application at https://getbuildwise.vercel.app uses Supabase project bxnmselwdjodquzuzglo. A browser Google-login attempt returned HTTP 400, `Unsupported provider: provider is not enabled`. Read-only dashboard inspection confirmed Google disabled and empty client ID/secret fields. No provider settings were changed.

The user selected email verification links instead. The deployed email form accepted a sign-in-link request. The user received the email but reported a 404. The deployed form supplied /apps/new as RedirectTo; the hosted template appended &token_hash and &type directly to that path. Routing the received token through /auth/confirm with next=/apps/new reached Prompt Studio. This verifies the repaired token-confirmation path, not an unmodified email journey. A narrow fix is prepared separately on codex/provn-email-link-fix for deployment approval.

Local email sign-in uses `/auth/confirm?next=...`, supports token-hash and PKCE email templates, and preserves `next` after an expired link. Google remains optional behind the existing phase-1 feature flag.

Draft recovery uses same-origin localStorage with a random UUID-only URL, a 24-hour validity window, and deletion after explicit cloud save. It supports a new tab in the same browser/profile; it does not transfer a draft to another browser, device, or origin. Existing sessionStorage recoveries remain readable in their original tab. The draft is not an approval or authority to spend. Restored work starts paused and requires explicit account save. Data remains on the device until saved, expired recovery is accessed, or site storage is cleared; validity expiry is not background deletion.

## Connected locally

`/apps/new?session=<session-uuid>&build=<build-uuid>` connects to an existing owned build via `GET /api/prompt-studio/builds/:id`. The endpoint checks the authenticated user, build, quote, canonical spec's idea and draft session before reading any events. No browser-supplied user ID is trusted.

The browser polls every 1.5 seconds. It replays on stage changes, aborts on unmount and stops on errors or budget pause. A failed connection never becomes a mock run. Engine progress does not trigger automatic live-intake provider calls.

Workers must write `build_events` with type `studio` and payload `{stage: 0..3, type: "started" | "completed" | "failed" | "preview", previewUrl?: string}`. Server-assigned row IDs determine order and the endpoint supplies the authoritative build ID. Raw command/model logs are never forwarded. Emit a completion only after that stage actually succeeds.

`PROVN_BUILD_PREVIEW_ORIGINS` must list exact isolated HTTPS origins. Preview iframes remain sandboxed; an arbitrary URL is not accepted. A build connection observes an approved run. Editing the draft does not change that run or start another.

## Still required for a real product build

There is no executable `apps/worker` or `templates/generated-app` in the inspected Git branches. Phase 3 is a specification. This local change does not implement that worker or generate product code.

The remaining implementation is: reviewed immutable Studio version to canonical spec and operator gate; server-priced estimate; explicit wallet approval/start; sandboxed worker claim/heartbeat and bounded model calls; actual generated-app compilation/tests/migration checks; isolated preview/artifact hosting; and release/security approval. Existing phase-1 wallet start can queue a build and its libraries provide budget reservation and attempt limits, but no worker currently consumes the queue.

Do not enable a start-build button merely because a connection object or UI timer exists. Do not publish, run paid providers, apply remote migrations or create artificial paid quotes as a substitute for the missing workflow.

## Local verification

Auth callback/redirect tests cover successful Google PKCE, cancellation, expired email token, email PKCE, safe redirect and already-signed-in behavior. Build API tests cover auth, cross-owner/draft rejection and raw-log exclusion. Polling tests cover replay, budget pause and abort. These use test doubles and do not prove a deployed worker or real email callback.

Validation after local reconciliation: 269 unit tests across workspace packages passed, all workspace typechecks passed, web lint passed, and the web production build passed with placeholder credentials. Database integration/browser suites requiring a configured local Supabase were not run. Node 24/pnpm 11 were available locally, below the repository Node 26/pnpm 12 pins.
