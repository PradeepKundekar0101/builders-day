# Phase 6 - Dashboard, Metrics and Ops

PRD: F14 (P1), F15 (P2), "How efficiency is measured", optional follow-up agent.

## Goal

Every claim Buildwise makes is backed by logged raw numbers, and the team can run the day from one admin screen.

## User dashboard (F14)

"My apps": one card per idea with status, quoted $ and hours, actual model spend, audit status, and the live URL once released.

## Admin view (F15)

Visible to `role in ('operator', 'admin')` only.

- Approvals queue: flagged specs, budget overruns, audit overrides; approve or reject with a note.
- All builds: status, spend vs budget, retries, failures, worker heartbeat.
- Traction counters: signups, estimates generated, paid builds, released builds (the PRD success metrics).

## Metrics per build

Derived from `builds`, `build_events` and `quotes`, exposed as a SQL view `build_metrics`:

| Metric | Source |
|--------|--------|
| Quoted cost, quoted hours | `quotes` at lock time |
| Actual model cost | Agent SDK usage times list price |
| Harness wall-clock | claim to deploy done |
| Idea to live URL | idea `created_at` to release, including human waits |
| Tokens in context per turn | `telemetry` events |
| Retries and loops | `builds.retries` + audit attempts |
| Audit pass on first try | first `audits` row |

## Estimate re-tuning

After each real build, a script computes actual / quoted per feature mix and proposes new weights.
New weights are written as a new `weights_version`; existing quotes keep theirs.

## A/B protocol

`scripts/ab-run.ts <spec-fixture>` queues one `control` and one `buildwise` build on the same spec.
`scripts/ab-report.ts` prints the raw table (input tokens, output tokens, $ at list price, minutes, retries, audit result) and computes the saving from it.
No percentage is ever typed by hand; posts and the video quote this output with the baseline in the same sentence.

## Follow-up agent (optional)

Second AgenticOrg agent: messages users whose estimate is older than 2 hours and unpaid, using the same tool API pattern as Phase 1.

## Acceptance

- Dashboard shows quoted vs actual for every completed build.
- Operator can clear the approvals queue end to end from the admin view.
- A/B report runs on 3 specs and produces the raw table.
