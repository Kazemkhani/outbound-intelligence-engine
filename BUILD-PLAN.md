# Huscribe Revenue OS: Master Build Plan

> The one-page index that maps every roadmap item (Now / Next / Later plus the data-acquisition phases) to the folder PLAN.md that owns it, the top bets in priority order, the deliberately-NOT list, and the execution order. Derived entirely from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md. This file is the master tracker: it does not re-specify tasks, it points to the owning plan and fixes the sequence.

This is a build spec, not prose. Each row links a roadmap line to exactly one owning folder PLAN.md. If a row's detail and a folder PLAN.md disagree, the folder PLAN.md is authoritative for the HOW and this file is authoritative for the WHAT, the WHO, and the WHEN.

## Current state (from the code)

Verified against the repo on 2026-06-25 (paths exist, symbols present):

- Monorepo: pnpm 10 / Node 22, turbo. Five workspace packages plus one app:
  - `packages/core` (deterministic scoring, Zod types): `scoring-engine.ts`, `scoring.ts`, `types.ts` with `signalTypeValues`, `signal-windows.ts` with `DEFAULT_SIGNAL_TTL_DAYS`, `subject.ts`. Scores computed HERE.
  - `packages/db` (Prisma 7, Neon, migrations, seed).
  - `packages/integrations` (anti-corruption adapters): five contracts in `src/contracts/interfaces.ts` (EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore); raw-REST `LlmClient` in `src/llm/client.ts`; `MODEL_IDS`; the bespoke eval harness in `src/llm/evals/` (`runner.ts`, `cases.ts`); the NOVA boundary parser in `src/nova/findings.ts` (68 lines) plus `findings.test.ts`.
  - `packages/orchestration` (durable brain): `waterfall.ts` (one plain async loop), `sequencing/inngest.ts`, `sequencing/send-step.ts`, the pure-and-total `evaluateSendGate` in `send-gate.ts` (already called inside `send-step.ts`), `scoring-bridge.ts`.
  - `packages/config` (env load and validation, fail-fast).
  - `apps/web` (the deployed unit on Vercel): `lib/llm.ts` with the blocking `ask()` and `MODEL_IDS` tiers, `lib/canon.ts` (roughly 9 to 10K tokens, shipped whole), `instrumentation.ts`, `middleware.ts`, Auth.js v5, shadcn DNA but no AI SDK / TanStack / Tremor yet.
  - `scripts/`: `nova-call.ts` (HTTP client to `https://api.novalabs.ae`), `sync-keys-to-vercel.sh`, `_set_vercel_env.py`, seed and discovery scripts.
- Deploy topology: `apps/web` on Vercel (git-connected), Neon Postgres, Inngest Cloud, Sentry installed (`@sentry/*` and `@opentelemetry/*` present transitively). The root `fly.toml` is STALE and is not the deployed origin.
- NOVA is EXTERNAL at `api.novalabs.ae`. No Python source, `requirements.txt`, or `pyproject.toml` in this repo. Only in-repo NOVA surface: `nova/findings.ts`, `scripts/nova-call.ts`, and the `apps/web/app/voice` + `/dojo` surfaces. OWNERSHIP FLAG (resolve before any voice-stack work): state explicitly whether `novalabs.ae` is the founder's own codebase or a third-party vendor. If third-party, the entire NOVA-go-live track is a vendor dependency, not an actionable build.
- Live status: paused at Human Gate 2, 0 of 17 provider keys present, nothing ever sent (per docs/HANDOFF.md). Zero sends, zero replies, zero CallFindings: there is no time series to model yet.
- Not in `pnpm-lock.yaml` (all net-new at adoption): `@ai-sdk/anthropic`, `ai`, `promptfoo`, `@ax-llm/ax`, `@inngest/agent-kit`, `@modelcontextprotocol/sdk`, `langfuse`, `pgvector`, `dbt`, `tremor`, `@tanstack/react-table`, `shadcn`. Present: `inngest@3.54.2`, `@sentry/*`, `@opentelemetry/*`.

## Target architecture for this module (from the research)

This folder (the repo root) owns no runtime code. Its target is a single coherent tracker that keeps the whole program inside the four seams and the four invariants while sequencing the phased roadmap. The four seams and the one master DB (TARGET-ARCHITECTURE Part "the organizing idea") are the columns every owning plan attaches to:

