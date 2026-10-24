> Updated 24 October: email links are the selected login route. See [current flow status](provn-live-flow-status.md). Recovery now uses same-origin localStorage to support new tabs; the historical same-tab details below describe the initial implementation.

# Google login and Prompt Studio draft return

This change reuses the existing Supabase Google OAuth flow. It does not introduce a new identity provider or change hosted authentication configuration.

## Flow

Authenticated entry is `/apps/new`: signed-out visitors first reach `/signin`, then return to Prompt Studio. The public demo remains available. From the demo, Sign in and Save draft preserve the current idea, shaped draft, answers, unfinished spec editor text, onboarding preferences and unsent chat message before opening the existing login page.

Only a random recovery UUID is added to the `next=/apps/new?resume=...` URL. Draft contents stay in this tab's sessionStorage, expire after 24 hours, and are cleared after an explicit successful server save. Recovery requires the same tab and origin. Closing the tab, clearing storage, using another device or changing origins does not preserve that snapshot; Export brief remains the portable backup. Storage errors prevent navigation and ask the user to export/copy work first.

The Google callback exchanges the authorization code for the Supabase session and preserves the destination on both success and failure. Existing sessions respect `next` instead of always opening My apps. The sign-in page includes Back to my draft, so cancellation does not strand the work. Returning does not automatically save to a possibly different account, reinstate approval, start paid AI, or run the build simulation. Review and explicit save/resume are required.

## Verification

- 37 web tests passed, including storage round trips for raw and shaped ideas, expiry/storage failures, opaque destinations, successful OAuth callbacks, failed/cancelled callbacks, existing-session routing and signed-out redirects. Supabase responses are mocked in these tests.
- Browser verified raw idea -> sign-in -> Back to my draft, and shaped brief + unsent message -> sign-in -> restored workspace with progression paused.
- Web build, type checking and lint passed locally (Node 24.19.0/pnpm 11.25.0; repository still requests its pinned versions).
- No real Google account consent or hosted Supabase exchange was performed. The isolated localhost:3102 preview uses placeholder configuration. It is not a working live login environment.

For the final live test, deploy this branch to an approved environment with the existing Supabase configuration. NEXT_PUBLIC_SITE_URL must match the browser origin, and Supabase must allow that callback URL. In the same tab, create a draft, leave an unsent message, choose Save draft, complete Google sign-in, verify the restored workspace, explicitly save, then reload its server session URL. Repeat with an existing session and a cancelled login. Do not put client secrets in public environment variables.

The production sequence is sign-in -> idea entry -> clarification -> shaped scope/estimate -> user approval -> build workspace. Actual paid product generation still requires the production router and worker; the current preview is a simulation.
