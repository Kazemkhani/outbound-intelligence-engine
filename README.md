# Outbound Intelligence Engine (OIE)

> An AI-native outbound sales platform: discover companies and people that match an ICP (including local SMBs via maps data), enrich them through a best-in-class provider waterfall, detect buying signals, score and rank every lead deterministically, and enrol the best into compliant multi-channel sequences (email + LinkedIn + WhatsApp) — governed by an operator control plane with a mandatory human approval gate before anything sends.

[![CI](https://github.com/Kazemkhani/outbound-intelligence-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Kazemkhani/outbound-intelligence-engine/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-258%20passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Licence](https://img.shields.io/badge/licence-proprietary-lightgrey)

---

## The core idea

OIE is a **conductor, a brain, and a cockpit** over an orchestra of specialist tools.

- **Buy the commodity, build the differentiator.** We do not try to out-build Clay's enrichment waterfall, Smartlead's deliverability, or LinkedIn's messaging rails. We integrate them. The engineering goes into the seams, the intelligence, the control plane, and the experience.
- **No vendor lock-in.** Every external service sits behind an adapter implementing a stable internal interface and feeding one normalised data model. Swapping a provider never touches the core.
- **Autonomy accelerates building, never sending.** The system builds and verifies unattended, but a human approves every live send. This gate is absolute and enforced in code.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and [`docs/adr/`](docs/adr/) for the decision records.

## What is built

The complete platform is implemented and green. The full programme (Phases 0–10) is delivered; the system is paused at the **live-send gate** (Human Gate 2) with `DRY_RUN` held on.

| Layer                        | What it does                                                                                            | Status |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| Deterministic scoring engine | Fit + intent-with-decay → composite → tier, fully explainable. Code computes the number, never the LLM. | ✅     |
| Enrichment waterfall         | Google Places, Apollo, Clay, Explorium behind one interface; the cascade and cost ceiling are ours.     | ✅     |
| Signal detection             | TheirStack, PredictLeads, Exa; dedup + central decay windows feeding intent.                            | ✅     |
| CRM sync                     | HubSpot find-or-create, two-way mapping, no duplicates.                                                 | ✅     |
| Control plane                | Next.js: ranked leads, ICP editor with live re-rank, signal feed, approval queue, analytics.            | ✅     |
| Sequencing + send gate       | Durable cadences; every send routes through the DRY_RUN + approval gate.                                | ✅     |
| Channels                     | Smartlead (email), Unipile (LinkedIn + WhatsApp), off by default, gated.                                | ✅     |
| Personalisation + evals      | Claude turns the exact signal into a reviewed opener; eval harness with labelled cases.                 | ✅     |

**Evidence:** `pnpm verify` → 24/24 tasks, 258 tests. Security + verifier audits pass on the safety posture (no committed secrets, no send-path bypasses the gate). The pilot dry-run runs the whole pipeline and prints _"anything sent? NO ✓ (all gated)."_

## Build vs buy

| Build (owned differentiation)                 | Buy (integrated rails)                 |
| --------------------------------------------- | -------------------------------------- |
| Orchestration brain (Inngest)                 | Enrichment: Clay, Apollo, Explorium    |
| Deterministic ICP scoring engine              | Local discovery: Google Places         |
| Operator control plane                        | Signals: TheirStack, PredictLeads, Exa |
| Unified data model + anti-corruption adapters | Email: Smartlead                       |
| Personalisation + signal-action engine        | LinkedIn + WhatsApp: Unipile           |
| Eval + observability layer                    | CRM: HubSpot · LLM: Anthropic Claude   |

## Repository layout

```
apps/
  web/                  Next.js operator control plane (dashboard + API)
packages/
  config/               Env loading + validation (fail fast)
  core/                 Domain types, Zod schemas, the scoring engine (pure)
  db/                   Prisma schema (the unified data model), migrations, seed
  integrations/         Anti-corruption adapters + the 5 stable interfaces
  orchestration/        Waterfall, signal collection, send gate, sequencing, enrolment
infra/                  docker-compose (Postgres), deploy notes
scripts/                Evidence scripts (gate-1 credentials, signal demo, pilot)
docs/                   Architecture, ADRs, handoff, production checklist
.claude/                The autonomous engineering team: 12 specialists, skills, hooks
```

## Quickstart

```bash
pnpm install
pnpm infra:up        # Postgres on Colima/Docker
pnpm db:migrate      # apply migrations
pnpm db:seed         # seed the ICP
pnpm verify          # typecheck + lint + test + build (must be green)
pnpm --filter web dev   # control plane at http://localhost:3000
```

Or simply `make setup && make dev`.

### Evidence scripts (no live calls — fixtures + local DB)

```bash
pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts      # which provider keys are present
pnpm exec tsx --env-file=.env scripts/phase4-signals-demo.ts    # a signal scan moves the intent score
pnpm exec tsx scripts/phase10-pilot-dryrun.ts                   # full pilot — proves nothing sends
```

## Working from any device

This repository is built to be picked up with Claude Code from anywhere:

- The `.claude/` directory is committed — a fresh clone already has the **12 specialist agents**, skills, slash commands, and the **safety guard hook**.
- A **devcontainer** is included, so you can open the repo in GitHub Codespaces and run Claude Code in the browser with zero local setup.
- `CLAUDE.md` is the lean project memory loaded every session; `docs/HANDOFF.md` is the complete continuity brief.

## Safety model (do not weaken)

Nothing sends on any channel without **both** `DRY_RUN` disabled **and** an explicit human approval for that specific action. This is enforced in `packages/orchestration/src/send-gate.ts`, as a deny rule plus a `PreToolUse` hook in `.claude/`, never as a remembered instruction. LinkedIn and WhatsApp carry a third gate: the channel must be explicitly enabled (off by default). See [`SECURITY.md`](SECURITY.md) and [`RUNBOOK.md`](RUNBOOK.md).

## Going to production

The control plane deploys to Vercel, durable workers to Inngest Cloud, Postgres to Neon, errors to Sentry. The full, sequenced path — including the pre-live wiring and deliverability setup — is in [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md). Deployment runs in dry-run until the live-send gate is explicitly approved.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design at depth
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/HANDOFF.md`](docs/HANDOFF.md) — complete build history + how to continue
- [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) — the path to live
- [`RUNBOOK.md`](RUNBOOK.md) — operations + incident response
- [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) — the original decisions-locked programme
- [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md)

## Licence

Proprietary — © 2026 Amir Kazemkhani. All rights reserved. See [`LICENSE`](LICENSE).