1. ONE durable brain: Inngest in `packages/orchestration`. Owner of all orchestration roadmap rows: `packages/orchestration/PLAN.md`.
2. ONE Anthropic chokepoint: `LlmClient.complete()` in `packages/integrations/src/llm/client.ts`, surfaced via `apps/web/lib/llm.ts`. Owners: `packages/integrations/PLAN.md` (the client and evals) and `apps/web/PLAN.md` (the `ask()` / `streamAsk()` surface).
3. ONE wire format: OpenTelemetry GenAI semantic conventions, emitted at the single `LlmClient.complete()` call site. Owner: `packages/integrations/PLAN.md` (span emission) with `apps/web/PLAN.md` (OTel init in `instrumentation.ts`).
4. ONE master DB: Neon Postgres via Prisma in `packages/db`. Owner of schema rows (Suppression, append-only AuditLog, later KnowledgeChunk): `packages/db/PLAN.md`.

NOVA is the fifth, deliberately isolated, EXTERNAL boundary. In-repo work is tracked in `packages/integrations/PLAN.md` (the `findings.ts` Zod boundary) and `apps/web/PLAN.md` (voice/dojo streaming). Everything inside `api.novalabs.ae` is tracked as a prerequisite in `docs/PRODUCTION-CHECKLIST.md`, NOT as a folder build.

### Owning-plan registry (the folders this tracker indexes)

| Owning plan | Scope it owns |
| --- | --- |
| `packages/orchestration/PLAN.md` | Durable send-gate suspend, throttle/concurrency, per-provider `step.run`, the step.ai.infer chokepoint rule, the enrichment waterfall placement, all Inngest-shaped config |
| `packages/integrations/PLAN.md` | `LlmClient` streaming wrap source, the OTel GenAI span, promptfoo migration of `evals/`, all five adapter contracts, the DLD adapter behind SignalProvider/EnrichmentProvider, the `nova/findings.ts` residual-PII assertion, fail-closed Consent/DNCR/Audit/PiiVault contracts (Later) |
| `packages/core/PLAN.md` | `signalTypeValues` additions (`transaction_spike`, `off_plan_launch`), `DEFAULT_SIGNAL_TTL_DAYS` entries, the deterministic scorer (kept untouched by every tool) |
| `packages/db/PLAN.md` | Suppression phone+channel migration, append-only AuditLog (DB trigger / revoked grants), data-contract Prisma/SQL CI tests, KnowledgeChunk model (Later), AnalyticsStore boundary (Later) |
| `packages/config/PLAN.md` | Env registry for net-new keys (DLD OAuth, promptfoo, OTel exporter), provider-selection flips (Voyage vs Cohere, later) |
| `apps/web/PLAN.md` | `streamAsk()` + AI Elements, OTel init in `instrumentation.ts`, Vercel WAF rules, the `oie/send.approved` event emit from the Close Room, TanStack grids, Tailwind v4 migration, feature flags `lib/flags.ts`, voice/dojo streaming surfaces |
| `scripts/PLAN.md` | The DLD 1-day spike script, Dubai Pulse CSV ingest/rebuild, `scripts/optimize-prompt.ts` (Ax, Later), `nova-call.ts` evolution |
| `docs/strategy/DATA-ACQUISITION-PLAN.md` (GTM tracker) | Problem 1: the hand-built 150 to 300 account list, the warm-graph outreach, the WhatsApp verified profile, the 14-day conversation-first checklist, the parallel non-blocking TDRA clock |
| `docs/PRODUCTION-CHECKLIST.md` | EXTERNAL prerequisites: the NOVA-go-live voice stack, TDRA approval, DNCR access, the Fly/Railway host decision, all "self-hosted needs a host" blockers |

If an owning PLAN.md does not yet exist at the listed path, that is itself a Now task for the parallel agent assigned to that folder; this tracker fixes the path.

## Invariants this module must preserve

This tracker enforces, in every row it indexes, the four invariants. No roadmap row is admitted that violates one:

1. Deterministic scoring stays in code. The LLM never emits the number. `packages/core` scorer is untouched by every tool here. Any row that would feed a model output, eval score, or observability score into the scorer is rejected.
2. DRY_RUN default true plus a mandatory human send-gate. `evaluateSendGate` stays the pure, total, final code gate, re-run on resume. No row makes the send decision an LLM or MCP decision. Gated channels (LinkedIn, WhatsApp) keep their third opt-in condition.
3. Vendor shapes never leak into core. Every new rail is a new adapter behind one of the five contracts (or a small new contract following the same discipline). No vendor type crosses into `packages/core`.
4. Secrets only via env (Vercel project env vars, synced via `scripts/sync-keys-to-vercel.sh`), never `flyctl secrets` for the deployed unit. UAE PDPL plus TDRA gate any live voice, as fail-closed code. Update `.env.example` for every new key.

