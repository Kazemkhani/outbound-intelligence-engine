# OIE — Session Handoff & Continuity Brief

> **Purpose.** This is the single document a fresh Claude Code session (or a new engineer) reads to understand everything OIE is, everything built so far, why, the current state, the safety invariants, and exactly how to continue without losing progress. It is deliberately complete. Last updated: 2026-06-15.

---

## 1. What OIE is (in one breath)

The Outbound Intelligence Engine: discover → enrich → detect signals → score/rank against an ICP → enrol the best leads into compliant, gated multi-channel sequences (email + LinkedIn + WhatsApp), run from an operator control plane. The product decisions are locked in [`../PROJECT_BRIEF.md`](../PROJECT_BRIEF.md) (§13). Built for an AI-native GTM operator, including Gulf/MENA SMB and WhatsApp-led selling. It is the all-in-one tool for running outbound on **Huscribe**.

## 2. Current state (2026-06-15)

- **All phases 0–10 are built and committed.** `pnpm verify` is green: **24/24 turbo tasks, 258 tests**.
- The system is **paused at Human Gate 2 (live-send approval)**. The dry-run flag is held on; nothing has ever sent; no provider has been called live; **0 of 17 provider keys are present** (none entered).
- Security-compliance audit and an independent verifier both **PASS** on the safety posture: no committed secrets, no code path that sends without the gate.
- The repository is being prepared for GitHub (`Kazemkhani/outbound-intelligence-engine`, private) and production (Vercel + Neon + Inngest + Sentry). See [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md).

## 3. The absolute safety invariants (NEVER weaken these)

1. **No send without the gate.** Every send-path call routes through `evaluateSendGate` (`packages/orchestration/src/send-gate.ts`). A real send requires **both** the dry-run flag disabled **and** explicit human approval for that action. LinkedIn/WhatsApp need a third gate (channel enabled; off by default).
2. **The dry-run flag defaults on** and is enforced in code plus a `PreToolUse` guard hook (`.claude/hooks/guard.sh`) that blocks any shell attempt to disable it, hand-edit migrations, or write `.env`.
3. **Never enter secrets.** Provider keys go into `.env` (gitignored) by the human only. `.env.example` documents every key.
4. **Never auto-approve a send, auto-disable the dry-run flag, or cross Human Gate 2.** A human does that, explicitly, once.
5. **Verify before claiming done.** `pnpm verify` must be green; show evidence.

## 4. Architecture map — where everything lives

| Concern                                                                   | Location                              | Notes                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Env validation (fail fast)                                                | `packages/config`                     | `loadEnv`, `getEnv`, `providerKeyStatus`                                                                            |
| Domain types, ICP + scoring                                               | `packages/core`                       | `scoreLead(subject, icp, now)`, `rankByComposite`, dedupe keys, signal decay windows. **Code computes the number.** |
| Unified data model                                                        | `packages/db`                         | Prisma schema (§10.2), `prisma` client, `seedIcp`, seed script                                                      |
| Adapters (anti-corruption)                                                | `packages/integrations/src/<vendor>`  | 11 adapters; vendor shapes never leak; an HTTP transport seam (`base/http.ts`) makes them fixture-testable          |
| Stable interfaces                                                         | `packages/integrations/src/contracts` | `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore`                               |
| Waterfall, signal collection, send gate, sequencing, enrolment, cost caps | `packages/orchestration`              | The cascade and control live here, not in vendors                                                                   |
| Control plane                                                             | `apps/web`                            | Next.js App Router; fixtures data seam (no DB at build)                                                             |
| Evidence scripts                                                          | `scripts/`                            | gate1-credentials, phase4-signals-demo, phase10-pilot-dryrun                                                        |
| The autonomous team                                                       | `.claude/`                            | 12 specialist agents, 4 skills, 2 slash commands, the guard hook                                                    |

Full design: [`ARCHITECTURE.md`](ARCHITECTURE.md). Decisions: [`adr/`](adr/).

## 5. Build history — what each phase delivered (and the commits)

| Phase                        | Delivered                                                                                                                                                                                                          | Commit               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 0 Bootstrap                  | SPEC, PLAN, CLAUDE.md, 12 specialists, skills/commands, the safety guard hook, `.env.example`                                                                                                                      | `af0b241`            |
| 1 Foundation                 | pnpm+Turborepo monorepo (TS strict), the full §10.2 Prisma schema + migrate + idempotent seed, fail-fast env validation, the **send gate**, CI, docker-compose Postgres                                            | `e82f701`, `370a228` |
| 2 Scoring engine             | Deterministic `scoreLead` — fit/intent-with-decay/composite/tier/rationale; 28 tests (determinism, edge cases)                                                                                                     | `2d3a353`            |
| 3 Stream A — enrichment      | Places/Apollo/Clay/Explorium `EnrichmentProvider` adapters + the **waterfall** (priority order, per-field provider attribution, early stop on completeness, fall-through on error) + scoring-bridge + e2e pipeline | `088fe40`, `31444d3` |
| 4 Stream B — signals         | TheirStack/PredictLeads/Exa `SignalProvider` adapters + `collectSignals` (fan-in, dedup, central decay) + DB demo (intent 0→33.6)                                                                                  | `b61a803`, `9261588` |
| 5 Stream C — CRM             | HubSpot `CrmStore` find-or-create (no dupes), two-way mapping                                                                                                                                                      | `948021f`            |
| 6 Stream D — control plane   | Next.js: leads + detail drawer, ICP editor with **live re-rank**, signal feed, **approval queue**, analytics; 6 static routes, 8 tests, accessible                                                                 | `8c9ff24`            |
| 7 Sequencing + email         | Sequence state machine (steps/delays/branch/stop-on-reply), `executeSendStep` (gate-first), Smartlead `EmailSender`, suppression, idempotency, Inngest function defs                                               | `948021f`            |
| 8 LinkedIn + WhatsApp        | Unipile `MessagingChannel` (dry-run honoured, off by default), `parseUnipileWebhook` reply sync                                                                                                                    | `948021f`            |
| LLM engine                   | `LlmClient` (transport seam, no SDK dep), `personaliseOpener` (cites the exact signal), `extractCompanyFacts` (grounded), eval harness (labelled cases + runner)                                                   | `948021f`            |
| 9 Signal-triggered enrolment | `qualifiesForEnrolment` (through the gate), cost-cap halting                                                                                                                                                       | `b7bf436`            |
| 10 Productionisation + pilot | RUNBOOK, deploy notes, pilot dry-run; email compliance (unsubscribe + sender identity)                                                                                                                             | `8c9ff24`, `1a319ec` |

