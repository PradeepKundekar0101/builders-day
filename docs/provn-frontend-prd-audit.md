# PROVN frontend / Vision PRD coverage

Source: newly attached `provn-vision-prd(1).md`, v1 draft, 24 Oct 2026; byte-for-byte identical to the repository PRD. Rechecked against the current implementation. Audit scope: frontend screens, interaction gates and mock adapter flow. **This is not confirmation that the production platform is complete.**

## Coverage

| PRD module | Frontend status | Backend / release gap |
|---|---|---|
| P0 Onboarding | Persona picker for non-tech, indie and team; plain/dev mode; default hard cap 200; approval threshold 50; demo plan; local-only preference; BYOK preference. Settings travel in saved/exported drafts. | Real team membership, pooled-wallet policies, SSO, secure provider key vault and plan entitlements. |
| P0 Prompt Studio | Text and optional browser speech; examples; Cmd/Ctrl+Enter; progressively revealed stage-specific questions; editable canonical spec and done criteria; exact instruction view; reviewed handoff, JSON export, saved-draft list, version history and restore-as-draft. | Server-side Claude intake is implemented but credentials and live relevance tests are pending. Mock intake works offline. Browser transcription is provider-dependent. |
| P0 Cost Guard | Fixed demo quotes: Lean 90 / Standard 180 / Max 260; tokens/time/credits; module line items; explicit approval; hard-cap and balance checks; changed-input invalidation; simulated loop breaker and refund ledger. | Real feature-level estimator, token metering, server reservations/atomic debits, durable approval, runtime cap enforcement and platform-failure attribution. Lean is a fixture suggestion, not automatic feature removal. |
| P0 Provn Route | Task effort/impact, three libraries, selected tier, rationale; local-only mode; Free excludes frontier; Max quality exposes frontier on eligible demo plans; external team-router link. | Real routing API and evaluated cheapest-passing/Pareto selection. No benchmark, savings claim or real model execution. |
| P0 Provn Launch | Frontend/backend/database/env/domain readiness; simulated staging step; Live tab; real public publishing remains disabled. | Typed host build-event connector and isolated preview iframe are implemented, but no real engine is attached. Real build runtime, hosting/database provisioning, secret handling, domain purchase, live URL and server release gates. |
| P0 Shield / Siege | Synthetic critical/high findings, remediation details, Guild judgment gate, mocked retest and pass/fail smoke check. | Real audit/attack workers, staging target authorization, reviewed evidence, reviewer identity and fixes. No attacks actually run. |
| Shared Guild | High/critical findings gated on simulated reviewer confirmation; 25-credit allowance with 20/5 example split. | Reviewer onboarding/verification, real bounty acceptance, credit settlement and manual QA request workflow. |
| P0 Proof | Quote/spend/refund, task/model routing, finding state, reviewer and smoke state; JSON export with explicit `evidenceMode: simulated`, realDeployment=false, releaseApproved=false. | Signed execution records, measured attacks blocked and production security proof. |
| Wallet / payment | PRD plan comparison, single credit unit, demo balances/ledger, BYOK preference and minimum 100-credit top-up handoff. | Pine Labs checkout and actual INR quotes; no payments or account changes occur. Privacy score remains unavailable pending scanner. |
| P1 Loop / Hang-on | Explicitly shown as P1 / excluded. P0 retains only smoke pass/fail. | Full eval loops, release scorecards, tester workflow. Hang-on definition pending. |

## Demo walkthrough

1. Choose a home-screen example or enter 50+ characters; Shape my idea (or Cmd/Ctrl+Enter).
2. Complete onboarding as a non-tech builder. Default demo wallet: Free, 300 credits. Continue to dark workspace.
3. Answer the three guided questions. Open **Brief & prompts**, replace placeholder done criteria, review the instructions, check the review checkbox.
4. Open **Cost Guard**. Standard quotes 180 demo credits, above the 50-credit threshold. Approve, then Run approved simulation.
5. **Route** shows the task allocation. Private mode changes settings and invalidates the previous approval; review and reset/reapprove after settings changes.
6. **Launch**: simulate staging deployment. No real URL is created.
7. **Shield / Siege**: simulate attacks, Guild confirmation, remediation/retest, then smoke success. Smoke failure keeps proof blocked.
8. **Proof**: inspect and export the synthetic record. Fixture spend 168 credits after 12 unused credits are returned. The demo ends on proof, not routing.

The loop-breaker test is available after a build/staging step. It simulates three failed platform attempts and refunds the run exactly once. Reset demo run discards the local fixture lifecycle; it is not a real wallet operation.

## Validation

- 42 shared/web tests pass. New tests cover approval-before-build, hard cap, balance, Free-tier frontier restriction, changed-input invalidation, duplicate-charge prevention, Guild and smoke gates, one-time refunds and private-only routing.
- Next production build, TypeScript and web lint pass.
- Browser walkthrough passed: onboarding, three guided answers, brief review, 180-credit approval/build, staging, Guild confirmation, remediation, failed smoke blocking completion, successful smoke and proof export (168 spent / 12 refunded). Export flags confirm no real deployment, security testing or release approval. Desktop and 390px mobile layouts inspected.
- Frontend gates improve UX only. Real spend, model access, security status and release authorization must be revalidated by the backend. None of these browser states authorize real execution.

## Important scope limits

PRD pricing and success targets are unvalidated assumptions, labeled accordingly in the UI. Team credits are a demo fixture, not a real plan allocation. BYOK selection does not alter the fixed estimator; provider costs require a real estimator. No enterprise on-prem, native apps, own-model training or P1 agent implementation has been added. Existing sign-in work was preserved.


## Conversational integration added after the re-audit

The agent conversation remains the primary interface. A **Next step** card follows the current decision history and opens the relevant existing controls in the right panel. It never runs, pays, publishes or approves by itself. The sequence is brief review → estimate/approval → routing and run controls → private staging → security findings/Guild → remediation → smoke → Shield proof report. Changed requirements invalidate downstream demo evidence and redirect to fresh cost review.

A collapsed **Build essentials** disclosure gives access to all P0 support panels without replacing chat with a dashboard. It includes estimate/cap/approval threshold, wallet, deployment state, security state, proof readiness and unavailable privacy score. Untested security displays “Security not checked,” never a misleading zero-findings pass. P1 full Loop/manual QA and undefined Hang-on remain explicitly deferred.

### Completion boundary

Frontend module presence is covered; the PRD's production outcome is not yet met. Required integrations remain: real task generation/runtime, estimator/metering/credit reservations/refunds, evaluated routing, cloud deployment/secrets/domain, authorized security scanners and attack workers, verified Guild reviewer identities/payouts, Pine Labs, privacy scanner, and signed proof/evaluation records. A live non-coder app that is priced and attacked is still blocked on those services. Saved compiled-prompt versions do not constitute exact provider request audit logs.

### Verification

The save/resume integration passed authenticated desktop/mobile CI tests including idempotency, conflicts and owner isolation. New guidance tests verify cost approval after review, security/smoke before proof, and stale-evidence handling. Existing server-side auth/release/budget responsibilities remain unchanged; browser controls do not enforce production policy.
