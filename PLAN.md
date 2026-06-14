# OIE — Build plan & progress log

> Decisions are locked in PROJECT_BRIEF.md (§13). This file tracks the phased plan, per-phase acceptance criteria, and what is done. Update after every slice so a fresh session resumes with zero re-explanation.

## Run posture

- Permission mode: auto (classifier is the safety layer). DRY_RUN defaults true; never auto-flipped.
- Parallelism: native git worktrees for Streams A–D (Phases 3–6), cap ≤4 concurrent (10-core / 16 GB box).
- Verify before claiming done; show evidence. Acceptance is phrased around printed evidence (addendum §4).
- Human gates (§3.4): (1) credentials checkpoint after Phase 1; (2) live-send approval before DRY_RUN=false. Stop only there.

## Dependency graph

```
Phase 0 ─▶ Phase 1 ─▶ Phase 2 ─┬─▶ Stream A: Phase 3 (discovery+enrichment)
                                ├─▶ Stream B: Phase 4 (signals)
                                ├─▶ Stream C: Phase 5 (CRM sync)
                                └─▶ Stream D: Phase 6 (control plane)
                       converge ─▶ Phase 7 (sequencing+email+send gate)
                                ─▶ Phase 8 (LinkedIn+WhatsApp, gated)
                                ─▶ Phase 9 (signal-triggered enrolment + hardening)
                                ─▶ Phase 10 (productionisation + pilot) ─▶ Human Gate 2
```

---

## Phase 0 — Autonomous bootstrap — ✅ DONE

- SPEC.md (self-contained, names files/interfaces, seed ICP, e2e verification scenario).
- Lean CLAUDE.md (§9.1); this PLAN.md; .env.example (§10.3).
- 12 specialist subagents (.claude/agents/\*), 4 skills, 2 slash commands (/verify-phase, /ship-phase), hooks (.claude/settings.json).
- **Acceptance:** all artefacts exist; no app code yet. ✅

## Phase 1 — Foundation — ✅ DONE (at Human Gate 1)

Monorepo (pnpm + Turborepo), TS strict, packages (config/core/db/integrations/orchestration), Prisma unified schema (§10.2) + Postgres (Colima/Docker) + migrate + seed (incl. seed ICP), env validation (fail fast), lint/typecheck/test/build + CI + hooks, the adapter interfaces + the DRY_RUN send gate.

- **Acceptance MET:** `pnpm verify` exit 0 (20/20 turbo tasks, 41 tests pass); `init` migration applied (14 tables); `pnpm db:seed` printed the seeded ICP and is idempotent (1 row on re-run). verifier subagent returned PASS.
- **Human Gate 1 reached (credentials checkpoint, §3.4).** `scripts/gate1-credentials.ts` reports: DRY_RUN=true; caps LLM $25/day, providers $50/day; **0/17 provider keys present, 17 missing**. Per §3.4 this does NOT block — Phase 2 (scoring, no keys needed) and keyless fixture-tested adapters proceed; live verification of each adapter is queued for when its key arrives.

## Phase 2 — ICP + scoring engine (pure core) — ✅ DONE

Deterministic `scoreLead(subject, icp, now)` in @oie/core: fit (industry, employees, geography w/ haversine, local category, revenue, technographics, people, keywords), intent (signals with linear decay + diminishing-returns combine), composite blend, A/B/C/D tiering, explainable rationale + coverage; `rankByComposite`. `now` injected — never reads the clock.

- **Acceptance MET:** 28 core tests incl. determinism, tier-A perfect lead, all-unknown=0 fit, expired-signal=0 intent, decay halves at mid-window, avoided-tech disqualify, deterministic ranking. `pnpm verify` exit 0.

## Phases 3–6 — parallel Streams A–D — 🟡 Stream A substantially done; B/C/D TODO

- **A (Phase 3): 🟡 mostly done.** Places (discovery, reference adapter), Apollo, Clay (async webhook enqueue + inbound parser), Explorium (match→enrich) — all behind `EnrichmentProvider`, keyless + fixture-tested via an injectable HTTP transport seam (no live calls in CI). The **waterfall** (`enrichCompanyWaterfall`) lives in our core: priority order, fill-missing with per-field provider attribution, early-stop on completeness (cost ceiling), fall-through on error, skip unconfigured. Plus the scoring-bridge + an e2e pipeline test (discover→dedupe→enrich→score→rank). verifier PASS. **Remaining A:** LLM extraction step (structured output) + its eval set; live verification once keys land.
- B (Phase 4): TheirStack + PredictLeads + Exa on scheduler; signal scoring with decay → intent.
- C (Phase 5): HubSpot find-or-create, two-way mapping, REST; MCP for reads.
- D (Phase 6): control plane — leads view, ICP editor w/ live re-rank, signal feed, approval queue UI, analytics shell; `apps/web` (Next.js) created here.

## Phase 7 — Sequencing + email + send gate — ⬜ TODO

Inngest cadences (steps/delays/branch/stop-on-reply); wire DRY_RUN gate + approval queue FIRST; Smartlead adapter; limits/rotation/suppression/unsubscribe; LLM personalisation.

- **Acceptance:** multi-step email sequence runs e2e in dry-run; respects limits/idempotency; nothing sends without approval.

## Phase 8 — LinkedIn + WhatsApp (gated) — ⬜ TODO

Unipile adapter; channels OFF by default; approval queue mandatory; conservative human-like limits; WhatsApp via Business Platform/consent; unified reply sync stops sequences on reply.

## Phase 9 — Signal-triggered enrolment + hardening — ⬜ TODO

Auto-enrol on qualifying fresh signals (through the gate); cost caps enforced; audit-log review; load/limit testing; RUNBOOK.md.

## Phase 10 — Productionisation & pilot — ⬜ TODO

Deploy (Vercel web + Inngest Cloud workers + Neon Postgres + Sentry); secrets vault; monitoring/alerts; backups; cost dashboards; pilot dry-run against seed ICP. **Then Human Gate 2** (live-send approval).

---

## Progress log

- 2026-06-14 — Phase 0 complete: bootstrap artefacts, specialist cast, scaffolding.
- 2026-06-14 — Phase 1 complete: foundation green (verify exit 0, 41 tests), DB migrated + seeded, verifier PASS. Stopped at Human Gate 1 — awaiting provider credentials (.env) before live adapter verification.
- 2026-06-14 — Operator chose to proceed past Gate 1 (DRY_RUN stays true; no secrets). Phase 2 scoring engine complete (verifier PASS). Stream A enrichment adapters + waterfall + scoring-bridge + e2e pipeline complete, all fixture-tested keyless (verifier PASS). `pnpm verify` exit 0, 81 tests. Next: Stream A LLM extraction + eval set, then Streams B/C/D — or live-verify adapters once keys are in .env.