Plus the program-level rules from the synthesis: ONE tool per job until it visibly hurts; at most THREE net-new vendors per quarter; do not adopt the deliberately-NOT items; do not build Next/Later items now (plan and sequence them).

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

The Now phase is deliberately THREE core items, each a near-zero-infra pure-TS win on the existing dry-run system, plus a tracker-setup task and a GTM kickoff that runs on its own clock. Rationale (TARGET-ARCHITECTURE "Phased roadmap"): get one real key in and watch one lead flow end to end before standing up a WAF, secrets manager, ledger, or tracing backend.

### NOW-1: The durable send-gate (top bet #1)

- Owner: `packages/orchestration/PLAN.md`.
- Spec: in `packages/orchestration/src/sequencing/inngest.ts`, add `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })` immediately before `executeSendStep`. The Close Room approval (owned by `apps/web/PLAN.md`) emits `oie/send.approved` with `data.actionId`. `evaluateSendGate` in `send-gate.ts` STILL runs on resume as the final non-memoised code gate. Inngest-shaped config stays only in `inngest.ts`.
- Acceptance check: a regression test (in `packages/orchestration`) proves a run that suspends, receives approval, then resumes with `DRY_RUN` on still returns "simulate". `pnpm --filter @oie/orchestration test` green.
- Effort: S.

### NOW-2: promptfoo as the CI eval gate (top bet #3)

- Owner: `packages/integrations/PLAN.md`.
- Spec: migrate the bespoke `summarise()`/`runFn` plumbing in `src/llm/evals/runner.ts` to promptfoo, keeping `cases.ts` as labelled data. Code predicates become `javascript` asserts (code still judges, LLM never emits the number); add an `llm-rubric` judge for the scoring RATIONALE prose ONLY, never the tier. Point promptfoo's provider at the `apps/web/lib/llm.ts` `ask()` seam so eval traffic flows through the one Anthropic client. Wire `promptfoo eval --no-cache` as a turbo task plus a GitHub Action gated on pass-rate. Pin promptfoo; re-verify its MIT license at adoption (acquired by OpenAI March 2026).
- Acceptance check: red/green CI gate blocks any prompt or canon change that drops pass-rate; `promptfoo eval --no-cache` runs in CI and locally. The send-gate stays authoritative; the judge only flags.
- Effort: M.

### NOW-3: The OTel GenAI span to Sentry only (top bet #4)

- Owner: `packages/integrations/PLAN.md` (span emission) with `apps/web/PLAN.md` (OTel init).
- Spec: wrap the single `LlmClient.complete()` call site in `packages/integrations/src/llm/client.ts` in one OTel GenAI span (MANUAL span, not an SDK swap, the raw-REST adapter stays). Pass input/output tokens and `costUsd` straight through from the existing `usage`/`CostRecord`; ProviderCost in Postgres stays the billing source of truth. Register the span processor in a server-only OTel init: `apps/web/instrumentation.ts` plus a NodeSDK bootstrap in the orchestration workers. Attach `leadId`, `contactId`, `feature` (close-room, qa, voice-dojo) for cost-per-lead. Emit to SENTRY ONLY (defer Langfuse). Pin the OTel semconv (`gen_ai.prompt` / `gen_ai.completion` churn).
- Acceptance check: cost-per-lead and latency per Claude call visible in Sentry; the span is OTel-standard so a backend swap is a processor registration. No span value feeds the scorer. `pnpm verify` green.
- Effort: M.

### NOW-4: Stand up this master tracker and the per-folder PLAN.md set

- Owner: this file (`/Users/Amir/outbound-intelligence-engine/BUILD-PLAN.md`) plus each folder's parallel agent.
- Spec: ensure every owning PLAN.md in the registry above exists at its listed path and that each row below resolves to a real owning plan. Keep this BUILD-PLAN.md as the single index; do not duplicate task detail into it.
- Acceptance check: every owning-plan path in the registry exists; every Now/Next/Later row names exactly one owner; no orphan rows.
- Effort: S.

### NOW-5 (GTM, own clock, non-blocking): kick off Data-Acquisition Problem 1

