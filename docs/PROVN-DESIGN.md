# PROVN Design Brief

Version: 0.1 concept proposal  
Date: 24 October 2026  
Product source: `/Users/reshmabaskran/Downloads/provn-vision-prd.md` (v1 draft)  
Status: Proposed design direction, not an implemented or validated product specification.

## 1. Product and design intent

**PROVN. Every build, proven.**

PROVN is a proposed web studio that guides builders from an idea to an app, with upfront cost estimates, model routing, deployment, security testing, and a record of the work performed. The primary v1 audience is the non-technical builder.

Make the first step approachable, the cost visible, and the evidence inspectable. Security is the central product story. Model routing supports that story rather than dominating the interface.

The design should feel cinematic, calm, precise, and substantial. Use the reference image's charcoal atmosphere, warm light, reflective surfaces, architectural forms, and fine typography. Replace its creative-agency navigation and copy with a practical product experience.

## 2. Source and evidence boundaries

- The PRD describes intended scope. It does not establish that the capabilities are implemented.
- Pricing is explicitly provisional. Do not present it as confirmed commercial pricing without review.
- Success metrics are targets, not performance claims.
- A completed scan means the listed checks ran. It does not establish that an app is vulnerability-free.
- Use illustrative data only in clearly labelled demo states.
- Distinguish estimated cost, approved budget, reserved credits, and actual spend.
- Show human review as requested, pending, in progress, or completed only when supported by the underlying state.

## 3. Recommended visual direction

Combine three concepts into one coherent experience:

| Surface | Direction | Purpose |
| --- | --- | --- |
| Landing page | Portal | An illuminated architectural opening represents the transition from an idea into a working product. |
| Builder | Horizon | A spacious guided flow makes one decision at a time clear. |
| Proof report | Monolith | A structured layout makes costs, checks, findings, and review outcomes easy to inspect. |

Keep architecture and atmospheric imagery prominent on marketing surfaces. In the workspace, use mostly solid surfaces, quiet dividers, and compact status elements. Never put essential controls over visually busy artwork.

### Five exploration directions

1. **Portal:** Left-aligned product promise and prompt input, with a luminous stone arch on the right. Closest to the supplied reference.
2. **Orbit:** Centered entry composition with bronze orbital forms. In the workspace, translate the metaphor into a simple linear progress indicator rather than a decorative circular navigation system.
3. **Monolith:** Strong column structure for brief, preview, and evidence. Most suitable for detailed review on a wide desktop.
4. **Horizon:** Wide negative space and a curved path. Best suited to a guided, one-step-at-a-time builder.
5. **Sculpture:** A dominant sculptural object for a product introduction, followed by an app preview and proof summary. Replace portfolio project galleries with relevant product evidence.

These are alternatives for exploration, not five different visual systems to mix indiscriminately.

## 4. Visual foundations

### Color tokens

Proposed starting values. Verify contrast in implementation.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#151C24` | Main canvas |
| `surface` | `#1D2630` | Panels and cards |
| `surface-raised` | `#27323E` | Menus, dialogs, selected regions |
| `border` | `#3C4855` | Quiet visual separators |
| `text-primary` | `#F3F0E9` | Headings and important values |
| `text-secondary` | `#BBC3CC` | Body text and supporting labels |
| `accent` | `#E5BD8B` | Main actions, focus, selected state |
| `accent-text` | `#171D25` | Text on filled accent buttons |
| `success` | `#9BC8B1` | Completed checks |
| `warning` | `#E4BD76` | Attention and pending decisions |
| `danger` | `#EF9B99` | Failures and high-risk findings |

Do not use color alone to communicate status. Pair each status with a label and an icon. Use stronger boundaries where necessary to distinguish interactive controls.

### Typography

- Use a clean sans-serif such as Inter, with system sans-serif fallbacks.
- Marketing headlines: 56–80 px desktop, 36–44 px mobile; weight 300–400; line height 1.08–1.15.
- Product headings: 24–32 px; weight 500–600.
- Body text: 16 px; line height 1.5–1.6.
- Compact labels: 13–14 px; avoid tiny or widely tracked text for essential information.
- Use tabular numerals for costs, durations, and counts.
- Reserve monospace for technical evidence and code.
- The PROVN wordmark may use modest letter spacing. Do not apply logo tracking to paragraphs or form controls.

### Spacing and shape

