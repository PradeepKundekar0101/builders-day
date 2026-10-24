# PROVN Prompt Studio integration

Native integration for `PradeepKundekar0101/builders-day`, based on commit `39501f2ba9e3794cc703662f71affc28db650b2a`. This module includes mock intake, opt-in server-side Claude intake, versioned drafts, and a host build-event connector. It does not generate or deploy applications by itself.

## Run

Use Node 26 and the repo's pnpm 12.4.2. Run `pnpm install --frozen-lockfile`. Configure the existing public Supabase URL, anon key, and site URL variables from `.env.example` in `apps/web/.env.local`, plus `SUPABASE_SERVICE_ROLE_KEY` on the server only. Run `pnpm --filter web dev`.

- `/prompt-studio-demo`: public interactive demo with no persistence. Optional live AI still requires configured credentials and verified sign-in.
- `/apps/new`: signed-in studio; saves require the migration and service-role key.
- `/apps/new?session=<uuid>`: reload a saved draft. Keep its URL to return to it.
- `/apps`: entry link and owner-scoped saved-draft list.

For an isolated UI preview only, localhost Supabase URL and a non-secret placeholder anon key are enough, as long as there is no signed-in session. They do not enable storage or authentication.

## User flow

Describe an idea (50–2,000 characters), or use browser speech transcription. The browser may transmit audio to its speech service; voice is optional and capability-dependent. The labelled mock suggests a starting page and three staged questions. Live intake starts with a layout brief and asks at most one new blocking question per response. Users edit the brief, pages, acceptance checks, and canonical Spec JSON. Answers feed directly into visible instructions; the mock does not infer new features from them.

Review requires valid fields, answers to every open question, and an explicit review checkbox. Export downloads a sanitized draft, or a reviewed instruction bundle when review is checked. Saving creates immutable versions and stores intake messages. User review does not approve an operator gate, quote, payment, deployment, or build.

## Team integration contract

`packages/shared/src/prompt-studio.ts` exports:

- `PromptStudioAdapter.interpret(input, signal)` -> `PromptStudioDraft`.
- `MockPromptStudioAdapter` for offline demos; the server-side Claude adapter is opt-in.
- Zod input/draft schemas wrapping the existing canonical `SpecSchema`.
- `compileStudioInstructions`: deterministic visible instruction text, retaining full idea, reference links, decisions, spec and checks.
- `createStudioReview`: downstream handoff (`status: user_reviewed`), not spending authorization.
- `sanitizeStudioDraft`: baseline credential/contact masking and removal of link query credentials; not comprehensive DLP.

To add another provider, implement it behind a server endpoint using the same validated draft contract. Keep provider credentials server-side. Validate agent responses with the shared schema, preserve unresolved decisions and bind server-issued provenance to the saved session. Saved `adapterMode` is editable display metadata, never trusted provenance or spending authority.

Connect the estimator to the reviewed bundle only after implementing server-side budget and operator gates. Do not treat exported JSON or the user-review checkbox as trusted approval. The instruction preview covers this module's payload; downstream agents must expose any additional policy/context separately.

## Persistence API

`POST /api/prompt-studio/sessions` creates; `PUT /api/prompt-studio/sessions/:id` versions an existing draft. JSON body: `{id, mutationId, expectedRevision, draft, status}`. Creation expects revision 0. Updates expect the last saved revision. Reuse an identical mutation ID and body for an idempotent retry. Response: `{id, revision, draft, status}`. `GET .../:id` returns the latest draft and up to 20 history records. The UI lists saved sessions on `/apps`, shows up to 20 saved versions with compiled instructions, and can restore a prior version as an unsaved draft. Saving that copy creates a new version. Resumed/restored workspaces start paused. Exact provider-request audit history is not persisted by this mechanism.

Requests require a verified Supabase user; owner ID comes from auth, never the body. Writes require the configured site origin and a JSON body no larger than 64 KiB. Stale writes return 409, other owners get 404, and new drafts are capped at 50 per user per day. Existing-session update rate limiting should be added at the platform gateway before production.

Migration: `supabase/migrations/20261024010000_prompt_studio.sql`. Apply through the team's normal Supabase migration workflow in staging first. No remote migration has been run. It adds owner-readable sessions/versions and a service-only transactional RPC. Existing ideas and intake messages are populated; canonical `specs`, estimates and builds are deliberately not created because their approval/workflow integration is not implemented.

