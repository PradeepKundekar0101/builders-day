# Provn Route (Smart Router)

Route picks the right model for every task across three tiers and explains why:

1. **Frontier**: Anthropic (Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5), OpenAI (GPT-6 Astra, GPT-6.1 Sol, GPT-5.3 Codex, GPT-6 Luna), Google (Gemini 3.1 Pro, 3.7 Flash, 3.1 Flash-Lite).
2. **SLM library**: small open models on Hugging Face Inference Providers (Qwen2.5 Coder, Mistral Small, Gemma 3, DeepSeek R1 Distill, Llama 3.1 8B, Phi-4 mini, SmolLM3), plus bring-your-own OpenAI-compatible models.
3. **Local**: Ollama models on the user's machine (Gemma 3, Qwen3, Qwen2.5 Coder, Llama 3.2, Phi-4 mini) for grunt work, small context and private data.

It ships as a Vercel app: a conversational console and a JSON API. Live: https://provn-route.vercel.app

## Normal and Dev mode

The header switch toggles two interfaces over the same engine (the choice is remembered; `?dev` opens Dev mode).

- **Normal** (default, `public/normal.js`): one calm chat column. The journey is always:
  1. The user writes a prompt or picks a suggestion.
  2. Route proposes a model and mode in a plan card ("I'll use Claude Sonnet 5.5 · Balanced") with a one-line reason, and starts on its own after 3.5 s.
  3. The user can hit **Change** before it starts to pick another mode (Balanced, Best quality, Save cost, Private) or any eligible model.
  4. While it works, the card shows why that model was picked; after the reply, **Why this model?** reopens the reasoning and **Change and retry** reruns it with different choices.
- **Dev** (`public/main.js`): the full console: provider status, route map, effort/impact dials, shortlist, fallbacks, guardrails, model library and API docs.

## Architecture

```
            prompt + history + mode + override
                          │
                ┌─────────▼─────────┐
                │ 1. Analyse        │  public/core/classify.js (heuristic, ~1 ms)
                │ job type          │  or lib/llm-classifier.js (Claude Haiku 5.5)
                │ effort 1-5        │
                │ impact 1-5        │
                │ PII, tokens       │
                └─────────┬─────────┘
                ┌─────────▼─────────┐
                │ 2. Policy         │  public/core/router.js
                │ quality bar       │  need = max(effort, impact), +1 if both ≥ 4
                │ tier gates        │  local: effort ≤ 2, impact ≤ 2, not payments
                │ mode weights      │  SLM: effort ≤ 3, impact ≤ 3, not payments
                └─────────┬─────────┘
                ┌─────────▼─────────┐
                │ 3. Score models   │  fit for job type, cost, overkill, speed,
                │ rank + explain    │  privacy pull, context fit
                └─────────┬─────────┘
                ┌─────────▼─────────┐
                │ 4. Execute        │  lib/providers.js
                │ chosen → fallback │  Anthropic, OpenAI, Gemini SDKs;
                │ chain             │  HF / Ollama / BYO via OpenAI-compatible API
                └───────────────────┘
```

**Job types**: creative, dev build, research, payments & commerce, data & extraction, library & grunt work, general chat.

**Modes**: Auto, Max quality (bar +1, cost mostly ignored), Cost saver (bar -1.5 and cost weighted heavily, never for money or security work), Private (local only).

**Override**: pin a model or limit to a tier. Route still shows what it would have picked and warns if the pick is under the quality bar or much more expensive.

**Guardrails**: payments tasks carry Pine Labs sandbox, no raw card data and webhook-signature rules into the system prompt and the decision. PII is detected (email, phone, card, Aadhaar, PAN, API keys) and either keeps light work local or flags masking. Impact 4+ is flagged for human review. These are hooks for Provn Shield and The Guild.

**Fallbacks**: if the chosen provider is not connected, the best connected model runs instead, and the reason is shown. If a call fails, the next two models from other labs are tried.

## Files

```
api/              Vercel functions: catalog, route, chat, health
lib/              server only: env, providers, LLM classifier, http helpers
public/core/      the engine: catalog.js, classify.js, router.js (pure ESM, runs in browser and server)
public/index.html console UI
public/main.js    Dev console logic, shared runTurn/localDecision (falls back to in-browser routing when the API is missing)
public/normal.js  Normal mode: plan card, auto-start, change and retry, plain-language reasons
server.mjs        local dev server without the Vercel CLI
test/             node:test checks for routing behaviour
```

## Run locally

```bash
cp .env.example .env     # add whichever keys you have; all are optional
npm install
npm run dev              # http://localhost:3000
npm test
```

## Deploy to Vercel

```bash
npx vercel --prod
```

Then add keys under Project → Settings → Environment Variables (names in `.env.example`) and redeploy. No build step: `public/` is served as static files and `api/*.js` become functions.

## API

| Endpoint           | Body                                                                     | Returns                                             |
| ------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `GET /api/catalog` |                                                                          | models, tiers, modes, which providers are connected |
| `POST /api/route`  | `{ prompt, mode?, override?: { model? , tier? }, contextTokens?, byo? }` | decision only                                       |
| `POST /api/chat`   | `{ messages: [{role, content}], mode?, override?, byo?, demo? }`         | `{ decision, reply, attempts }`                     |
| `GET /api/health`  |                                                                          | `{ ok, connected }`                                 |

Key decision fields: `chosen` (what the user or router picked), `recommended` (router's pick), `executing` (what actually runs), `reasons[]`, `guardrails[]`, `fallbacks[]`, `cost.{estimate, baseline, savedPct}`, `analysis.{category, effort, impact, pii}`, `alternatives[]` (every model with score or exclusion reasons), `execution.{systemPrompt, anthropicEffort, maxOutputTokens}`.

Set `ROUTER_API_SECRET` to require an `x-provn-key` header. CORS is open so the main platform can call it from the browser.

## Integration points for the Provn platform

- **Library import**: `import { route } from 'public/core/router.js'` and pass `available` (connected runtimes). No dependencies, no network.
- **Service**: call `/api/route` before each agent step, or `/api/chat` to route and run in one hop.
- **Catalog**: `public/core/catalog.js` is the one file to edit for models, prices, fit scores. `BYO_MODELS` adds models without code.
- **Meter / Proof Console**: `cost.estimate`, `cost.baseline` and `reply.usage` give per-turn spend and savings.
- **Shield**: `analysis.pii` and `guardrails` are the hand-off points for masking and review.

## Notes

- Model ids and prices for OpenAI and Gemini come from third-party summaries in October 2026. Check them against each provider's pricing page before billing on them.
- Vercel cannot reach `localhost`. Local models run either through the console's "Run local models from my browser" switch (start Ollama with `OLLAMA_ORIGINS="*"`) or through a tunnel set as `OLLAMA_BASE_URL`.
- Claude Opus 5.5, Sonnet 5.5 and Fable 5.1 calls use server-side refusal fallbacks (`fallbacks: "default"`).