- Base spacing unit: 4 px. Main spacing scale: 8, 12, 16, 24, 32, 48, 64, 96 px.
- Marketing content width: approximately 1200–1280 px.
- Desktop page gutters: 48–64 px. Mobile gutters: 20–24 px.
- Inputs and panels: 12–16 px corner radius. Smaller controls: 8 px.
- Prefer fine borders and subtle tonal separation to heavy shadows.
- Use circular arrow controls as a restrained reference motif, always with an accessible label.

### Texture and imagery

- Charcoal stone, muted bronze, peach sunlight, mist, and gently reflective water.
- Use a single focal architectural form per scene.
- Add subtle grain to artwork only. Avoid grain over text, inputs, charts, and code.
- Avoid neon cyber-security motifs, padlock wallpaper, excessive glass effects, and decorative metric cards.
- Keep image text separate from the artwork in the implemented site. All headings, buttons, and labels must be native HTML.

## 5. Landing page

### Header

Left: PROVN wordmark.  
Right: How it works, Proof, Sign in, Start a build.

Add Pricing only when the offer and billing terms are approved. On mobile, keep the primary action visible and collapse secondary links.

### Hero

**Headline:** Every build, proven.

**Supporting copy:** Turn your idea into an app with a clear budget, guided building, and security checks you can inspect.

**Prompt label:** What do you want to build?

**Placeholder:** Describe your app, who it is for, and what it should do.

**Primary action:** Shape my idea

**Secondary action:** Explore a sample proof report

Use this as concept copy until the corresponding capabilities exist. A sample report must be labelled as a sample. Do not imply that submitting an idea begins a paid run.

Layout: text and prompt entry on the left, architectural portal on the right. A dark gradient protects readability. On mobile, put the input before the decorative image.

### Supporting sections

1. **From idea to evidence:** Explain brief creation, cost approval, building, deployment, and security review in plain language.
2. **Know the cost before you run:** Illustrate an estimate, budget cap, and approval boundary. Clearly distinguish example values from real quotes.
3. **Inspect what was checked:** Show a sample Shield report with check scope, findings, review status, and unresolved items.
4. **A record for every build:** Preview actual-spend, model-use, and test-history sections.
5. **Start with your idea:** Repeat the primary action without adding another competing conversion path.

Do not add unverified customer logos, testimonials, savings percentages, security guarantees, or fabricated usage counts.

## 6. Builder workspace

### Shell

- Header: project name, saved state, available credits, and account menu.
- Progress: Brief → Estimate → Build → Deploy → Security review → Proof.
- Main region: the current task and its primary action.
- Context region: app preview, cost summary, or relevant evidence.
- Secondary drawer: technical logs and model details for builders who want them.

The PRD demo deploys before running Siege. Do not label the deployment security-reviewed before that review completes. Clearly distinguish a deployed URL from a reviewed release. Whether pre-review deployments are private previews requires a product decision.

### Onboarding

Ask what the user wants to build and their experience level. Offer non-technical builder, developer, and team paths. Explain how the selection changes guidance. Introduce budget controls without requiring technical model choices.

### Prompt Studio

- Accept a typed idea or pasted transcript. Expose voice capture only if implemented.
- Turn the input into an editable brief: audience, main tasks, required screens, constraints, and done criteria.
- Show assumptions explicitly and let the builder correct them.
- Primary action: Review estimate.
- Keep the original input accessible and preserve edits when moving between steps.

### Cost Guard

- Present estimated credits and time before a paid run.
- Show what is included, uncertainty, the budget cap, and the approval threshold.
- PRD default approval threshold: 50 credits. This remains a proposed product default.
- Primary action: Approve and build, accompanied by the actual estimate and cap.
- Explain whether an action starts spending. Do not hide this in tooltip text.
- For a blocked or looping run, show spend to date, why it stopped, and the options to inspect, revise, or approve a new estimate.
- Describe refunds according to confirmed billing policy and actual refund state.

### Build

- Show understandable task names and the current activity.
- Show actual spend alongside the approved budget.
- Reveal model details on demand rather than making users interpret model tiers.
- Avoid invented progress percentages. Use completed task counts or explicit stage status when progress cannot be measured.
- Provide clear stopped, failed, retrying, and completed states.

### Deploy

- Present frontend, backend, database, configuration, and domain readiness in a compact checklist.
- Never display secret values in logs or screenshots.
- Explain blockers and preserve the working build when deployment fails.
- Show a live link only after deployment is confirmed.
- Keep deployment status separate from smoke-check and security-review status.

### Shield and Siege

