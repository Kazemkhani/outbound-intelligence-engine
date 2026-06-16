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
- **B (Phase 4): ✅ mostly done.** TheirStack (hiring + tech_adoption), PredictLeads (events→funding/hiring/job_change/tech/news), Exa (news; drops undated results) — all behind `SignalProvider`, keyless + fixture-tested. `collectSignals` owns the fan-in: cross-provider + re-pull dedup (signalDedupeKey, keep-stronger), skip unconfigured, continue past errors, central decay-window assignment (`signalExpiry`/`DEFAULT_SIGNAL_TTL_DAYS`). verifier PASS (one double-count bug found + fixed). DB demo proved a stored dated signal moves intent 0→33.6. **Remaining B:** Inngest scheduler to run scans periodically; live verification once keys land.
- C (Phase 5): HubSpot find-or-create, two-way mapping, REST; MCP for reads.
- D (Phase 6): control plane — leads view, ICP editor w/ live re-rank, signal feed, approval queue UI, analytics shell; `apps/web` (Next.js) created here.

## Phase 7 — Sequencing + email + send gate — ✅ DONE

Sequence state machine (steps/delays/branch/stop-on-reply); `executeSendStep` routes EVERY send through `evaluateSendGate` (gate wired first); Smartlead `EmailSender` (dry-run = zero network); suppression check before gate; idempotency keys; Inngest durable function defs; LLM personalisation cites the exact signal. CAN-SPAM/GDPR unsubscribe + sender identity in the email path.

- **Acceptance MET:** sequencing tests + pilot prove a multi-step cadence runs in dry-run, respects idempotency, and nothing sends without approval.

## Phase 8 — LinkedIn + WhatsApp (gated) — ✅ DONE

Unipile `MessagingChannel` (LinkedIn + WhatsApp); dry-run honoured (zero network); channels OFF by default (`channelEnabled` + `ChannelAccount.enabled=false`); conservative limits (weeklyConnectLimit 80 < ~100); `parseUnipileWebhook` for reply sync.

## Phase 9 — Signal-triggered enrolment + hardening — ✅ DONE

`qualifiesForEnrolment` (fresh + at-bar + qualifying type, through the gate); `costCapStatus`/`assertWithinCaps` halt on cap breach; RUNBOOK.md.

## Phase 10 — Productionisation & pilot — ✅ DONE (at Human Gate 2)

RUNBOOK.md, infra/deploy.md (Vercel + Inngest Cloud + Neon + Sentry), pilot dry-run script. Security + verifier audits PASS on the safety posture. **Stopped at Human Gate 2** — DRY_RUN held; no live send.

---

## Pre-live checklist (before Human Gate 2 flips email live)

These are scaffolded + unit-tested but must be wired into the durable runtime with live keys (none break the gate; nothing sends without it):

1. Wire `shouldStop` to real reply/bounce events in `sequencing/inngest.ts` (currently `events: []`).
2. Call `assertWithinCaps` before LLM/provider operations in the running pipeline.
3. Add the Inngest function that turns a qualifying signal into an `Enrolment` row (auto-enrol is decision-only today).
4. On hard bounce / unsubscribe webhook, write a durable `Suppression` row.
5. Confirm SPF/DKIM/DMARC for every sending domain; mailboxes warmed; suppression list loaded.
6. Live-verify each adapter against its provider once keys are in `.env`.

---

## Progress log

- 2026-06-14 — Phase 0 complete: bootstrap artefacts, specialist cast, scaffolding.
- 2026-06-14 — Phase 1 complete: foundation green (verify exit 0, 41 tests), DB migrated + seeded, verifier PASS. Stopped at Human Gate 1 — awaiting provider credentials (.env) before live adapter verification.
- 2026-06-14 — Operator chose to proceed past Gate 1 (DRY_RUN stays true; no secrets). Phase 2 scoring engine complete (verifier PASS). Stream A enrichment adapters + waterfall + scoring-bridge + e2e pipeline complete, all fixture-tested keyless (verifier PASS). `pnpm verify` exit 0, 81 tests.
- 2026-06-14 — Installed context7 + claude-code-setup plugins. Stream B signals complete: TheirStack/PredictLeads/Exa SignalProvider adapters + collectSignals (fan-in/dedup/decay) + DB demo (intent 0→33.6). verifier PASS after fixing a tech_adoption double-count. `pnpm verify` exit 0, 148 tests.
- 2026-06-16 — Repo live on GitHub (private). Control plane DEPLOYED to Vercel production (https://web-five-kappa-67.vercel.app), git-connected → auto-deploy on push.
- 2026-06-16 — PRODUCTION HARDENED autonomously: Neon Postgres provisioned + connected + migrated + seeded; Inngest durable workers provisioned (keys injected) + /api/inngest serve route; Auth.js operator login protecting the whole dashboard (/ -> /signin verified live); Stage-4 runtime wired (stop-on-reply from DB, cost caps, autoEnrolOnSignal + handleSuppression Inngest functions); Sentry code (no-op until DSN). pnpm verify exit 0 (24/24, 284 tests). Remaining: Sentry DSN (paste -> set env), provider API keys (accounts -> live-verify adapters). DRY_RUN held; live-send gate shut.
- 2026-06-14 — ALL PHASES BUILT. Parallel specialist waves delivered Phase 5 (HubSpot CRM), 7 (sequencing+email+send gate), 8 (Unipile channels), LLM personalisation + eval harness, 9 (enrolment + cost caps), 6 (Next.js control plane — 6 routes, live re-rank), 10 (RUNBOOK + deploy + pilot). Security-compliance audit + final verifier both PASS on the safety posture (no secrets, no send-without-gate). Email compliance (unsubscribe + sender identity) added. `pnpm verify` exit 0, 24/24 tasks, 258 tests. Pilot dry-run proved nothing sends. **Stopped at Human Gate 2 (live-send approval) — DRY_RUN held.** Remaining work is the pre-live checklist above (runtime wiring + live key verification).
