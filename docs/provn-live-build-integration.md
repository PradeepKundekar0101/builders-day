# PROVN live build integration

## Implementation and boundaries

This branch reconciles `phase-0-foundation`, `phase-1-intake-estimator`, and the earlier local Studio draft recovery/build-feed work. The deployed email-only login is retained. No changes in this branch have been published or applied to production.

The supported path is email login → Prompt Studio → save a reviewed version → Build product → server estimate → explicit approval → atomic credit hold → worker claim → bounded OpenAI design request → trusted Next.js template generation → TypeScript, production build and Postgres migration validation → private downloadable source ZIP. Build history survives navigation. Generated apps use email authentication and owner-scoped CRUD.

This is a constrained template builder, not an arbitrary coding agent. The model supplies product copy and a theme from an enum as validated JSON. It cannot execute shell commands, alter packages, write code, choose filenames, or fetch links. Trusted code emits pages, forms, CRUD routes and migrations. Requirements that need bespoke business logic, external integrations, payments, file uploads or Google auth need another implementation and are not supported by this worker. Integrations are rejected before a quote is accepted. Successful compilation is not evidence that every natural-language acceptance criterion is satisfied.

The output is source, not a deployed product. Each generated app requires a separate Supabase project and migration application before its auth/data features work. Preview hosting, deployment, external integrations, security audit and release remain separate from this change. The existing `/demo` and draft preview remain simulations and do not start this worker.

## Code map

- `POST /api/prompt-studio/prepare`: verified user, same origin, bounded JSON, owned latest reviewed version, supported scope and private-mode checks. Server pricing and existing operator flags. The immutable `source-v1` pricing snapshot omits the deployment fee because this worker only produces source. `prepare_studio_build` locks a canonical immutable spec per Studio version.
- Existing `POST /api/cost/wallet/runs`: server-created quote and wallet run. No client price or user ID is accepted.
- Existing run action endpoint: approve and start. Starting requires activation, Studio provenance and a recent worker heartbeat. The wallet transaction reserves credits and queues the build together. A missing worker does not reserve credits.
- `apps/worker`: service process, one job at a time. `claim_studio_build` uses SKIP LOCKED and only claims funded Studio builds. Heartbeats every 15 seconds. A heartbeat older than two minutes pauses the job for reconciliation; it does not reissue a possibly billed model call.
- `runCreditAttempt` and `runBoundedCall`: attempt admission and provider usage reservation/settlement. Model ID and verified input/output rates must be explicitly configured. The request bounds output to 3,000 tokens and reserves an input byte-count upper bound plus protocol headroom. Invalid design output is parsed only after usage has been reconciled. Missing usage or a network error remains unsettled for investigation.
- Generated source uses pinned dependencies and a committed npm lockfile. Install uses `--ignore-scripts`; subprocesses receive no provider or Supabase service credentials. Only trusted template code executes. Run the worker as an unprivileged container with a dedicated writable work directory.
- `GET /api/prompt-studio/build-status/:id`: checks ownership before reading output or signing the private artifact. URLs expire after 60 seconds. Raw model output and shell logs are not sent to the browser.

## Local checks

Run with Node 26 and the repository-pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter web build
pnpm --filter @buildwise/worker fixture /tmp/provn-fixture
```

The fixture does not call a model or touch production. It generates a real Next.js app with one authenticated entity, runs migration checks in PGlite, installs locked dependencies, typechecks, compiles and creates `/tmp/provn-fixture/product.zip`. It can be opened with `npm run start -- --port 3115` from that directory. Auth/data still require a dedicated Supabase project.

Tests exercise migration compatibility, owner RLS, reviewed-version ownership, immutability, funded queue claim, duplicate claim rejection, provider reservation/usage settlement, duplicate-call prevention, stale-worker pause, unsupported scope, route authorization, stale/unreviewed draft rejection, and private artifact signing. Provider tests use test doubles. A browser regression for explicit approval/navigation is included for the existing Supabase E2E CI job. The generated-product CI job builds the fixture without paid calls.

## Activation requirements

1. Review this integration branch and run all CI, including the real Supabase database/browser job. Local PGlite checks are not a substitute for hosted Supabase auth/storage verification.
2. Inspect the destination migration ledger before applying migrations. Two branches used duplicate versions: `20261024010000` for Studio and Cost Guard, and `20261024020000` for short ideas and credit wallets. Cost Guard is now `20261024011000`; credit wallets are `20261024021000`. If those old cost versions were already applied, reconcile the ledger with the database owner instead of replaying CREATE TABLE statements. `20261024035000` repairs Studio's required intake-message kind. `20261024040000` adds the build handoff, worker tables and private artifact bucket. No remote migration has been run here.
3. Configure a persistent worker/container host. Vercel hosts the web app, not this long-running process. Build the container from the repository root using `docker build -f apps/worker/Dockerfile -t provn-worker .`. Supply environment variables from `apps/worker/.env.example` through the host's secret store. Do not commit them.
4. Verify the configured OpenAI model's current standard input/output rates, record `PROVN_BUILD_PRICING_VERSION`, and obtain an explicit paid smoke-test spending limit before running it. There is no guessed default model or price.
5. Fund test users through the existing trusted credit-wallet service. The UI displays the actual balance; it never invents credit or allows client-funded balances. Free monthly allowance and payment/subscription provisioning are existing wallet commands but are not automatically activated by this change. Decide which funding policy the team wants before enabling builds for users.
6. Enable `PROVN_LIVE_BUILDS=true` on the worker and web only after deployment approval. Confirm a fresh worker heartbeat, request one reviewed build, approve its displayed cap, observe progress, and download the private ZIP from the signed-in account. Verify a second account cannot retrieve it.
7. Test the generated app against a dedicated Supabase project, including email sign-in and cross-account CRUD, before approving deployment. The source artifact is not a security certification or production release.

## Interrupted runs and refunds

A failed or interrupted job is marked `needs_review`; its build is paused and its credit hold remains visible. An operator must reconcile the cost-guard reservation against provider usage before reporting the attempt and settling/refunding with the existing wallet commands. Do not clear reservations, force the row back to queued, or retry the provider blindly. This initial worker intentionally provides no unattended repair loop. Automatic retry/resume and operator recovery UI are future work.

On success, the quoted credits are charged and the source artifact is made available. The UI discloses this before approval. Provider costs are separately measured against the reserved budget. `builds.status=auditing` means source generation finished and release review is pending, not that the product is deployed.

Official API reference used for the provider adapter: https://developers.openai.com/api/reference/resources/responses/methods/create