- Owner: `docs/strategy/DATA-ACQUISITION-PLAN.md` (GTM hat, not engineering).
- Spec (from DATA-ACQUISITION Section 7, the 14-day checklist): Day 1 open the warm graph (2 warm intros each from both pilots and advisors; DM 10 reachable principals, human-paced, 09:00 to 18:00, opt-out respected); start a Dream-20, not a 300-row longlist. Days 1 to 3 turn the two pilots into named references plus one 1-metric case study; stand up the one-page provenance sheet (per-contact source URL, basis, opt-out, no-resell). Stand up a STANDARD verified WhatsApp Business profile plus a "WhatsApp us" CTA. In parallel and NON-BLOCKING: register the HumAI business line and start TDRA approval (required before any automated/at-scale channel, NOT before warm 1:1 outreach).
- Acceptance check (DATA-ACQUISITION Section 7 success metric): >=5 real conversations and >=2 booked meetings by Day 14. Judged on conversations started, not artifacts built.
- Effort: M (GTM effort, runs parallel to all engineering Now items, gates nothing).

### Now, secondary (if time remains): the cheap in-repo compliance trio plus the streaming Close Room

These are the next-cheapest wins (no new hosted infra) but are SECONDARY to NOW-1..3. Tracked here, owned per folder, sequenced after the three core items:

- Zod residual-PII assertion at `nova/findings.ts` (reject residual PII, allow-list keeps the +971 mobile). Owner: `packages/integrations/PLAN.md`. Acceptance: `findings.test.ts` rejects residual PII, keeps mobile. Effort: S.
- Suppression phone+channel migration (one Prisma migration). Owner: `packages/db/PLAN.md`. Acceptance: migration applies; a voice opt-out can write one cross-channel suppression row. Effort: S.
- Append-only Postgres AuditLog (DB trigger blocking UPDATE/DELETE or revoked grants). Owner: `packages/db/PLAN.md`. Acceptance: an UPDATE/DELETE on AuditLog is rejected at the DB; test proves it. Effort: S.
- `streamAsk()` in `apps/web/lib/llm.ts` built on `streamText`, reusing `MODEL_IDS` tiers and the canon system prompt, returning `toUIMessageStreamResponse()`; the blocking `ask()` stays. Add only `@ai-sdk/anthropic` and `ai`. Owner: `apps/web/PLAN.md`. Acceptance: tokens stream into the Close Room over the dry-run system; a test proves the score path never reads model text. Effort: M.

## Next (1 to 3 months)

Sequenced after Now is green and one real key has flowed one lead end to end. Each row maps to one owner. From TARGET-ARCHITECTURE "Next" plus DATA-ACQUISITION "Next".