- Summarize checks run, findings by severity, incomplete checks, and human review status.
- Explain each finding in plain language with technical evidence available beneath it.
- Show the affected build, finding time, remediation state, and retest result.
- High and critical findings should visibly surface the required human-review state described in the PRD.
- Never use an all-clear badge when relevant checks are skipped, incomplete, or awaiting review.
- Let users distinguish an automated result from a human assessment.

## 7. Proof report

The proof report is the central product artifact. It should read like an inspectable record, not a promotional scorecard.

### Report header

- Project and build identifier.
- Environment and deployment URL, when available.
- Report timestamp and the build revision assessed.
- Separate deployment, smoke-check, security-check, and human-review statuses.

### Report sections

1. **Cost:** Estimate, approved cap, actual credits spent, and any confirmed refunds.
2. **Models:** Tasks performed, models used, and available usage evidence.
3. **Checks:** Test names, scope, outcomes, and checks not performed.
4. **Findings:** Severity, explanation, affected area, remediation, and retest evidence.
5. **Human review:** Requested scope, status, reviewer attribution where appropriate, and recorded conclusion.
6. **Open items:** Remaining risks, failed checks, pending reviews, and next actions.

Prefer precise language such as “No critical findings detected in the completed checks” over “Your app is secure.” Do not claim attacks were blocked when the evidence only shows that tests were executed.

## 8. Core components and states

| Component | Required states |
| --- | --- |
| Prompt composer | Empty, editing, processing, generated brief, error, restored draft |
| Estimate card | Loading, ready, unavailable, changed, approval required |
| Budget indicator | Within cap, nearing cap, cap reached, reconciliation pending |
| Stage indicator | Upcoming, running, completed, failed, blocked, skipped |
| Preview panel | Preparing, available, stale, unavailable |
| Finding row | Open, fixing, retest pending, resolved, review pending |
| Human review card | Not requested, requested, assigned, in progress, completed |
| Report summary | Partial, checks complete, action required, superseded by newer build |

Every failure state should explain what happened, what is preserved, and what the user can do next. Do not erase the idea or brief after an error. Success labels must reflect confirmed backend state.

## 9. Responsive behavior and accessibility

- Desktop: two main regions, with a third evidence column only when enough space is available.
- Tablet: stack supporting panels below the current task or use clearly labelled tabs.
- Mobile: a single-column guided flow with the current stage, cost, and primary action visible.
- Meet WCAG AA contrast requirements in the final implementation. Validate text and control boundaries separately.
- Support keyboard navigation, visible focus, semantic headings, labelled inputs, and screen-reader status announcements.
- Use touch targets of at least 44 × 44 px where practical.
- Respect reduced-motion settings. Avoid continuous parallax and animated backgrounds in the workspace.
- Use short 150–250 ms transitions for interface state changes. Animation must never delay access to a control or hide a result.

## 10. Scope

### P0 design coverage

Onboarding, Prompt Studio, estimate and budget approval, routing visibility, build progress, deployment, post-deploy smoke check, security findings, human-review status, and proof report.

### P1 and deferred work

Full loop/evaluation agent, release scorecards beyond the thin P0 gate, and requested manual QA flows should be treated as later scope. The hang-on agent is excluded from the hackathon flow until its definition is agreed. Do not show deferred capabilities as working features.

### Product decisions still needed

- Visibility and exposure of the first deployment before security review.
- Exact release-blocking rules for findings and incomplete checks.
- Reviewer availability, assignment process, turnaround expectations, and vetting.
- Confirmed pricing, payment currency, credit reservation, and refund behavior.
- Which proof-report evidence is downloadable or shareable, and its access controls.

## 11. Design acceptance criteria

- A non-technical user can identify the first action without understanding models or infrastructure.
- The user sees an estimate and the relevant approval controls before starting paid work.
- Spend, progress, and blockers remain understandable throughout a build.
- Deployment success cannot be mistaken for completed security review.
- The proof report separates verified outcomes from incomplete checks and pending judgments.
- Marketing imagery never compromises control readability or workspace performance.
- All concept data is visibly labelled. No provisional pricing or target metric appears as a verified result.
- The complete flow works on mobile and with a keyboard.

## 12. Existing concept references

The following image explorations establish mood and composition only. They contain generic STUDIO branding and must be adapted for PROVN.

- [Portal](../website-design-variations/01-portal.png)
- [Orbit](../website-design-variations/02-orbit.png)
- [Monolith](../website-design-variations/03-monolith.png)
- [Horizon](../website-design-variations/04-horizon.png)
- [Sculpture](../website-design-variations/05-sculpture.png)

These are raster mockups, not implemented interfaces or production assets.
