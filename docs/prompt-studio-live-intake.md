# Live Prompt Studio - integration and activation

## Implemented

An opt-in Claude adapter (Anthropic Messages API via `@anthropic-ai/sdk`) behind `POST /api/prompt-studio/interpret`. The default demo remains mock. Live intake requires authenticated Supabase sign-in, same-origin JSON requests, and server configuration. Never put a provider key in browser configuration or chat.

Set these in `apps/web/.env.local` or your hosting secret store, then restart:

```
PROMPT_STUDIO_LIVE_ENABLED=true
ANTHROPIC_API_KEY=<server secret>
# Optional; defaults to claude-opus-5-5
PROMPT_STUDIO_MODEL=<Claude model id that supports structured outputs>
```

`PROMPT_STUDIO_MODEL` may be left unset.
Requests use adaptive thinking at `medium` effort and the server-side refusal fallback (`fallbacks: "default"`).

Configure the existing Supabase public URL/key and site URL for sign-in. Configure the service-role key and existing Prompt Studio migration for saving drafts. Use a dedicated Anthropic workspace with a small spending limit for the pilot.

## Flow

1. Complete onboarding; leave private/local-only mode off to use the cloud adapter.
2. Select **Use live AI**, enter an idea, and submit. Every submission may incur provider token charges, independent of the simulated Cost Guard credits.
3. Answer tailored questions. Each successful response updates the brief, acceptance checks and assumptions; existing answered decisions remain.
4. In **Brief & prompts**, inspect assumptions and **Last model request** (exact application-controlled instructions and masked context, response ID, reported token usage, timestamp). This excludes provider-internal instructions. Only the latest request is kept in the browser, not a durable audit trail.
5. Review the spec and export the brief for the estimator/build team. Building, routing, security and billing remain simulated.

## Failure and security boundaries

- Baseline secret/PII masking, 64 KiB incoming body limit, schema validation before and after the model, 16,000 output-token cap (thinking included), 45-second timeout, no tools or URL fetching, and no automatic retry.
- Structured outputs constrain the response to the intake JSON schema; Zod independently validates the full application schema, including constraints the API does not enforce.
  Invalid, truncated or refused outputs are rejected without replacing the previous draft.
- Cancellation stops the request locally; it does not guarantee no provider usage. Error messages do not expose upstream response bodies or keys.
- Local-only preference blocks cloud calls. BYOK preference does not supply a key; the configured platform key is used.
- One active request per user and ten attempts per ten minutes per process. This is a single-instance pilot guard, not durable/distributed spend protection. Before public launch, add distributed limits, durable metering and provider-budget enforcement.
- New live drafts are saved with `adapterMode: "claude"`; drafts saved earlier with `"openai"` still load and are treated as live.
- Persisted `adapterMode` is untrusted display metadata, never evidence of a provider execution. The browser request trace is not signed release evidence.
- Model quality, interpretation accuracy and preservation of manual edits need live evaluations. The model is instructed to preserve unaffected edits; semantic preservation is not guaranteed by schema validation.

## Verified and remaining

Model-adapter tests use a fake `fetch` behind the Anthropic SDK.
Coverage includes private-mode blocking, masking, output validation, decision preservation, refusals, truncation, cancellation and upstream errors.
A live smoke test against `claude-opus-5-5` returned a valid brief in about 13 seconds.

API reference: https://platform.claude.com/docs/en/build-with-claude/structured-outputs


## Progressive disclosure

The persisted `buildStage` runs from 0 (layout) through 1 (primary journey), 2 (data and connections), and 3 (review). Questions carry an optional stage for backwards compatibility. Initial live intake suppresses questions; subsequent responses introduce at most one new question for the active stage. The model is instructed to defer future concerns and preserve decisions. Relevance remains model-dependent and needs live evaluation.

The workspace advances automatically when its current questions are resolved, pauses while typing or on failure, and offers Pause progression. Live progression makes billable model requests. Preview pages and data cards appear by stage; this is a simulated scaffold, not generated application code. A real builder must supply authoritative stage completion events before replacing the demo timer. No deployment, cost gate or security gate is bypassed.
