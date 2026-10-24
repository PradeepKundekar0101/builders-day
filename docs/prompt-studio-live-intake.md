# Live Prompt Studio — integration and activation

## Implemented

An opt-in OpenAI Responses API adapter behind `POST /api/prompt-studio/interpret`. The default demo remains mock. Live intake requires authenticated Supabase sign-in, same-origin JSON requests, and server configuration. Never put a provider key in browser configuration or chat.

Set these in `apps/web/.env.local` or your hosting secret store, then restart:

```
PROMPT_STUDIO_LIVE_ENABLED=true
OPENAI_API_KEY=<server secret>
PROMPT_STUDIO_MODEL=<account-supported Responses model with JSON mode>
```

Configure the existing Supabase public URL/key and site URL for sign-in. Configure the service-role key and existing Prompt Studio migration for saving drafts. Use a dedicated provider project with a small server-side spending limit for the pilot.

## Flow

1. Complete onboarding; leave private/local-only mode off to use the cloud adapter.
2. Select **Use live AI**, enter an idea, and submit. Every submission may incur provider token charges, independent of the simulated Cost Guard credits.
3. Answer tailored questions. Each successful response updates the brief, acceptance checks and assumptions; existing answered decisions remain.
4. In **Brief & prompts**, inspect assumptions and **Last model request** (exact application-controlled instructions and masked context, response ID, reported token usage, timestamp). This excludes provider-internal instructions. Only the latest request is kept in the browser, not a durable audit trail.
5. Review the spec and export the brief for the estimator/build team. Building, routing, security and billing remain simulated.

## Failure and security boundaries

- Baseline secret/PII masking, 64 KiB incoming body limit, schema validation before and after the model, 5,000 output-token cap, 45-second timeout, no tools or URL fetching, and no automatic retry.
- JSON mode ensures a JSON response; Zod independently validates the application schema. Invalid or incomplete outputs are rejected without replacing the previous draft.
- Cancellation stops the request locally; it does not guarantee no provider usage. Error messages do not expose upstream response bodies or keys.
- Local-only preference blocks cloud calls. BYOK preference does not supply a key; the configured platform key is used.
- One active request per user and ten attempts per ten minutes per process. This is a single-instance pilot guard, not durable/distributed spend protection. Before public launch, add distributed limits, durable metering and provider-budget enforcement.
- Persisted `adapterMode` is untrusted display metadata, never evidence of a provider execution. The browser request trace is not signed release evidence.
- Model quality, interpretation accuracy and preservation of manual edits need live evaluations. The model is instructed to preserve unaffected edits; semantic preservation is not guaranteed by schema validation.

## Verified and remaining

48 shared/web tests pass, including six model-adapter tests using a fake provider. Coverage includes private-mode blocking, masking, output validation, decision preservation and upstream errors. No live provider call has been made; account credentials and a configured authenticated runtime are required for that final smoke test.

API reference: https://developers.openai.com/api/docs/guides/structured-outputs
