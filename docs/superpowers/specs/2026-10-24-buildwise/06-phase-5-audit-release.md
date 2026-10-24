# Phase 5 - Audit and Release

PRD: F12, F13, S1, S2, S5, S6, S8, human approval point 4.
For the P0 demo, checks 1 and 2 are mandatory; 3 and 4 are P1.

## Goal

A read-only checklist over the deployed app and its Supabase project gates the URL.
Failures loop back to the build as a fix list; the user releases on pass or with an explicit override.

## Checks

The audit never writes to the generated app's data and never attempts exploits.

| # | Check | How | Remedy text on fail |
|---|-------|-----|---------------------|
| 1 | RLS on every table (S1) | Management API SQL: every table in `public` has `relrowsecurity = true` and at least one policy per command using `auth.uid()` | "Table X has no owner policy for Y; the build will add one." |
| 2 | No service key in bundle (S2) | Fetch the HTML and every JS chunk it references; find JWT-shaped strings, decode, fail on `role = service_role`; also search for the project's actual service key | "A server-only key was found in the browser bundle; it will be moved to the server." |
| 3 | Writes need a session (S5) | Policy inspection: insert, update and delete policies apply to `authenticated` only and check `auth.uid()`; static scan of server actions for a session check | "Writes to X are allowed without sign-in." |
| 4 | Security headers (S6) | HEAD the URL; CSP, HSTS, X-Frame-Options, Referrer-Policy present and sane | "Header X is missing." |

Results are stored in `audits.results` as `{ id, status: "pass" | "fix", detail, remedy }[]` (S8).

## Loop

- All pass: build `released`, URL shown.
- Any fix: the fix list is sent back to the harness as a new turn (`building_fix`), then redeploy and re-audit.
  RLS and headers are expected to auto-fix this way (PRD risk mitigation).
- After 2 fix loops still failing: the user sees the pass/fix list and two buttons: "Release anyway" (with the warning listing failed checks) or "Ask Buildwise to fix".
  "Release anyway" records an `approvals` row (`audit_override`) and sets `audits.overridden = true`.

## UI

- Audit card on the build page: one row per check, green pass or amber fix with the remedy line.
- The URL is not shown, rendered, or present in any API response before release.

## Acceptance

- A clean fixture build passes all 4 checks and releases.
- A fixture with RLS deliberately removed fails check 1, auto-fixes, re-audits, passes.
- A fixture with the service key injected into a client file fails check 2.
- The override path records who overrode and when.
- API test: a user cannot fetch `deployments.url` before release.