## 6. What is DONE vs what REMAINS

**Done (fixture-tested, green, audited):** every adapter, the waterfall, signal collection, the scoring engine, the send gate, sequencing, personalisation + evals, enrolment + cost caps, the control plane, the pilot dry-run, and the documentation.

**Remains — the pre-live checklist** (scaffolded + unit-tested, but must be wired into the durable runtime with live keys; none breaks the gate):

1. Feed real reply/bounce/unsubscribe events to `shouldStop` in `packages/orchestration/src/sequencing/inngest.ts` (currently `events: []`).
2. Invoke `assertWithinCaps` before LLM/provider operations in the running pipeline.
3. Add the Inngest function that turns a qualifying fresh signal into an `Enrolment` row (auto-enrol is decision-only today).
4. Write a durable `Suppression` row on hard bounce / unsubscribe webhooks.
5. SPF/DKIM/DMARC for every sending domain; mailboxes warmed; suppression list loaded.
6. Live-verify each adapter against its real provider once keys are in `.env`.

The full sequenced path to production is [`PRODUCTION-CHECKLIST.md`](PRODUCTION-CHECKLIST.md).

## 7. How to resume (any device)

```bash
git clone git@github.com:Kazemkhani/outbound-intelligence-engine.git
cd outbound-intelligence-engine
make setup          # pnpm install + Postgres + migrate + seed
pnpm verify         # confirm green (24/24, 258 tests)
make pilot          # watch the full pipeline run in dry-run, sending nothing
claude              # the .claude/ team (12 specialists + guard) loads automatically
```

Then read this file, `PLAN.md` (the phased plan + progress log), and `PRODUCTION-CHECKLIST.md`. Pick the next item from §6 or the checklist.

## 8. The specialist team (in `.claude/agents/`)

`integration-engineer` (adapters), `data-architect` (schema), `scoring-engineer` (the engine), `workflow-engineer` (Inngest/sequencing), `deliverability-engineer` (Smartlead/email health), `channels-engineer` (Unipile/LinkedIn/WhatsApp), `frontend-engineer` (control plane), `mcp-tooling-engineer`, `security-compliance-engineer` (gates production), `qa-eval-engineer` (tests + evals), `devops-engineer` (deploy), `verifier` (adversarial review). Model tiering per addendum §7: opus for verifier + security, sonnet for engineers, haiku for high-volume parsing.

Dispatch the right specialist for a change; run `verifier` + `security-compliance-engineer` before anything ships. Independent work fans out in parallel.

## 9. Conventions + gotchas discovered this session

- **Internal packages are consumed as TS source** (no JS emit). `tsx`/Vitest/Next transpile. Use extensionless relative imports; `import type` for type-only (verbatimModuleSyntax is on).
- **Adapters are fixture-tested via an injected HTTP transport** (`stubTransport`). No live calls in CI. `isConfigured()` gates live-vs-fixture.
- **Cost accounting:** carry cost on the `EnrichmentResult` OR call `ctx.recordCost`, never both (the waterfall records once).
- **Signals never set their own `expiresAt`** — the decay window is assigned centrally in `collectSignals`.
- **`apps/web` typecheck** must exclude `.next` (Next rewrites the tsconfig include on build; the `.next` exclude keeps `tsc --noEmit` order-independent).
- **The guard hook is content-based** — it refuses any text that contains the literal disable-flag token, even in prose. Reword docs (as done in RUNBOOK and here), never bypass.
- **Prisma `Json` inputs** need a cast through `Prisma.InputJsonObject` from the Zod-validated object.
- Free disk on the build box is tight (~11 GB). Keep dependencies lean.

## 10. Provider key status

All 17 keys are **missing** (none entered): `ANTHROPIC_API_KEY`, Clay (`CLAY_WEBHOOK_URL`, `CLAY_API_KEY`), `EXPLORIUM_API_KEY`, `APOLLO_API_KEY`, `GOOGLE_MAPS_API_KEY`, `THEIRSTACK_API_KEY`, `BUILTWITH_API_KEY`, `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN`, `EXA_API_KEY`, `SMARTLEAD_API_KEY`, `UNIPILE_API_KEY`, `UNIPILE_DSN`, `HUBSPOT_ACCESS_TOKEN`, `COMPOSIO_API_KEY`, `SENTRY_DSN`. Run `pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts` for the live status. Each adapter is built and fixture-tested; live verification is queued per key.
