# Phase 1 - Intake and Estimator

PRD: F1, F2, F3, F4, F16, human approval point 1.
Signups open the moment this phase is live.

## Goal

Idea in plain words to a priced estimate with live feature toggles in under 60 seconds median.

## Flow

1. User (signed in) submits idea text (50 to 2,000 chars) and optional links.
2. Server masks secrets and PII in the text (Phase 3's masker package; the regex part is needed here already), stores the idea, and triggers the AgenticOrg intake agent.
3. The agent asks up to 4 clarifying questions.
   Questions appear in the Buildwise UI as a chat; answers go back to the agent.
   Every message is written to `intake_messages`.
4. The agent posts a spec through the Buildwise spec API.
   The server validates it with the Zod schema and rejects with a readable error if invalid, so the agent can retry.
5. Flagging rule (server-side, not trusted to the agent): flag if the spec has a Pine Labs payment integration, mentions third-party personal data, or its default estimate exceeds $25.
   Flagged specs create an `approvals` row and the user sees "A Buildwise operator is reviewing your estimate".
   Unflagged specs go straight to the estimate.
6. The agent fetches the quote through the estimator API and sends the estimate link to the user by email.

## AgenticOrg adapter

One interface in the server, two implementations chosen by env:

- `webhook`: Buildwise POSTs `idea.submitted` to the agent; the agent calls our tool endpoints.
- `poll`: the agent polls `GET /api/agent/ideas?status=submitted`.

Tool endpoints for the agent, authenticated with a shared bearer token, rate limited:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agent/ideas/:id/questions` | Ask the user a question |
| `GET /api/agent/ideas/:id/answers` | Read answers |
| `POST /api/agent/ideas/:id/spec` | Write the spec |
| `GET /api/agent/specs/:id/estimate` | Fetch the default estimate |

The agent prompt and config live in the repo (`agents/intake/`) so they are reviewable even though they run on AgenticOrg.

## Estimator (`packages/estimator`)

Pure function, no I/O, identical on client and server so toggles update instantly and the server re-computes for trust.

`Cost_$ = m * (sum_i w_i * t_i * p) + d + sum_j c_j`

Feature table (version `v1`, from the PRD):

| Feature | Tokens | Hours | Unit |
|---------|--------|-------|------|
| Static page | 15k | 0.25 | per page |
| CRUD entity with form and list | 60k | 0.75 | per entity, includes schema and RLS |
| Auth (email + Google) | 40k | 0.5 | once |
| File upload | 35k | 0.5 | once |
| Payment (Pine Labs) | 80k | 1.0 | once |
| Email notifications | 30k | 0.5 | once |
| AI feature | 50k | 0.75 | once, plus per-use cost shown separately |
| Admin dashboard | 70k | 1.0 | once |

Defaults: `p = $6 / 1M`, `m = 2.0`, `d = $1`, `w_i = 1.0`, `c_j = 0`, range +/- 30 %.
Output: `{ costUsd, lowUsd, highUsd, hours, modelBudgetUsd, drivers[] }` where `drivers` breaks cost into model tokens, deploy and integrations (F4).
Unit test anchor: 2 static pages + auth + 3 entities + payment = 330k tokens, $4.96, 4.25 h, inside the PRD's "$4 to $7 and 4 to 5 hours".
Weights and constants live in a versioned config row so Phase 6 can re-tune without a deploy.

## Estimate page

- Every spec item is a toggle; must-haves start on, nice-to-haves start off.
- Price, range, hours and drivers update within 300 ms (they update in one render; no network).
- "Approximate" label next to the price, always.
- Toggles persist to the draft quote (debounced).
- Share link `/e/:share_slug`: anyone sees the headline price and feature list; the drivers breakdown and toggles require sign-in (F16).

## Acceptance

- E2E: sign up, submit idea, answer questions, see estimate, toggle a feature, price changes, open share link signed out and see only the headline.
- E2E: an idea with a payment integration lands in the operator queue and releases after operator approval.
- Estimator unit tests cover every feature and the anchor case.
- Median idea-to-estimate under 60 s across 5 runs, logged.