| # | Roadmap item | Owner |
| --- | --- | --- |
| NEXT-1 | DLD / Dubai Pulse: FIRST the 1-day spike (availability, OAuth/token lifetime ~30 min, rate/max-result limits, freshness, commercial licensing, against official Dubai Pulse docs). Gate all DLD code on the spike passing. | `scripts/PLAN.md` (spike script) |
| NEXT-2 | DLD free `transaction_spike` adapter (OAuth token-refresh plus CSV-rebuild ingest) behind SignalProvider (and EnrichmentProvider for transaction-volume firmographics). NOT a trivial wrapper. | `packages/integrations/PLAN.md` |
| NEXT-3 | `transaction_spike` SignalType enum value in `signalTypeValues` plus its TTL in `DEFAULT_SIGNAL_TTL_DAYS`, BEFORE mapping. `off_plan_launch` ONLY once its free proxy (first-registration spike from open datasets) or gated Oqood access is settled. | `packages/core/PLAN.md` |
| NEXT-4 | DLD CSV-rebuild ingest job and OAuth env keys; DLD call wrapped in its own `step.run`. | `scripts/PLAN.md` (ingest) + `packages/orchestration/PLAN.md` (`step.run`) + `packages/config/PLAN.md` (keys) |
| NEXT-5 | Streaming UI everywhere: `streamAsk()` plus AI Elements across Close Room, Knowledge Q&A, Voice Dojo; the test that the score path never reads model text. | `apps/web/PLAN.md` |
| NEXT-6 | Inngest declarative throttle/concurrency for channel and mailbox caps plus quiet hours (per channel-limits and email-deliverability conventions); wrap each waterfall `EnrichmentProvider.enrichCompany` in its own `step.run`. | `packages/orchestration/PLAN.md` |
| NEXT-7 | Vercel-native perimeter: Vercel WAF/firewall rules (log/observe mode first) on `/signin`, `/api/inngest`, `/api/health`, future NOVA webhooks. | `apps/web/PLAN.md` |
| NEXT-8 | Upstash Redis plus `@upstash/ratelimit` behind a thin internal RateLimiter helper (INFRA, not a vendor adapter): fail-OPEN reads, fail-CLOSED send-gate; no PII; pin EU/Frankfurt. | `apps/web/PLAN.md` |
| NEXT-9 | Infisical as upstream secrets source syncing INTO Vercel env (app still reads `process.env`); `.env.example` stays the registry. | `packages/config/PLAN.md` + `scripts/PLAN.md` |
| NEXT-10 | Feature flags (PostHog or self-hosted Flagsmith) behind `apps/web/lib/flags.ts`, gating REACHABILITY of live-send and NOVA DEMO_MODE-exit; never flip DRY_RUN, never compute a score. | `apps/web/PLAN.md` |
| NEXT-11 | Frontend foundation: shadcn/ui formalised; TanStack Table v8 plus Query v5 for Leads and Approval Queue (read the `@oie/db` unified model via Server Components, never a vendor shape, never compute a score). | `apps/web/PLAN.md` |
| NEXT-12 | Tailwind v3-to-v4 migration as its own isolated, `pnpm verify`-gated PR (NOT bundled with streaming). | `apps/web/PLAN.md` |
| NEXT-13 | Compliance NOVA-go-live track (gated on TDRA): fail-closed `ConsentStore`, `DncrProvider`/`SuppressionProvider` (tri-state, fail-closed on unknown), `AuditSink` stubs in `packages/integrations/src/contracts`. | `packages/integrations/PLAN.md` |
| NEXT-14 | Plain Prisma/SQL data-contract CI tests ("every Company field has a source," freshness assertions on `detectedAt`/`expiresAt"). No dbt, no DuckDB, no new tool. | `packages/db/PLAN.md` |
| NEXT-15 (GTM) | Semi-automate the cascade behind the adapter contracts post first-paid: discovery + firmographics via live EnrichmentProvider adapters (SearchApi/Places; Dubai Pulse CSV seed import); enrichment waterfall for named contact + email with mobile staying `null` when unknown; adopt Clay as pay-per-match once volume justifies; per-contact provenance fields. | `docs/strategy/DATA-ACQUISITION-PLAN.md` + `packages/integrations/PLAN.md` (adapters) + `packages/orchestration/PLAN.md` (waterfall) |

## Later (post-PMF, gated)

Each Later row carries its explicit trigger and owner. Do NOT build before the trigger fires. From TARGET-ARCHITECTURE "Later" plus DATA-ACQUISITION "Later".

| # | Roadmap item | Trigger | Owner |
| --- | --- | --- | --- |
| L-1 | Agent layer (Inngest AgentKit on Inngest backend, Mastra as swap candidate). | A concrete agentic task the current `step.run`/`step.ai.infer` composition cannot express, named at the time. | `packages/orchestration/PLAN.md` |
| L-2 | Read-only internal MCP server (official TS SDK), build-time and operator-only, never the send-gate (per ADR-0002). | Operator convenience need. | `apps/web/PLAN.md` or a new `packages/mcp/PLAN.md` |
| L-3 | Self-hosted Langfuse as second OTel span processor (quality/cost/regression). Confirm MIT-vs-EE for the specific judge feature at adoption. Route NOVA DSPy traces in. | A Fly/Railway host exists AND there is live traffic to evaluate. | `packages/integrations/PLAN.md` |
| L-4 | Ax offline prompt optimization (`scripts/optimize-prompt.ts`) evolving the canon wrapper against the promptfoo dataset; freeze and check in the winner; runtime keeps `LlmClient`. | promptfoo gate green AND a real quality gap appears in live runs. | `scripts/PLAN.md` |
| L-5 | Remaining enrichment rails (Firecrawl self-hosted AGPL-3.0, Explorium SignalProvider, Exa Websets, Linkup, PDL, Ocean.io, Serper, Stagehand), each behind a contract, within the 3-vendors/quarter cap. | A NAMED live-run coverage gap per rail. | `packages/integrations/PLAN.md` |
| L-6 | Canon RAG: KnowledgeStore/Embedder/Reranker ports plus Neon pgvector + pg_search hybrid (RRF k=60) plus Contextual Retrieval ingest; Voyage/Cohere behind the port; Turbopuffer as escape hatch. | The corpus (transcripts + per-deal findings + playbooks) outgrows the cached canon context window. | `packages/integrations/PLAN.md` + `packages/db/PLAN.md` (KnowledgeChunk) + `packages/orchestration/PLAN.md` (ingest job) |
| L-7 | Analytics OLAP: dbt on DuckDB-in-CI first, then ClickHouse + ClickPipes/PeerDB CDC + self-hosted Metabase, behind a read-only AnalyticsStore contract, downstream and de-identified. | "We have N weeks of real send+reply data worth a cohort question." Plus the Fly/Railway host prerequisite for Metabase. | `packages/db/PLAN.md` + `packages/integrations/PLAN.md` (AnalyticsStore) |
| L-8 | Compliance at live-PSTN: Presidio (inside NOVA's external repo), immudb (after the append-only Postgres AuditLog), Skyflow UAE/Bahrain PiiVault, OneTrust or paid DNCR. | TDRA approval AND a real call. immudb also needs a Fly/Railway host. | `docs/PRODUCTION-CHECKLIST.md` (Presidio, NOVA-side) + `packages/integrations/PLAN.md` (PiiVault contract, immudb mirror) |
| L-9 | NOVA go-live (EXTERNAL, in NOVA's repo): LiveKit Cloud SIP + Telnyx/Twilio; `inference.TurnDetector` + Deepgram Flux; Cartesia (en) / ElevenLabs Flash (ar); Coval as CI merge gate. | TDRA local-number + script pre-approval. EXTERNAL: actionable only if `novalabs.ae` is the founder's codebase. | `docs/PRODUCTION-CHECKLIST.md` |
| L-10 | Auth: Better Auth (second-seat / session-revocation / passkey trigger); WorkOS AuthKit SSO/SCIM. | A second seat, or a UAE developer/portal customer demands SAML. | `apps/web/PLAN.md` |
| L-11 | Fly (or Railway) origin migration, IF intended. Must land BEFORE any Fly-hosted sidecar (Langfuse, Metabase, immudb) or Cloudflare-in-front design. | An explicit, gated decision to move the origin off Vercel. | `docs/PRODUCTION-CHECKLIST.md` |
| L-12 | Temporal in NOVA-Python ONLY if the 4-phase voice loop needs crash-safe cross-phase durability. Never replacing Inngest in the TS pipeline. | NOVA voice-loop durability need. EXTERNAL. | `docs/PRODUCTION-CHECKLIST.md` |
| L-13 (Data moat) | The verify-by-conversation moat at scale + the DLD adapter writing the master DB: consented NOVA calls write a dialable E.164 mobile to `Contact`, spoken tools to `Company.techStack`, opt-outs to durable suppression (`ingestCallResult`). | Paying pilots and a clean audit trail justify it; ALL of COMPLIANCE.md true (TDRA, licence-registered caller-ID, DNCR fail-closed, calling-window ledger, disclosure, cross-border basis, owner sign-off). Until then DEMO_MODE and DRY_RUN stay on. | `docs/strategy/DATA-ACQUISITION-PLAN.md` + `packages/integrations/PLAN.md` (DLD adapter) + `packages/orchestration/PLAN.md` (ingest) |

## Top bets (priority order, from the synthesis)

1. The durable send-gate (`step.waitForEvent` + regression test). Highest-value, lowest-risk, in-repo, at a zero-send stage. Owner: `packages/orchestration/PLAN.md`. Maps to NOW-1.
2. The DLD / Dubai Pulse FREE `transaction_spike` signal. Region-native differentiator, gated on a 1-day spike, not a trivial wrapper. Owner: `packages/integrations/PLAN.md` (+ core enum, + scripts spike). Maps to NEXT-1..4.
3. The quality flywheel, starting with promptfoo. Turns subjective AI quality into red/green now. Owner: `packages/integrations/PLAN.md`. Maps to NOW-2.
4. The observability spine: one OTel GenAI span at `LlmClient.complete()` to Sentry now. Owner: `packages/integrations/PLAN.md` (+ apps/web init). Maps to NOW-3.
5. Compliance as a provable artifact, cheap in-repo half first: Zod residual-PII assertion, phone+channel Suppression, append-only AuditLog. Owners: `packages/integrations/PLAN.md` + `packages/db/PLAN.md`. Maps to Now-secondary.
6. NOVA goes live, compliance-first (EXTERNAL prerequisite in NOVA's repo). Demoted from #1 because no voice-stack work is actionable from this repo. Owner: `docs/PRODUCTION-CHECKLIST.md`. Maps to L-9.

(The agent layer is deliberately NOT a top bet.)

## What we deliberately do NOT adopt (the do-not list, indexed)

Admitted to NO folder PLAN.md. If any plan proposes one of these, reject it and cite this row.

- An agent framework (AgentKit / Mastra) NOW. Adopt only when a concrete agentic task the current code cannot express is named (then L-1).
- `step.ai.infer` for personalisation or ANY traced/costed Claude call (it bypasses `LlmClient.complete()`, splitting the OTel/cost chokepoint). Reserved only for calls deliberately excluded from the chokepoint: currently none.
- Firecrawl `/extract` (deprecated); `/agent` + Fire-engine are managed-only and excluded from the self-hosted AGPL-3.0 build. Self-host + own extraction via `LlmClient` only when needed (L-5).
- LangGraph.js as the orchestration brain (duplicates Inngest; incompatible with Vercel/Cloudflare by design).
- Temporal, Trigger.dev, Restate, DBOS, Hatchet for the TS pipeline now. Temporal in NOVA-Python only on a voice-loop durability trigger (L-12).
- OpenAI Agents SDK, and Vapi / Retell / Bland for voice (wrong ecosystem; collide with LLM-never-scores, the human send-gate, no-vendor-leakage).
- Building RAG for the current ~9 to 10K-token cached canon. Gate strictly on corpus size (L-6).
- ClickHouse, a separate vector DB (Pinecone/Weaviate/Qdrant/Turbopuffer), Estuary, or the dbt/DuckDB/Metabase analytics layer NOW (zero sends/replies/findings to model; use plain Prisma/SQL CI tests, NEXT-14).
- Tool sprawl across evals/frontend/enrichment. ONE tool per job: promptfoo only; shadcn + AI SDK streaming + TanStack Table only; DLD only as the net-new rail. Cap: <=3 net-new vendors/quarter.
- Migrating Prisma to Drizzle (high-risk, low-reward churn).
- Helicone as a strategic dependency; Clerk for auth; the Vercel AI Gateway and assistant-ui Cloud; Braintrust/LangSmith hosted tiers (off-region, PDPL risk).
- Pulling any Python framework (DSPy, DeepEval, Ragas) into the TS monorepo; routing the production pipeline or send-path behind MCP; wrapping governed rails (HubSpot, Smartlead, Unipile) through Composio.
- BullMQ, Kafka, Redpanda (wrong shape; Inngest already covers it).
- From DATA-ACQUISITION: buying a ZoomInfo/Cognism/Apollo seat; building a portal scraper; LinkedIn/Sales Navigator scraping; buying "Cityscape attendee" lists; any call or WhatsApp from a personal number; building adapters/waterfall/DLD adapter/master DB before paid volume; treating the WhatsApp notable-business badge or TDRA approval as a gate to the first conversations.

## Execution order (the sequence this tracker enforces)

1. NOW-1 durable send-gate (one file, one test) -> NOW-3 OTel span -> NOW-2 promptfoo gate. NOW-4 (this tracker + per-folder plans) runs alongside. NOW-5 (GTM) starts Day 1 on its own clock, gating nothing.
2. Get ONE real provider key in and watch one lead flow end to end on the dry-run system. This is the gate between Now and Next, not a calendar date.
3. Now-secondary (compliance trio + `streamAsk`) only if time remains in the window; secondary to NOW-1..3.
4. NEXT begins with NEXT-1 the DLD 1-day spike. ALL DLD code (NEXT-2/3/4) is gated on the spike passing (availability + commercial licensing + freshness). If open transaction data is not fresh enough to be a "this week" signal or not licensable, re-ground the differentiator before any adapter code.
5. NEXT perimeter rows (NEXT-7..10) and frontend rows (NEXT-11/12) proceed in parallel once there is live traffic to protect and data to display; Tailwind v4 (NEXT-12) is its own gated PR. NEXT-13 compliance stubs and NEXT-15 GTM semi-automation are gated on TDRA progress and first-paid respectively.
6. LATER rows fire only on their named triggers, never on a calendar. The Fly/Railway host decision (L-11) is the prerequisite that unblocks L-3, L-7, L-8 (immudb), and any Cloudflare-in-front design.

## Contracts / interfaces touched (exact names)

This tracker touches no code; it indexes the contracts the owning plans touch:

- `evaluateSendGate(input: SendGateInput): SendGateDecision` and `isRealSendAllowed` in `packages/orchestration/src/send-gate.ts` (NOW-1: re-run on resume).
- The `oie/send.approved` Inngest event with `data.actionId` (NOW-1 emit from `apps/web`, suspend in `packages/orchestration`).
- `LlmClient.complete()` and `MODEL_IDS` in `packages/integrations/src/llm/client.ts` (NOW-2 promptfoo provider, NOW-3 OTel span, `streamAsk` wrap).
- `ask()` (and new `streamAsk()`) in `apps/web/lib/llm.ts`.
- The five contracts in `packages/integrations/src/contracts/interfaces.ts`: `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore` (DLD behind SignalProvider/EnrichmentProvider; later Consent/DNCR/Audit/PiiVault/KnowledgeStore/AnalyticsStore as new small contracts).
- `signalTypeValues` and `signalType` in `packages/core/src/types.ts`; `DEFAULT_SIGNAL_TTL_DAYS` in `packages/core/src/signal-windows.ts` (`transaction_spike`, later `off_plan_launch`).
- The NOVA boundary parser in `packages/integrations/src/nova/findings.ts` (residual-PII assertion).
- Prisma models in `packages/db`: `Suppression` (phone + channel), `AuditLog` (append-only), later `KnowledgeChunk`.
- OTel GenAI semantic-convention span (the one swappable wire format) registered in `apps/web/instrumentation.ts` and the orchestration NodeSDK bootstrap.

## Verification (how each task is proven done)

Per CLAUDE.md, `pnpm verify` (typecheck + lint + test + build) gates every code row before it is claimed done. Per-task proofs:

- NOW-1: `pnpm --filter @oie/orchestration test` green, including the suspend-approve-resume-with-DRY_RUN-on returns "simulate" regression test.
- NOW-2: `promptfoo eval --no-cache` runs as a turbo task and a GitHub Action; the action fails the build when pass-rate drops. License re-verified at adoption.
- NOW-3: `pnpm verify` green; a Claude call shows a GenAI span in Sentry with `leadId`/`contactId`/`feature` and token/cost attributes; a test asserts no span value reaches the scorer.
- NOW-4: every owning-plan path in the registry exists; every roadmap row resolves to exactly one owner (manual review against this file).
- NOW-5 (GTM): >=5 conversations and >=2 booked meetings by Day 14 (DATA-ACQUISITION metric); per-contact source-URL provenance sheet exists.
- Now-secondary: `findings.test.ts` rejects residual PII while keeping the +971 mobile; the Suppression migration applies (`pnpm db:migrate`); an UPDATE/DELETE on `AuditLog` is rejected at the DB by an explicit test; `streamAsk` test proves the score path never reads model text.
- NEXT and LATER: each owning PLAN.md carries its own typecheck/lint/test/build/curl proof; the DLD spike (NEXT-1) is proven by a written confirmation of availability, OAuth/token lifetime, limits, freshness, and commercial licensing against official Dubai Pulse docs before any adapter code.

## Risks and do-not

- Do not bundle ~25 net-new integrations into four weeks for one person (the failed earlier draft). Now is THREE core items; respect the cap of <=3 net-new vendors per quarter.
- Do not sequence compliance machinery (immudb, Presidio, fail-closed external stubs) before the thing it protects exists or before the Fly/Railway host exists. Do the cheap in-repo half now (Zod assertion, Suppression, append-only AuditLog); defer the rest to the TDRA-gated NOVA-go-live track.
- Do not assume a Fly origin. The deployed unit is Vercel; the perimeter is Vercel-native. The root `fly.toml` is stale. All "self-hosted on Fly" items are blocked on the L-11 host decision.
- Do not treat NOVA voice-stack work as in-repo or as top bet #1. It is EXTERNAL at `api.novalabs.ae`; resolve the ownership flag first; track it in `docs/PRODUCTION-CHECKLIST.md`.
- Do not let the score path read model text, do not let `step.ai.infer` carry a traced/costed Claude call, do not feed any eval/observability score into the scorer, do not let a feature flag or MCP tool flip DRY_RUN or compute a score.
- Do not start the analytics layer or RAG before their data/corpus triggers; running marts over empty Neon or RAG over a 10K-token canon is building the floor of a skyscraper before the first tenant.
- Do not let TDRA approval or the WhatsApp notable-business badge gate the first conversations; they run on their own non-blocking clock. Do not contact UAE mobiles from a personal SIM or at scale before TDRA approval: one wrong AI-voice campaign can exceed runway.
- Verify every provider's CURRENT API/limits/auth/license against official docs before integrating (DLD OAuth lifetime, promptfoo MIT, Langfuse MIT-vs-EE, Firecrawl AGPL/managed split). Do not assume from memory.
