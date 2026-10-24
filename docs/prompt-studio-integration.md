# Conduit Prompt Studio integration

Native integration for `PradeepKundekar0101/builders-day`, based on commit `39501f2ba9e3794cc703662f71affc28db650b2a`. This module is a working mock-backed intake interface, not a live AI product generator.

## Run

Use Node 26 and the repo's pnpm 12.4.2. Run `pnpm install --frozen-lockfile`. Configure the existing public Supabase URL, anon key, and site URL variables from `.env.example` in `apps/web/.env.local`, plus `SUPABASE_SERVICE_ROLE_KEY` on the server only. Run `pnpm --filter web dev`.

- `/prompt-studio-demo`: public interactive demo; no persistence or model calls.
- `/apps/new`: signed-in studio; saves require the migration and service-role key.
- `/apps/new?session=<uuid>`: reload a saved draft. Keep its URL to return to it.
- `/apps`: entry link to the studio.

For an isolated UI preview only, localhost Supabase URL and a non-secret placeholder anon key are enough, as long as there is no signed-in session. They do not enable storage or authentication.

## User flow

Describe an idea (50–2,000 characters), or use browser speech transcription. The browser may transmit audio to its speech service; voice is optional and capability-dependent. A clearly labeled mock suggests a starting page and three questions. Users edit the brief, pages, acceptance checks, and canonical Spec JSON. Answers feed directly into visible instructions; the mock does not infer new features from them.

Review requires valid fields, answers to every open question, and an explicit review checkbox. Export downloads a sanitized draft, or a reviewed instruction bundle when review is checked. Saving creates immutable versions and stores intake messages. User review does not approve an operator gate, quote, payment, deployment, or build.

## Team integration contract

`packages/shared/src/prompt-studio.ts` exports:

- `PromptStudioAdapter.interpret(input, signal)` -> `PromptStudioDraft`.
- `MockPromptStudioAdapter`, currently the sole wired adapter.
- Zod input/draft schemas wrapping the existing canonical `SpecSchema`.
- `compileStudioInstructions`: deterministic visible instruction text, retaining full idea, reference links, decisions, spec and checks.
- `createStudioReview`: downstream handoff (`status: user_reviewed`), not spending authorization.
- `sanitizeStudioDraft`: baseline credential/contact masking and removal of link query credentials; not comprehensive DLP.

Replace mock interpretation with a server endpoint to AgenticOrg. Keep provider credentials server-side. Validate agent responses with the shared schema, preserve unresolved decisions and bind server-issued provenance to the saved session. The current save API forces `adapterMode: mock` to prevent client claims of live generation. Do not simply remove that protection when wiring an agent.

Connect the estimator to the reviewed bundle only after implementing server-side budget and operator gates. Do not treat exported JSON or the user-review checkbox as trusted approval. The instruction preview covers this module's payload; downstream agents must expose any additional policy/context separately.

## Persistence API

`POST /api/prompt-studio/sessions` creates; `PUT /api/prompt-studio/sessions/:id` versions an existing draft. JSON body: `{id, mutationId, expectedRevision, draft, status}`. Creation expects revision 0. Updates expect the last saved revision. Reuse an identical mutation ID and body for an idempotent retry. Response: `{id, revision, draft, status}`. `GET .../:id` returns the latest draft and up to 20 history records. UI uses the saved URL to reload; a version restore/history picker is future work.

Requests require a verified Supabase user; owner ID comes from auth, never the body. Writes require the configured site origin and a JSON body no larger than 64 KiB. Stale writes return 409, other owners get 404, and new drafts are capped at 50 per user per day. Existing-session update rate limiting should be added at the platform gateway before production.

Migration: `supabase/migrations/20261024010000_prompt_studio.sql`. Apply through the team's normal Supabase migration workflow in staging first. No remote migration has been run. It adds owner-readable sessions/versions and a service-only transactional RPC. Existing ideas and intake messages are populated; canonical `specs`, estimates and builds are deliberately not created because their approval/workflow integration is not implemented.

Database types include the new tables/RPC. Regenerate using `pnpm db:types` after applying migrations in a local Supabase instance.

## Validation

- 36 shared/web unit tests pass, including input limits, canonical spec validation, open-decision gate, masking, origin checks, malformed JSON and byte limits.
- Web TypeScript checks, web ESLint and production Next build pass using placeholder public environment values.
- Browser checked: example idea, clarification answers, editable fields, review gate, mock-only review notice and visible instruction payload.
- Isolated PostgreSQL-compatible PGlite check validates migration execution, idempotency, stale-write conflicts, cross-owner rejection, owner read policies and blocked direct mutations/RPC for authenticated clients. Run `scripts/prompt-studio/check-migration.mjs` with `PGLITE_MODULE` pointing at an installed PGlite module. This uses minimal auth/ideas fixtures and does not replace the full Supabase suite.
- Live Supabase authentication/save/reload, actual microphone transcription and real provider generation have not been verified. Docker/Supabase were not available for the full database suite.

## Before production

Wire the real intake adapter, test against staging Supabase, add platform rate limits/monitoring and complete the estimator/approval handoff. Expand secret detection and browser voice privacy controls for your requirements. The prompt text itself is not a security boundary; execution must remain sandboxed and policy-controlled in the build service.