Database types include the new tables/RPC. Regenerate using `pnpm db:types` after applying migrations in a local Supabase instance.

## Validation

- 54 shared/web unit tests pass, including input limits, canonical spec validation, open-decision gate, masking, origin checks, malformed JSON and byte limits.
- Web TypeScript checks, web ESLint and production Next build pass using placeholder public environment values.
- Browser checked: example idea, clarification answers, editable fields, review gate, mock-only review notice and visible instruction payload.
- Isolated PostgreSQL-compatible PGlite check validates migration execution, idempotency, stale-write conflicts, cross-owner rejection, owner read policies and blocked direct mutations/RPC for authenticated clients. Run `scripts/prompt-studio/check-migration.mjs` with `PGLITE_MODULE` pointing at an installed PGlite module. This uses minimal auth/ideas fixtures and does not replace the full Supabase suite.
- Cloud Supabase, microphone transcription and real provider generation are not verified locally. The repository CI provides local Supabase coverage; see the follow-up PR for authenticated version-history browser results.

## Before production

Wire the real intake adapter, test against staging Supabase, add platform rate limits/monitoring and complete the estimator/approval handoff. Expand secret detection and browser voice privacy controls for your requirements. The prompt text itself is not a security boundary; execution must remain sandboxed and policy-controlled in the build service.


## Dark build workspace

After intake, `BuildWorkspace` renders guided chat on the left and a preview/deployment area on the right. The chat uses the existing draft questions sequentially; answers update the same shared draft and compiled instructions. Further requirements are appended to the original intent within the 2,000-character limit. Brief & prompts exposes the existing editors, review gate, save and export controls.

The right panel is explicitly a local React layout scaffold derived from the canonical spec. It is not generated application code. Page navigation, preview width and refresh are functional. Build console events are simulated and do not execute code, spend credits or deploy. Live shows disconnected services and Publish remains disabled. The team must supply a sandboxed preview runtime, authenticated build event stream and deployment workflow before enabling live publishing. Keep previews isolated from the host and never trust arbitrary user-provided preview URLs.

Browser verification: sequential chat answers, handoff to visible instructions, simulated build completion, disconnected Live state and 390px mobile layout without horizontal overflow. Production build, TypeScript and web lint passed.


## Build engine connector

Pass a stable `buildConnection: StudioBuildConnection` prop to `PromptStudio` from the host client wrapper. Import the type and validator from `apps/web/lib/prompt-studio/build-events.ts`. The connection has `runId`, `allowedPreviewOrigins`, and `subscribe(receive, fail)`, returning an unsubscribe function. Optional `onDraftChange(draft)` receives updated requirements so the host can coordinate its builder; it must not treat those client edits as execution or spending approval. The host must authenticate the stream, enforce session ownership, and reconnect/replay in sequence. This module does not implement a build server or approve paid execution.

Events contain `{runId, sequence, stage, type, previewUrl?}`. Stages 0–3 are layout, primary journey, data/connections, and review. Types are `started`, `completed`, `failed`, and `preview`. Reject malformed, other-run, stale and non-current-stage events; hosts should replay stage events after the draft advances. Completed current stages advance only when current questions are answered. Failures and disconnects block progression until a new valid event clears the failure. Without a connector, the labelled demo timer remains active. Supply a new stable connection object to switch runs.

Preview URLs must be HTTPS, have no embedded credentials, match a host-supplied origin allowlist, and be on a different origin from PROVN. The iframe permits scripts and forms but has no same-origin or parent-navigation capability. Applications requiring cookies/storage may need a dedicated preview authentication design. Never put secrets into preview URLs. Publish remains disabled; the connector does not bypass release/security/budget gates.

## Current validation and activation

Local environment has no live model or Supabase credentials. Unit tests cover save retry identities and build-event validation. The added Supabase browser test covers create, idempotent retry, version conflict, list/resume, non-destructive restore and cross-owner isolation. Passed in GitHub Actions on 2026-10-24 for implementation commit a10398a, on desktop and mobile, alongside the existing authentication and database suites. Cloud production verification is still required. Live-model relevance, real engine connectivity, cloud persistence and the Vercel deployment remain separate activation tasks. No migration to a remote database has been performed.
