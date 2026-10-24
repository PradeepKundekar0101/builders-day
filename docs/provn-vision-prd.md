# Provn: Vision PRD

**Every build, proven.** Status: v1 draft, 24 Oct 2026. Owner: Product.

## 1. Problem

Non-coders and early builders can now generate apps with AI, but three things break on the way to production:

1. **Prompting is guesswork.** There are many ways to prompt and few produce a good result.
2. **AI loops burn time and money.** Agents create bugs, then spend long stretches fixing their own bugs, and the builder has no idea what a run will cost.
3. **Shipped apps are fragile.** Deploys are manual and apps go live with holes that attackers find first (the PHP and Railway-style incidents the team discussed).

## 2. Vision

One studio that takes an idea to a production-grade app: **Prompt > Platform > Production-grade.** Every build is routed to the right model, priced before it runs, attacked before it ships, and checked by humans where machines aren't enough.

We don't sell "cheaper" or "safer than X". We sell **proof**: each build comes with a record of what it cost, which models did the work, what was tested and what was attacked.

## 3. Who it's for

| Segment | Need | Onboarding path |
|---|---|---|
| Vibe coders / non-tech founders | Idea to live app without code | Plain English mode, guided templates |
| Indie devs and freelancers | Ship faster, control spend | Dev mode, bring-your-own key |
| Small product teams | Shared budgets, security sign-off | Team workspace, pooled credits |

**Primary ICP for the hackathon:** the vibe coder. Every P0 decision is judged by "does a non-coder get a live, attacked, priced app?"

## 4. Modules and priority

Confirmed from the whiteboard. P0 = in the demo and v1. P1 = after v1.

| # | Module | Priority | What it does |
|---|---|---|---|
| 1 | **Onboarding** | P0 | Sorts the builder into a category (non-tech, indie dev, team) and sets defaults: mode, budget cap, templates. |
| 2 | **Prompt Studio** | P0 | Guides the prompt. One click or hotkey turns a messy transcript or voice note into a structured prompt with done criteria. |
| 3 | **Cost Guard + Estimator** | P0 | Before a run, quotes tokens, time and money (in credits). Hard caps and a loop breaker stop runaway spend. |
| 4 | **Smart Router** (Provn Route) | P0 | Routes each task by effort and impact across three libraries: Lib 1 frontier, Lib 2 SLMs (Hugging Face), Lib 3 local (Gemma, Qwen). **Live:** https://provn-route.vercel.app |
| 5 | **Deployment** (Provn Launch) | P0 | End-to-end deploy: frontend, backend, database, env vars, domain. One click to a live URL. |
| 6 | **Audit + Security + Red Team** (Provn Shield / Siege) | P0 | Audits the code, runs automated red-team attacks, hardens the app. HITL: Guild security pros review high-risk findings. |
| 7 | **Loops + Evals + QA/QC agent** (Provn Loop) | P1 | Plan, build, verify, fix loop with evals and release scorecards. HITL: Guild testers do manual QA. |
| 8 | **Hang-on agent** | P1 | Working definition: an agent that stays with the builder after launch (watches the live app, flags breakage, proposes fixes). Needs team confirmation. |

**The Guild** (*HITL market*) is the shared human layer behind modules 6 and 7. Testers and security pros take bounties paid in credits; the platform keeps about 20%.

## 5. Critical decisions

1. **Security is the headline, not routing.** Router and Cost Guard are table stakes others will copy. "Your app was attacked before your users saw it" is the story judges remember. The demo ends on the Shield report.
2. **Loops + Evals is P1, but a thin eval gate ships in P0.** The whiteboard marks this module both P0 and P1. Decision: the full loop agent is P1. P0 ships only a pass/fail smoke check after deploy, which the Shield report needs anyway.
3. **HITL only where judgment matters.** Humans review red-team findings rated high or critical, and do final QA on request. Everything else is automated, so the Guild doesn't become a bottleneck or a cost the builder didn't expect.
4. **Cost Guard asks before it spends.** Any run over the builder's threshold (default 50 credits) needs an explicit approve. Credits come back when a run fails because of the platform.
5. **Router defaults to the cheapest model that passes.** Frontier models are used only when effort or impact is high, or the builder picks Max quality. Private mode forces Lib 3 (local).
6. **Hang-on agent is cut from the hackathon scope** until the team agrees on its definition. It's the only module without a clear user story.
7. **One wallet, one unit.** Everything (models, attacks, Guild testers, domains) is priced in credits.

## 6. Pricing and payments

1 credit = $0.01. **Payments through Pine Labs** (cards, UPI, net banking; INR pricing at checkout).

| Plan | Price | Includes |
|---|---|---|
| Pay as you go | from $1 ($1 = 100 credits) | No subscription, $1 minimum top-up, all features at standard rates |
| Free | $0 | 300 credits/month, cheaper models only, 1 project, privacy score |
| Builder | $20/mo | 2,500 credits, all models + routing, basic red-team run, domain buying |
| Pro | $50/mo | 7,000 credits, full red-team army, local LLMs + evals, harness connectors |
| Team | Custom | Pooled credits, SSO, audit logs, private deploy, seat billing |

Bring-your-own API key: pay the plan only, no token markup. Prices are a starting point to test, not researched.

## 7. Success metrics

| Metric | Target (v1) |
|---|---|
| Idea to live URL, non-coder | under 30 minutes |
| Estimate accuracy (Cost Guard) | within ±20% of actual credits |
| Spend saved by routing vs. frontier-only | 40%+ |
| Critical vulns open at launch | 0 |
| Free to paid (any top-up) | 10% |

## 8. Hackathon demo flow (P0 only)

Onboard as a non-coder > paste a rambling voice transcript > Prompt Studio turns it into a spec > Cost Guard quotes 180 credits, approve > Smart Router splits work across tiers > Launch deploys a live URL > Siege attacks it, finds an exposed key, Guild reviewer confirms, fix ships > Proof report: cost, models used, attacks blocked.

## 9. Out of scope (v1)

Mobile app (web first), native app stores, our own model training, enterprise on-prem.

## 10. Open questions

1. Hang-on agent: post-launch monitor, or something else?
2. Guild supply: who are the first 20 reviewers, and how are they vetted?
3. Pine Labs: USD billing or INR only at launch?
