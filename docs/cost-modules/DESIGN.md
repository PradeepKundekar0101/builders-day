# PROVN module design

Cost Guard follows the running Prompt Studio reference at `/prompt-studio-demo`, inspected on 24 October 2026. The orbital artwork and logo are reused directly from the local Prompt Studio source, not recreated. This change is presentation-only; estimator, wallet and provider enforcement APIs are unchanged.

## Reuse across modules

- Import `apps/cost-demo/app/provn-theme.css` in the module layout. It contains the shared background, surface, text, accent, border, radius, typography and shadow tokens.
- Reuse `apps/cost-demo/app/provn-logo.tsx` for the orbital P and spaced wordmark.
- Serve `apps/cost-demo/public/images/provn-orbit.jpg` at `/images/provn-orbit.jpg` in the host app.
- Load Inter normal/italic through `next/font`, using `--font-studio`. Fonts are self-hosted by Next.js after the build.
- Keep module-specific grids and sizing separate from theme tokens. The local demo's Prompt Studio navigation link targets port 3100; change this to the same-origin `/prompt-studio-demo` or production workspace route when embedding it in the main app.

## Visual rules

Use deep navy `#151c24`, translucent navy panels, warm white `#f3f0e9`, readable slate `#bbc3cc`, and warm gold `#e5bd8b`. Gold marks primary actions, key values and restrained italic headline accents. It must not be the only indicator of a warning or approval state.

Use the shared orbital image behind the workspace, with a dark overlay and sufficiently opaque panels so amounts remain legible. Use regular-weight type, generous spacing, rounded panels and pill-shaped actions. Keep pricing and usage numerals aligned and tabular.

Retain visible keyboard focus, associated input labels, native select controls, a skip link and text status labels. The layout stacks at 720px; actions wrap and touch targets remain at least 42px tall. Reduced-motion preference disables transitions. This revision was visually checked at desktop width; mobile device testing is not claimed.

## Validation

The local demo build, type checking and fixture test passed. Browser verification covered locking a 616-credit quote, explicit approval, reserving 616 from 2,500 credits, recording 65 provider-cost credits, and returning the customer hold after a simulated platform failure while preserving provider expense.

These reusable styles establish the reference for future module integration. They do not automatically restyle modules that have not imported them. No deployment or GitHub publication is part of this local design change.
