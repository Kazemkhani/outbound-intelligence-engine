# Huscribe Revenue OS - Target Architecture

Status: Proposed (lead-architect synthesis, revised against repo + tool reality)
Date: 2026-06-25
Author: Lead architect synthesis, judged and grafted from three sourced proposals (pragmatic, moat, scale), then corrected against the actual codebase, the actual deploy topology, and current vendor docs.

## How to read this document

This is a design ONTO the system that already exists. It does not greenfield anything, and it does not rebuild what the codebase or a mature library already solves. Every recommendation slots in as a thin adapter, a copy-in UI layer, an offline script, or a service-isolated worker, behind one of four seams we already own. Nothing on this list crosses an invariant.

Two corrections frame everything below, because earlier drafts of this plan got them wrong:

1. The deployed unit is `apps/web` on VERCEL (git-connected auto-deploy from `main`, root `apps/web`), backed by Neon Postgres and Inngest Cloud. This is verified against `docs/PRODUCTION-CHECKLIST.md` Stage 2 (LIVE 2026-06-16, https://web-five-kappa-67.vercel.app) and `apps/web/vercel.json`. The `fly.toml` at the repo root (app `huscribe-revenue-os`, region fra) is STALE: it describes a Fly target that is not the deployed unit. Any recommendation that wanted a "Fly origin," a "Fly sidecar," or "restrict Fly to Cloudflare IPs" has been rewritten against the Vercel reality, or flagged as a new self-hosting prerequisite (Fly/Railway account) that does not yet exist.

2. NOVA is an EXTERNAL service, not in-repo code. The only NOVA artifacts in this repository are `packages/integrations/src/nova/findings.ts` (68-line pure TS parser), its test, and `scripts/nova-call.ts` (an HTTP client whose base URL is `https://api.novalabs.ae`, "the team's production 4-phase LiveKit agent"). There is no `requirements.txt`, no `pyproject.toml`, and no `.py` NOVA source anywhere (only `scripts/_set_vercel_env.py`, an unrelated helper). So any instruction to "edit NOVA's FastAPI service," "run Presidio inside NOVA," or "add immudb inside NOVA" is editing a codebase that is not in this repo and may not be the founder's to change. Those items are re-scoped as EXTERNAL-service prerequisites tracked in PRODUCTION-CHECKLIST, not in-repo builds.

The system is also paused at Human Gate 2 with 0 of 17 provider keys present and nothing ever sent (verified against `docs/HANDOFF.md`). That fact, more than any tool choice, sets the phasing: get one real key in and watch one lead flow end to end before standing up a WAF, a secrets manager, a tamper-evident ledger, and a tracing backend.

## The organizing idea: four seams, everything else is a leaf

The whole architecture stays coherent because every new tool attaches to exactly one of four seams that already exist in the repo. Nothing leaks past them into the deterministic core.

1. ONE durable brain: Inngest in `packages/orchestration`. We exploit it harder, we do not replace it.
2. ONE Anthropic chokepoint: the raw-REST `LlmClient` in `packages/integrations/src/llm/client.ts` on the scoring and pipeline path, surfaced to the control plane through `apps/web/lib/llm.ts`. We wrap it for streaming and tracing, we do not swap it for an SDK, and we do not route any traced or costed Claude call around it.
3. ONE wire format: OpenTelemetry GenAI semantic conventions, emitted at the single `LlmClient.complete()` call site, so observability backends stay swappable.
4. ONE master DB: Neon Postgres via Prisma. We add pgvector inside it (later) and build analytics downstream and read-only, never on the OLTP or send path.

NOVA stays a fifth, deliberately isolated boundary, and it is EXTERNAL: a third-party (or sister-team) Python FastAPI + LiveKit + DSPy voice service at `api.novalabs.ae`. The TypeScript monorepo only ever touches it through `nova/findings.ts` and `scripts/nova-call.ts`. Voice vendors never reach `packages/core`, the scorer, or the adapter contracts, because they are not in this repo at all.

## The four invariants every part below respects

- Deterministic scoring stays in code. The LLM never emits the number. The scoring engine in `packages/core` is untouched by every tool here. It is verified against the real code: `scoring-bridge.ts` maps the unified model into the scorer's `ScoringSubject`, and no part of this plan feeds a model output, an eval score, or an observability score back into it.
- DRY_RUN default true plus a mandatory human send-gate. `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` is pure and total: DRY_RUN and human approval are independent conditions that must both hold, and gated channels (LinkedIn, WhatsApp) add a third opt-in condition. It is already called inside `send-step.ts` on every execution. We make it a durable suspend, we never make it an LLM or MCP decision.
- Vendor shapes never leak into core. The five contracts in `packages/integrations/src/contracts/interfaces.ts` (EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore) plus the LlmClient and the NOVA findings parser stay the anti-corruption boundary. Every new rail is a new adapter behind one of these (or a small new contract following the same discipline).
- Secrets only via env, and UAE PDPL plus TDRA for any live voice. Every key is read lazily from the env, exactly as `apps/web/lib/llm.ts` already does; on Vercel they live in project env vars (synced via `scripts/sync-keys-to-vercel.sh`), not in `flyctl secrets`. Compliance gates are fail-closed code.

## Judging the three proposals

All three proposals converged on the same spine, which is itself the strongest signal that the spine is right: stay on Inngest, keep the raw-REST LlmClient, keep NOVA isolated, adopt promptfoo, build a free DLD signal, go live on LiveKit Cloud SIP behind fail-closed compliance code (in NOVA's own repo), and defer ClickHouse, a vector DB, Skyflow, and an engine migration until a real trigger.

- The pragmatic proposal scored highest on coherence and feasibility. Its four-seams framing and ruthless phasing (ship the near-zero-infra wins first) are the backbone of this synthesis, and they are why the revised "Now" phase is three items, not seven.
- The moat proposal scored highest on differentiation. Its insistence that every adoption must compound the verify-by-conversation moat is grafted in, with the caveat that the voice moat lives in NOVA's external repo, not this one.
- The scale proposal scored highest on impact-as-provable-artifact. Its precise integration mechanics (the exact regression-test specifications, the fail-open-for-reads / fail-closed-for-sends nuance on rate limiting, the manual-span-not-SDK reasoning) are adopted as the implementation detail throughout.

Where all three over-reached (agent frameworks at a zero-send stage, five overlapping eval systems, six frontend libs, eight new data rails, an analytics warehouse with no data), this synthesis prunes hard. A hard rule governs the prune: ONE tool per job until it visibly hurts, and a cap of THREE net-new vendors per quarter.

---

## Part 1 - AI orchestration of the pipeline and features

Current state: Inngest is the durable brain (ADR-0002). The pipeline is plain functions wrapped by Inngest. AI features call Claude through the blocking `ask()` in `apps/web/lib/llm.ts`. There is no agent layer and no streaming.

Recommended stack:
- Vercel AI SDK v5 with `@ai-sdk/anthropic` plus AI Elements, in `apps/web` only, for streaming the interactive surfaces. This is the ONLY Part-1 item with a real, visible payoff at this stage.
- An agent layer (Inngest AgentKit, or Mastra) is explicitly DEFERRED to Later, gated on a concrete agentic task the current code cannot express.

Why the agent layer is deferred, not adopted now: the existing pipeline (`waterfall.ts`, `sequencing/inngest.ts`) is already a deterministic, durable, code-routed flow that works. This plan's own invariants force the router to be code-based and constrain the LLM to "only drafts and classifies," which is exactly what the current functions already do, with no agent framework. AgentKit was previously justified by "makes the flywheel genuinely agentic," but that is a capability the invariants deliberately hold near zero, so adopting AgentKit now is a solution looking for a problem at a one-customer, zero-live-send stage. The trigger to revisit: a concrete agentic task that the current `step.run` / `step.ai.infer` composition genuinely cannot express, named at the time. Mastra is held only as a swap candidate behind that same trigger. Neither is a Now or Next item.

The streaming AI SDK is kept because it has an immediate, visible result: Claude's reasoning streaming token by token into the Close Room over the existing dry-run system, with no new hosted infra.

Integration: the AI SDK lives only in `apps/web`. Wrap, do not replace, `apps/web/lib/llm.ts` with a new `streamAsk()` built on `streamText`, reusing the same `MODEL_IDS` tiers and the canon system prompt, returning `toUIMessageStreamResponse()`. The blocking `ask()` stays for non-interactive callers. None of `packages/*` or NOVA is touched. Note: `@ai-sdk/anthropic` and `ai` are NOT yet in `pnpm-lock.yaml` (verified), so this is a net-new dependency pair; keep it to those two packages.

The read-only internal MCP server (official `@modelcontextprotocol/sdk`) is a Later nicety, not a Now/Next item. It serves operator convenience (query the DB, fetch a company's signals or score, run a grounded lookup), never the product or the send path. Per ADR-0002, MCP stays read-only and build-time only; no MCP tool can flip DRY_RUN, send, or mutate the approval queue.

Visible result (Now): tokens streaming into the Close Room over the existing dry-run system, while the score and the send stay provably code-owned.

Effort: M (streaming wrap). Agent layer and MCP server: deferred, not estimated until triggered.

---

## Part 2 - Prompt optimization and evals

Current state: a competent but narrow hand-rolled harness in `packages/integrations/src/llm/evals` (runner.ts plus cases.ts) with code-predicate assertions. No regression diffing, no CI gate, no prompt optimizer, no rationale-quality judge.

Recommended stack:
- promptfoo as the CI regression and eval gate. PRIMARY, do this first, and it is the ONLY eval/optimizer tool adopted now.
- Ax (`@ax-llm/ax`), DSPy-for-TypeScript, as an offline prompt optimizer: LATER.
- DSPy GEPA / MIPROv2 and DeepEval: these live in NOVA's external repo for the voice prompts; they are NOT this repo's work and belong on NOVA's roadmap.
- `autoevals` and a Langfuse LLM-as-judge: LATER, not now.

Why one tool, not five: earlier drafts named Ax AND DSPy/GEPA AND DeepEval AND autoevals AND promptfoo AND a Langfuse judge, which is five overlapping eval/optimizer systems for a one-person team at zero live sends. promptfoo alone is the natural evolution of the existing harness: the code predicates become `javascript` asserts (so code still judges and the LLM never emits the number), and you gain dataset snapshots, regression diffs, an `llm-rubric` judge for the scoring RATIONALE prose (only the prose, never the tier), a web report, and a CI gate. Everything else is deferred until promptfoo's gate is green and a real quality gap appears in live runs.

Integration: promptfoo replaces the bespoke `summarise()`/`runFn` plumbing in `runner.ts` while keeping `cases.ts` as labelled data. Its provider points at the same `apps/web/lib/llm.ts` `ask()` seam so eval traffic flows through the one Anthropic client. Wire `promptfoo eval --no-cache` as a turbo task plus a GitHub Action gated on pass-rate. promptfoo is NOT yet in `pnpm-lock.yaml` (verified); pin it and rely only on the OSS CLI (it was acquired by OpenAI in March 2026 but remains MIT; re-verify the license at adoption time).

When Ax is later adopted, it runs strictly offline in `scripts/optimize-prompt.ts` against the same promptfoo dataset, evolves the wrapper around `canon.ts` (never authors the canon), and the winning prompt is frozen and checked in; the runtime keeps using LlmClient so the boundary holds. NOVA's DSPy work stays in NOVA's repo.

Visible result (Now): a red and green CI gate that blocks any prompt or canon change that drops pass-rate, with the `llm-rubric` judge grading only rationale prose. The human send-gate stays authoritative; judges only flag regressions.

Effort: M (promptfoo gate). Ax offline script: deferred.

---

## Part 3 - Retrieval and RAG for the canon and Knowledge

Current state: `apps/web/lib/canon.ts` is roughly 9 to 10K tokens and already ships whole in a prompt-cached system block via the knowledge grounding path. Cheap, zero retrieval-failure risk, trivial citation, CONFIRM-token discipline intact.

Recommended stack:
- Now: keep the cached whole-canon prompt block exactly as is. Do not build RAG.
- Later, when the corpus outgrows the context window: pgvector HNSW plus pg_search BM25 inside Neon, fused via RRF k=60.
- Anthropic Contextual Retrieval as the ingestion technique (per-chunk context via `claude-haiku-4-5`).
- Voyage `voyage-3.5` plus `rerank-2.5`, with Cohere Embed v4 plus Rerank 3.5 as the Arabic / MENA alternative.
- Turbopuffer kept as the one-adapter scale escape hatch.

Why: a chunking, embedding, and reranking pipeline before the corpus needs it trades a zero-failure design for embedding-drift and stale-index failures, for no gain at this size. The trigger to build is folding NOVA transcripts, per-deal CallFindings, and playbook history into Knowledge. Then buy the technique and the models; do not hand-roll contextualization or train a reranker, and do not adopt LangChain or LlamaIndex as a runtime (too heavy, smears vendor types across clean ports).

Integration: when triggered, add a `KnowledgeChunk` Prisma model and a thin `KnowledgeStore` port (plus Embedder and Reranker ports) under the existing adapter discipline in `packages/integrations`. Embeddings live in Neon (pgvector) so they sit beside leads and findings for same-SQL filtering and PDPL residency. An Inngest ingest job in `packages/orchestration` contextualizes, embeds, and upserts by `contentHash` (idempotent). Each chunk carries `source`, `sourceUrl`, `contentHash`, `updatedAt` for exact citations; store model id and dimension per chunk so an embedder swap is contained. Q&A calls the port, never raw SQL. Provider selection (Voyage vs Cohere) is a config flip in `packages/config`. The CONFIRM discipline stays; retrieval never feeds the deterministic scorer. PDPL note: transcript ingestion is cross-border processing; gate it like live voice and prefer no-retention endpoints. `pgvector` is NOT yet in the lockfile; it arrives only with this Later work.

Visible result: Knowledge Q&A and Close Room answers that cite the exact canon section or the exact transcript line behind each claim, with a freshness stamp and (later) a faithfulness score, including bilingual Arabic and English queries, scaling cleanly with no caller or NOVA change.

Effort: S now (nothing to build), M-L later (thin ports plus ingest job).

---

## Part 4 - Voice: NOVA from demo to live (an EXTERNAL prerequisite, not a top bet)

Current state and ownership: NOVA is an EXTERNAL hosted service at `api.novalabs.ae` ("the team's production 4-phase LiveKit agent," per `scripts/nova-call.ts`). It is not in this repo: there is no Python source, no `requirements.txt`, no `pyproject.toml` here. This repo's ONLY NOVA surface area is three things: (a) `packages/integrations/src/nova/findings.ts`, the Zod-able anti-corruption parser (in-repo, ours); (b) `scripts/nova-call.ts`, the HTTP client; and (c) the `apps/web/app/voice` and `/dojo` surfaces. The plan is confined to those three. Everything about LiveKit, Telnyx/Twilio, Deepgram, Cartesia/ElevenLabs, turn detection, Presidio, and immudb-inside-NOVA belongs to whoever owns the `novalabs.ae` codebase. State explicitly at planning time whether `novalabs.ae` is the founder's own codebase or a third-party vendor; if third-party, none of the voice-stack work below is actionable from this repo and must be tracked as a vendor dependency.

Re-scoped as an EXTERNAL prerequisite (NOT in-repo, NOT top bet #1): the demo-to-live voice work (LiveKit Agents + LiveKit Cloud SIP; Telnyx primary, Twilio failover; LiveKit `inference.TurnDetector` over Silero VAD plus Deepgram Flux STT; Cartesia Sonic for English, ElevenLabs Flash v2.5 for Arabic, language-routed; Coval simulation as the CI compliance gate; STT/TTS/carrier behind NOVA-side provider switches). This is the verify-by-conversation moat and it is genuinely hard to copy, but it does not live in this repository. Do NOT switch frameworks (Pipecat, Vapi, Retell, Bland would throw away the moat and collide with LLM-never-scores and no-vendor-leakage). All of this is tracked in `docs/PRODUCTION-CHECKLIST.md` as a NOVA-go-live track, gated on TDRA local-number plus script pre-approval, which is a non-code blocker.

What IS in-repo and in scope for this plan:
- The `nova/findings.ts` Zod boundary: add the residual-PII assertion here (see Part 11), since this IS our code.
- `scripts/nova-call.ts`: the HTTP client to NOVA's `get_call` and dial endpoints.
- The `apps/web/app/voice` and `/dojo` surfaces: streaming UI (Part 9), grounded in the same `MODEL_IDS` and canon.

The contract between this repo and NOVA: the Inngest send-gate in `packages/orchestration` is the authority that releases a number to NOVA; NOVA's own compliance phase (in its repo) gives the AI disclosure and captures consent and writes findings back through `get_call`, which `findings.ts` parses. Route live qualification turns to fast tiers (`claude-haiku-4-5` / `claude-sonnet-4-6`); reserve opus for offline analysis to hold the latency budget. These tiering choices are advisory to NOVA's owner.

Visible result (in this repo): the `findings.ts` boundary rejects residual PII; the voice/dojo surfaces stream cleanly. Visible result (in NOVA's repo, external): a live UAE PSTN call that sounds human, gives AI disclosure, qualifies by conversation, and writes verified findings.

Effort (this repo): S (findings.ts assertion plus voice/dojo streaming). NOVA-side: L, but external and out of scope here.

---

## Part 5 - Enrichment and signals waterfall (the differentiator, correctly grounded)

Current state: a real waterfall in `packages/orchestration/src/waterfall.ts` (cascade, cost ceiling, early-stop, per-field provenance in `company.sources`) over Clay, Apollo, Explorium, plus signals from TheirStack, PredictLeads, Exa. The SignalType enum in `packages/core/src/types.ts` currently holds hiring, funding, tech_adoption, job_change, news, web_change.

Recommended stack:
- A DLD / Dubai Pulse adapter as region-native ground truth and the strongest signal. The single biggest differentiator, but ONLY the part that is genuinely free is treated as buildable now (see the split below).
- Everything else (Firecrawl, Explorium-as-SignalProvider, Exa Websets, Linkup, PDL, Ocean.io, Serper, Stagehand) is a FALLBACK the existing six-rail waterfall does not need until a real coverage gap appears in a live run. None is a Now item.

Why one new rail, not eight: global vendors are thin on MENA, and DLD is the authoritative source of which developers are actually transacting. That is the real, region-native timing signal no off-the-shelf intent vendor produces. But the existing waterfall (Clay, Apollo, Explorium, TheirStack, PredictLeads, Exa) already covers commodity enrichment and signals, and nothing has run live once. Adding PDL, Ocean, Serper, Stagehand, Firecrawl, and Linkup now is tool sprawl: eight new rails on top of six, none of which is justified until live runs reveal a specific gap. So the only net-new data rail adopted now is DLD, and only its free half.

### The DLD claim, split into what is free and what is gated

Earlier drafts called the DLD adapter "a thin wrapper over a free government API" surfacing both an "off_plan_launch" (Oqood) signal and a "transaction_spike" signal. Verification against official sources shows that is half-overstated, and the two signals have very different access realities:

- `transaction_spike` is REAL and FREE, and it is the genuine differentiator. DLD registered-transaction data is published as open data on Dubai Pulse (datasets `dld_transactions-open` and `dld_transactions-open-api` under dld-transactions). It is free, available as a regularly-updated bulk CSV AND as an OAuth-protected REST API. This is buildable now.
  - It is NOT a "thin wrapper," though. The OAuth model issues an API key plus secret (delivered in two emails on first dataset grant), which you exchange at `https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken` for a token that EXPIRES (for example, every ~30 minutes), so the adapter must handle token refresh. There is a max-results limit and a filter syntax. The bulk-CSV path needs a periodic rebuild/ingest job. Both have real engineering cost (token-expiry handling, pagination, CSV rebuild), which the effort estimate must reflect.

- `off_plan_launch` via the Oqood / TAS off-plan registration data is NOT openly accessible. The DLD API Gateway (Oqood/TAS) requires being a registered, ACTIVE DLD business with an Oqood developer account and a formal onboarding process, not an instant key. A solo founder may not qualify. So this single signal cannot be keyed to the gated Oqood API at will. Two acceptable resolutions, in order of preference:
  - (a) PREFERRED: derive an `off_plan_launch` PROXY from the SAME free open transaction/registration datasets, for example a new-project first-registration spike visible in `dld_transactions-open` / the `dld-registration` open units datasets, rather than the gated Oqood API. This keeps the signal free.
  - (b) FALLBACK: flag Oqood API Gateway access as an explicit PREREQUISITE with a DLD-business-account onboarding dependency, and until granted, back the signal with Bayut / Property Finder listings or the DLD residential sale index. Do not ship code that assumes Oqood access exists.

### Mandatory first task: a 1-day DLD spike

Per CLAUDE.md ("Verify every provider's CURRENT API/limits/auth against official docs before integrating; do not assume from memory"), the FIRST DLD task, before any adapter code, is a 1-day spike that confirms, against official Dubai Pulse / DLD docs: dataset availability and freshness (how stale is "open"?), the OAuth model and token lifetime, rate and max-result limits, and the data LICENSING terms for commercial signal use. Gate all other DLD work on that spike passing. If the open transaction data is not fresh enough to be a "this week" signal, or not licensable for commercial use, then "transaction spike this week" is fiction and the differentiator must be re-grounded before a single line of adapter code.

Integration: the DLD source stays behind the existing SignalProvider contract (and, for transaction-volume firmographics, EnrichmentProvider); it never touches core or the send path. Add new SignalType enum values to `signalTypeValues` in `packages/core/src/types.ts` (`transaction_spike`, and `off_plan_launch` only once its source is settled per (a) or (b)) BEFORE mapping, and give them TTLs in `DEFAULT_SIGNAL_TTL_DAYS` in `signal-windows.ts`. The DLD call (token fetch plus query, or CSV rebuild) is wrapped in its own `step.run` (Part 6) so retries do not re-bill or re-refresh needlessly. Keep the existing rails as the fallbacks they already are. No Firecrawl, Explorium-SignalProvider, Linkup, PDL, Ocean, Serper, or Stagehand is wired now; each is added only when a named live-run coverage gap demands it, and each counts against the 3-vendors-per-quarter cap.

Visible result: a lead card that shows a region-native, citation-backed reason to call now ("Developer X shows a DLD transaction spike this week"), with full per-field provenance, grounding the deterministic fit score on real DLD transaction volume rather than scraped firmographics. The off-plan-launch reason appears only once its free proxy or its gated access is in place.

Effort: M-L (DLD spike plus the free transaction_spike adapter, including OAuth token-refresh and CSV-rebuild engineering, not a trivial wrapper). off_plan_launch: S if proxy (a) is feasible; otherwise blocked on Oqood onboarding. All other rails: deferred, S each when triggered.

---

## Part 6 - Durable runtime orchestration and the send-gate

Current state: Inngest is wired and serving. `waterfall.ts` is one plain async loop. The approval flow passes a static approval state in the payload rather than suspending. `evaluateSendGate` already runs inside `send-step.ts` on every execution. There is no declarative flow control on the send step.

Recommended stack: stay on Inngest and exploit capabilities not yet used. Trigger.dev, Restate, Temporal, DBOS, and Hatchet are noted only as future escape hatches behind explicit triggers.

Why: Inngest already is the orchestration brain, the integration is wired (`inngest@3.54.2` is in the lockfile), and the pure functions keep the engine swappable. Migrating engines now is churn, not progress. The decision rule to ever switch: per-execution billing on many long cadences gets painful, the sleep cap blocks genuinely multi-week cadences, or one durable engine must span the TS pipeline and the Python NOVA service. Until one is real, do not move.

Integration (all inside `packages/orchestration`, none touching the adapter boundary or the scorer):

1. Make the send-gate a durable suspend. Add `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })` immediately before `executeSendStep` in `sequencing/inngest.ts`. The Close Room approval emits that event; the run resumes at zero compute. `evaluateSendGate` STILL runs on resume as the final, non-memoised code gate, so DRY_RUN can never be replayed away. This is the single highest-value, lowest-risk change in the whole plan, and it is pure TS in one file.

2. Move channel rate limits to declarative flow control. Attach `throttle` keyed by mailbox and channel, and `concurrency` keyed by contact, to the sequencing function, enforcing LinkedIn, WhatsApp, and per-mailbox caps plus quiet hours (per the channel-limits and email-deliverability conventions) on the platform instead of in ad-hoc checks. (NEXT, not Now: the value is real but there is nothing live to rate-limit yet.)

3. Wrap each `EnrichmentProvider.enrichCompany` call in the waterfall in its own `step.run` so a retry memoises matched providers instead of re-billing them. (NEXT.)

### Where step.ai.infer may and may not be used: resolving the chokepoint contradiction

`step.ai.infer` is a real Inngest feature, and an earlier draft proposed wrapping "Claude personalisation in `step.ai.infer` so model latency is not billed as compute." That CONTRADICTS the ONE-Anthropic-chokepoint and ONE-OTel-span invariants, and the contradiction must be resolved explicitly rather than asserting both. Verified behaviour: `step.ai.infer` offloads the inference through INNGEST'S OWN AI gateway (Inngest proxies the request to the provider; it does not run your code during the call). So an inference issued via `step.ai.infer` does NOT pass through `LlmClient.complete()`. That means it would NOT emit the single OTel GenAI span, would NOT produce the `CostRecord`/`ProviderCost` row, and would split the chokepoint into two paths. That is unacceptable for any traced or costed Claude call.

Resolution:
- Personalisation, scoring rationale, and EVERY Claude call we trace or cost stays on `LlmClient.complete()` inside a plain `step.run`. The OTel span and the `CostRecord` still fire. We accept that the inference latency bills as step compute, and we use `step.run` memoisation so a retry does not re-bill the same call.
- `step.ai.infer` is reserved ONLY for calls we DELIBERATELY exclude from the OTel/cost chokepoint (and we say so at the call site). At the current stage there are essentially none, so `step.ai.infer` is effectively unused for now.
- The one acceptable way to have both: wrap `LlmClient` so that it is the IMPLEMENTATION behind a `step.ai.infer`-style call (the gateway calls back into our client, preserving the span and cost record). Only pursue that if Inngest's gateway can be pointed at our own endpoint; otherwise keep everything on `step.run` + `LlmClient`.

Keep all Inngest-shaped config only in `sequencing/inngest.ts` so a future engine port rewrites one file.

Visible result (Now): the Close Room approval becomes a true durable human-in-the-loop. A required regression test proves the invariant: a run that suspends, receives approval, then resumes with DRY_RUN on still returns "simulate". The most dangerous action in the system becomes the most provably controlled. (Throttle/concurrency and per-provider `step.run` follow in Next.)

Effort: S (the `waitForEvent` suspend plus its regression test, Now), M (throttle/concurrency plus per-provider `step.run`, Next).

---

## Part 7 - Data platform, the moat, and analytics

Current state: Neon Postgres is the OLTP system of record and already encodes the moat (per-field provenance in `sources`, freshness and decay via `detectedAt` and `expiresAt`, AuditLog, ProviderCost, CallFinding). No OLAP layer, no analytics marts. Crucially: the system has produced zero live sends, zero replies, and zero CallFindings, so there is nothing to model yet.

Recommended stack:
- Keep Neon as the single OLTP system of record. Keep Prisma 7 (migrating to Drizzle is high-risk, low-reward churn).
- pgvector inside Neon for canon and transcript semantic search (no separate vector store): LATER, with Part 3.
- The entire analytics layer (dbt, OpenLineage, DuckDB marts, and certainly ClickHouse and Metabase): LATER, explicitly trigger-gated.

Why almost all of this is Later: a time-series moat compounds only once there IS a time series. With zero sends, zero replies, and zero findings, `fct_score_history`, `dim_company_provenance`, and `fct_signal_decay` would run over fixtures or an empty Neon, and the promised "Metabase cockpit showing cohort reply-rate over 18 months" is impossible by definition for ~18 months. Standing up dbt, DuckDB, OpenLineage, and (later) ClickHouse/Metabase before the first send is building the analytics floor of a skyscraper before the first tenant moves in. The trigger to start the analytics layer: "we have N weeks of real send-and-reply data worth a cohort question." When that fires: dbt Core on a DuckDB-in-CI mart over a Neon dump first (free, low-ops); ClickHouse fed by ClickPipes / PeerDB CDC and self-hosted Metabase only when volume strains Postgres or a buyer's data room demands it. Never hand-roll Postgres-to-warehouse replication.

The ONE Part-7 item worth doing early: the data-contract idea expressed as PLAIN Prisma/SQL CI tests, not dbt. A simple test that asserts "every `Company` field has a corresponding entry in `sources`," and freshness assertions on `detectedAt`/`expiresAt`, needs no dbt, no DuckDB, and no new tool. It runs against the existing schema today and gives the buyer-data-room provenance story without any new infra.

Integration (when the analytics layer is later triggered): Neon stays the Prisma datasource, untouched in `packages/db`. The analytics layer is downstream, read-only, and service-isolated, behind a new read-only AnalyticsStore contract in `packages/integrations`, never on the OLTP, scoring, or send path (CDC lag must never be read by the scorer). dbt models turn replicated tables into tested, documented marts where freshness SLAs and provenance become data-contract tests. ClickHouse, when graduated, is fed by ClickPipes from Neon's logical replication slot so no app code writes to it. OpenLineage is emitted from orchestration Inngest steps and dbt runs. Marts are aggregate and de-identified for PDPL with an explicit egress control. NOTE on hosting: a self-hosted Metabase needs a Fly or Railway account that does not exist yet (the app is on Vercel); that account is an explicit prerequisite cost when this layer is finally built. None of `dbt`, ClickHouse, or Metabase tooling is in the lockfile today.

Visible result (Now): plain CI tests prove every field's provenance and freshness as data contracts, with no new tool. Visible result (Later): a Metabase cockpit over real cohort data once it exists.

Effort: S now (plain Prisma/SQL data-contract tests), L later (dbt, CDC, ClickHouse, Metabase), all trigger-gated.

---

## Part 8 - LLM observability and cost

Current state: Sentry is installed (`@sentry/*` 10.58 in the lockfile) and `apps/web/lib/llm.ts` already calls `captureException` and `captureMessage`. The adapter calls Anthropic via raw `fetch` (deliberately no `@anthropic-ai/sdk`), so Sentry's Anthropic auto-instrumentation does not fire. `@opentelemetry/*` is already present transitively (verified). No quality, cost-per-lead, or regression lens yet.

Recommended stack:
- Keep Sentry as the FAILURE, exception, and APM lens.
- NOW: emit ONE OpenTelemetry GenAI span at `LlmClient.complete()` to SENTRY ONLY. This is cheap, in-repo, and needs no new hosted service.
- LATER: add Langfuse as the QUALITY, COST, and REGRESSION lens, self-hosted for PDPL. Deferred because self-hosting it requires a Fly/Railway account that does not exist yet, and there is no live traffic to evaluate.
- OpenTelemetry GenAI semantic conventions remain the ONE swappable span contract, so adding Langfuse later is a span-processor registration, not a rewrite.

Why Langfuse is Later and licensed carefully: Langfuse is genuinely the strongest self-hostable quality lens, but two facts move it out of Now. First, it self-hosts on Docker and so needs a host (Fly/Railway) the Vercel-based app does not currently have. Second, the license is dual: Langfuse is "MIT licensed, except for the `ee/` folders." Core OTel-backend ingestion and tracing ARE MIT and PDPL-self-hostable. But several managed-evaluation / LLM-as-judge surfaces and some RBAC/SSO capabilities historically live under the EE (commercial) license, and "some add-on features require a license key when self-hosting" per Langfuse's own docs, without a crisp public matrix of which evaluator features are MIT vs EE. So describe it as "(MIT core; some managed evaluators / RBAC / SSO are EE-licensed)," NOT a blanket "(MIT)." At adoption time, confirm which specific evaluator/LLM-as-judge feature is needed and whether it is MIT or EE. If the grounding-adherence judge is EE-gated, either run it via the MIT code-evaluators path PLUS our own `LlmClient`-driven judge (keeps it MIT, on-region, and on the chokepoint), or budget for the Langfuse commercial license. The EE/commercial license also matters for a buyer data room and should be disclosed there.

Integration (Now, Sentry-only): wrap the single Claude call site, `LlmClient.complete()` in `packages/integrations/src/llm/client.ts`, in one OTel GenAI span. The adapter already returns `usage` plus a `CostRecord`, so input and output tokens and `costUsd` pass straight through, no double-counting; ProviderCost in Postgres stays the billing source of truth. Add a MANUAL span rather than swapping to the SDK just for auto-instrumentation (the raw-REST adapter stays). Register the span processor in a server-only OTel init (`apps/web/instrumentation.ts` plus a NodeSDK bootstrap in the orchestration workers). Attach `leadId`, `contactId`, and `feature` (close-room, qa, voice-dojo) as trace metadata for cost-per-lead. Pin the OTel semconv (`gen_ai.prompt` / `gen_ai.completion` deprecation churn).

Integration (Later, add Langfuse): register a LangfuseSpanProcessor alongside Sentry's so the SAME spans fan out to both. Promote the existing `evals/runner.ts` code predicates to Langfuse code-evaluators (the MIT path) and add at most ONE LLM-as-judge for canon-grounding adherence on a sampled fraction, run async, never inline, never on the send-gate path, and only after confirming its license tier. Route NOVA's DSPy traces (from NOVA's external repo) into the same Langfuse project for one pane across text and voice. Arize Phoenix on Postgres is the documented Plan-B backend. Self-host keeps PDPL residency under our control. `langfuse` and a Langfuse host are net-new; neither exists today.

Visible result (Now): cost-per-lead and latency per Claude call visible in Sentry, with the span contract OTel-standard so the backend stays swappable. Visible result (Later): one pane across text and voice with a per-prompt-version grounding-adherence score. No observability score ever feeds the deterministic scorer or relaxes DRY_RUN.

Effort: M (OTel span to Sentry, Now), M (Langfuse self-host plus judge, Later).

---

## Part 9 - Frontend and AI UX and dashboards

Current state: `apps/web` already has the shadcn DNA (clsx, tailwind-merge, class-variance-authority, lucide-react, hand-rolled `ui/` primitives) on Tailwind v3.4. AI features call the blocking `ask()` and wait for the whole completion. Charts and grids are hand-built. None of `tremor`, `@tanstack/react-table`, `motion`, or the AI SDK is in the lockfile (verified).

Recommended stack (pruned to one tool per job):
- shadcn/ui plus Radix as the formalised foundation. Adopt now alongside streaming.
- Vercel AI SDK v5 (`@ai-sdk/anthropic`) plus AI Elements (Reasoning, Tool, Sources, Conversation, PromptInput) for the streaming Close Room, Knowledge Q&A, and Voice Dojo. Now.
- TanStack Table v8 plus TanStack Query v5 for the Leads view and Approval Queue. Next.
- DEFERRED until a real need: Tremor + Recharts (the analytics dashboard has no real data yet, per Part 7), Motion (micro-interactions are polish), and TanStack Virtual (only when lists are actually slow). Earlier drafts named six frontend libs at once; three is enough until one visibly hurts.
- The Tailwind v3-to-v4 migration is the one upgrade with real blast radius: do it as its own isolated, `pnpm verify`-gated PR, NEXT, not bundled into the streaming work.
- assistant-ui documented as the fallback only; never run two chat paradigms at once.

Why: buy the presentation layer, build the brain and the boundary. Streaming chat UI and data grids are solved problems and copy-in source you own. Formalising on shadcn unlocks the AI Elements and TanStack registries through one CLI. Charts and animation wait because there is nothing to chart and nothing slow to animate yet.

Integration: all copy-in, MIT or Apache, `apps/web` only, none touching `packages/*` or NOVA. Convert the blocking `ask()` server actions to `streamAsk()` built on `streamText` (Part 1), reusing the same `MODEL_IDS` tiers and the canon system prompt; the LLM streams prose and reasoning ONLY, never the number. Use `streamObject` plus Zod (the same `packages/core` schemas) for typed findings and objection-maps validated at the boundary. AI Elements Sources cites canon passages. TanStack tables read the `@oie/db` unified model via Server Components, never a vendor shape and never computing a score. A TanStack Query mutation on the approval queue may flip approval UI state (and emit the `oie/send.approved` event from Part 6) but the gate stays server-enforced in `packages/orchestration` and can never bypass DRY_RUN. Add a test that the score path never reads model text. Do not adopt the Vercel AI Gateway or assistant-ui Cloud.

Visible result (Now): Close Room, Knowledge Q&A, and Voice Dojo stream Claude's reasoning token by token with cited canon sources. Visible result (Next): dense, sortable, instantly responsive leads and approval grids after the Tailwind v4 migration.

Effort: M (streaming surfaces plus AI Elements, Now), M (Tailwind v4 migration plus TanStack grids, Next), charts/animation deferred.

---

## Part 10 - Infra, auth, and security (rewritten against the Vercel reality)

Current state and TOPOLOGY CORRECTION: the deployed unit is `apps/web` on VERCEL (git-connected auto-deploy, Auth.js v5 single-operator JWT creds), backed by Neon and Inngest Cloud, with Sentry installed. Secrets live in Vercel project env vars (synced via `scripts/sync-keys-to-vercel.sh` and `scripts/_set_vercel_env.py`) plus local `.env`, with `.env.example` as the registry. The root `fly.toml` is STALE and is NOT the deployed origin. There is no rotation, audit, feature flags, or edge perimeter yet.

Earlier drafts assumed a Fly origin and recommended "restrict Fly to accept only Cloudflare IPs." That is MEANINGLESS for a Vercel-hosted Next app: Vercel sits behind its own edge and cannot be IP-locked to Cloudflare the way a Fly origin can. The whole perimeter design is rewritten for the actual topology.

Recommended stack (Vercel reality):
- Edge perimeter and WAF and rate limiting: use VERCEL'S OWN WAF, firewall rules, and rate limiting (which apply at Vercel's edge in front of `apps/web`). Do NOT design a "Fly origin behind a Cloudflare IP allow-list," because there is no Fly origin. If you genuinely want Cloudflare in front, that only works if you move the origin OFF Vercel (a separate, gated decision below), so for now the perimeter is Vercel-native.
- Upstash Redis plus `@upstash/ratelimit` for per-identity limits, idempotency, and hot caches. NEXT, not Now: there is no live send to rate-limit yet.
- Infisical as the upstream secrets source of truth syncing INTO Vercel env (not `flyctl secrets`), CI, and local env. NEXT.
- PostHog (or self-hosted Flagsmith for PII-sensitive flags) for feature flags. NEXT.
- Keep Vercel, Neon, Auth.js v5, Inngest, Sentry as-is. Hold Better Auth and WorkOS AuthKit as trigger-gated roadmap items.

If a Fly migration is genuinely intended (the stale `fly.toml` suggests one was attempted): make that migration an EXPLICIT, gated line item BEFORE any Fly-hosted sidecar or any "Fly behind Cloudflare" rule, because everything in Parts 7/8/10 that wants a Fly origin or a Fly-hosted service depends on it. Until that migration is decided and done, all "self-hosted on Fly" items (Langfuse, Metabase, immudb) are blocked on standing up a Fly or Railway account that does not exist, and that account is the prerequisite cost to name.

Why this is still the right posture (Vercel-native): highest posture gain for a solo operator with zero code lock-in. Vercel's WAF enforces at its edge so a middleware bug cannot bypass it. Upstash enforces semantic per-identity limits inside the app where you know the operator, lead, channel, and cost. Infisical sits upstream of the env flow you already own, adding rotation and audit without rebuilding env injection. Flags are the safety rail for the most dangerous switches. Building SSO/SAML/SCIM is the textbook reinvention trap; defer to WorkOS on a customer trigger. Clerk is rejected because the server would not own session decryption.

Integration: Vercel WAF/firewall rules protect `/signin`, `/api/inngest`, `/api/health`, and future NOVA webhooks before requests burn LLM or provider budget; stage rules in log/observe mode first. Upstash (Next) sits behind a thin internal RateLimiter helper (INFRA, behind a small internal interface, NOT a vendor adapter) wired into `apps/web/middleware.ts` and around `apps/web/lib/llm.ts` plus the send-gate; it MUST fail OPEN for read paths but fail CLOSED for the send-gate, mirroring the DRY_RUN-safe default; PII never enters Upstash (counters, idempotency keys, non-PII cache only); pin to EU / Frankfurt for PDPL. Infisical (Next) syncs into Vercel env so the app still reads `process.env` (invariant preserved); `.env.example` stays the human-readable registry. Flags (Next) live behind a tiny `apps/web/lib/flags.ts` and gate REACHABILITY of live-send, NOVA's DEMO_MODE exit, and model-tier rollouts; they NEVER flip DRY_RUN or compute a score.

Visible result: a Vercel-native enterprise-grade perimeter a brokerage security review passes, WAF plus (Next) per-identity rate limits, rotated and audited secrets, and a kill-switch flag that can instantly disable live-send reachability or NOVA's DEMO_MODE exit without a deploy and without ever auto-clearing the send-gate.

Effort: S (Vercel WAF/firewall rules, Now), S each (Upstash helper, Infisical, flags, Next). Any Fly migration: separate, gated, M-L.

---

## Part 11 - Compliance, consent, and PII (cheap in-repo wins now, the rest gated on a real call)

Current state: COMPLIANCE.md flags a cross-border transfer gap (UAE lead data to a US LLM). The CallSession `consent` model is a single boolean plus `consentBasis` string. AuditLog is append-only BY CONVENTION ONLY. Suppression is email and domain only. And critically: NO live call is happening, NOVA is external and in DEMO_MODE, 0 keys are present, and TDRA approval is an explicit NON-CODE blocker per GTM.md. A cryptographic consent/DNCR/disclosure ledger with zero real consent events to record is pure scaffolding cost.

The sequencing error to fix: earlier drafts shipped immudb (a tamper-evident ledger as a Fly container), fail-closed external stubs, AND Presidio-inside-NOVA all as "Now" items, sequencing compliance machinery BEFORE the thing it protects exists, and before the Fly host it needs exists. The fix is to do only the compliance work that is cheap, in-repo, and immediately demonstrable now, and to defer everything that cannot be exercised before a real call.

### Now: cheap, in-repo, immediately demonstrable

- The Zod residual-PII assertion at the `nova/findings.ts` boundary. This IS in-repo code. After parsing a NOVA finding, reject any value still matching a residual-PII pattern, with a custom allow-list that keeps the +971-mobile finding (the moat) while removing other PII. This is the one PII control that lives in this repo.
- Extend the Suppression model to carry phone PLUS channel (one Prisma migration), so a future voice opt-out can write one durable cross-channel suppression. Cheap, in-place, and it readies the schema before the first call.
- Make the Postgres AuditLog GENUINELY append-only instead of append-only-by-convention: a DB trigger that blocks UPDATE/DELETE, or revoked UPDATE/DELETE grants on the table. This is a cheaper, in-place win that delivers most of immudb's value (tamper-resistance) with no new service, and it should be done BEFORE any external tamper-evident ledger.

### Deferred to the NOVA-go-live track, gated on TDRA approval and a real call

- Microsoft Presidio for transcript PII redaction: this runs INSIDE NOVA's external FastAPI service (at the `get_call` boundary), which is NOT this repo. It belongs on NOVA's roadmap, not this plan. We cannot run it here, and there is no transcript to scrub until a live call happens.
- immudb (cryptographically tamper-evident ledger): needs a Fly/Railway container that does not exist yet (the app is on Vercel), and has zero consent/DNCR/disclosure events to record until a real call. Defer until after the append-only Postgres AuditLog is in place and there is a live call to mirror.
- Fail-closed `ConsentStore`, `DncrProvider`/`SuppressionProvider` (tri-state, fail-closed on unknown), and `AuditSink` contracts in `packages/integrations/src/contracts`: shipped as fail-closed stubs only on the NOVA-go-live track, because none can be exercised before a real call, and TDRA DNCR access is itself a non-code blocker. When built, they are decided in CODE (the LLM never decides callable or sendable), in-house Prisma-backed first, OneTrust later. NOVA's pre-dial gate AND the Inngest send-gate both call `isConsented` and DNCR through these adapters and FAIL CLOSED on unknown.
- Skyflow UAE / Bahrain-resident PiiVault (behind a `PiiVault` contract): adopt at live-PSTN activation. Tokenize `Contact.phone`, `whatsapp`, `email`, and `CallSession.transcript` at the DB boundary; detokenize ONLY at send-adapter egress under the existing send-gate, so plaintext exists only for the microsecond a human-approved, DRY_RUN-off send needs it. The deterministic scorer never needs plaintext, so tokenization is painless. Skyflow needs no Fly host (it is a managed regional vault), but it has no work to do before a real send.
- Nightfall optional as a managed PII guard at the control-plane LLM egress: only if the in-repo Zod assertion plus on-region processing prove insufficient.

Why buy, not hand-roll (when these are finally built): do not hand-roll PII regexes (legacy regex DLP is 5 to 25 percent accurate), a tokenization or residency vault, or a Merkle ledger. Buy the data and the storage, own the gate. Huscribe sells compliance as the differentiator, so it must be provable code, not a promise, and every decision stays in code.

A non-skippable AI-caller-plus-recording disclosure and continue-or-stop checkpoint, logged as a CallFinding BEFORE the Pitch phase, is part of NOVA's compliance phase (NOVA's repo). Keep PII-scrubbing async and post-call so the TDRA 2-second-to-speak rule is not violated; keep pre-dial DNCR and consent checks fast and cached. Until TDRA DNCR access lands, the DNCR adapter ships as a fail-closed stub so DEMO_MODE stays provably safe.

Visible result (Now): residual-PII rejected at the in-repo findings boundary, a phone-plus-channel Suppression schema, and a genuinely append-only Postgres AuditLog, all demonstrable today without a single live call. Visible result (NOVA-go-live, external/gated): immutable disclosure logging, fail-closed DNCR and consent gates, and UAE-resident tokenized PII.

Effort: S now (Zod assertion plus Suppression migration plus append-only AuditLog). Deferred: M-L on the NOVA-go-live track (Presidio in NOVA, immudb, fail-closed stubs, Skyflow), gated on TDRA approval.

---

## Phased roadmap

The "Now" phase is deliberately cut to THREE items that each produce a visible result on the existing dry-run system WITHOUT any new hosted infra. Everything else moved to Next or Later. Rationale: the founder should first get ONE real provider key in and watch one lead flow end to end before standing up a WAF, a secrets manager, a tamper-evident ledger, and a tracing backend. An earlier draft bundled ~25 net-new integrations across seven concurrent workstreams into four weeks for one person; that is not shippable.

### Now (weeks 0 to 4): three near-zero-infra, pure-TS wins on the existing system

1. The durable send-gate: add `step.waitForEvent('await-approval', ...)` before `executeSendStep` in `sequencing/inngest.ts`, with `evaluateSendGate` re-running on resume. Add the regression test: suspend, approve, resume with DRY_RUN on, still returns "simulate". Single highest-value, lowest-risk change; pure TS in one file.
2. promptfoo over the existing `cases.ts` as a CI gate: migrate the bespoke harness, wire `promptfoo eval --no-cache` as a turbo task plus a GitHub Action gated on pass-rate.
3. The OTel GenAI span at `LlmClient.complete()` emitting to SENTRY ONLY (defer self-hosted Langfuse), with cost-per-lead metadata.

Plus, if time remains, the cheap in-repo compliance trio and the streaming Close Room are the next-cheapest wins (no new hosted infra): the Zod residual-PII assertion at `nova/findings.ts`, the Suppression phone-plus-channel migration, the append-only Postgres AuditLog, and `streamAsk()` in `apps/web/lib/llm.ts` with AI Elements. These are low-risk but secondary to the three core items.

### Next (1 to 3 months): the DLD differentiator, streaming UI, the perimeter, and live-readiness

- DLD / Dubai Pulse: FIRST the 1-day spike (confirm availability, OAuth/token lifetime, rate limits, freshness, and commercial licensing against official docs); then, gated on that spike passing, the free `transaction_spike` adapter (OAuth token-refresh plus CSV-rebuild ingest) and the `transaction_spike` SignalType enum value and TTL. `off_plan_launch` only once its free proxy (first-registration spike from open datasets) or its gated Oqood access is settled.
- Streaming UI everywhere: `streamAsk()` plus AI Elements across Close Room, Knowledge Q&A, Voice Dojo; the test that the score path never reads model text.
- Inngest: declarative throttle/concurrency for channel and mailbox caps and quiet hours; wrap each waterfall provider in its own `step.run`.
- Perimeter (Vercel-native): Vercel WAF/firewall rules (log/observe mode first); the Upstash RateLimiter helper (fail-open reads, fail-closed send); Infisical as upstream secrets sync into Vercel env; feature flags (PostHog or Flagsmith) guarding live-send and NOVA DEMO_MODE-exit reachability.
- Frontend foundation: shadcn/ui formalised plus the gated Tailwind v3-to-v4 migration PR; TanStack Table and Query for leads and approval queue.
- Compliance (NOVA-go-live track, gated on TDRA): fail-closed `ConsentStore`, `DncrProvider`/`SuppressionProvider`, `AuditSink` stubs.
- Plain Prisma/SQL data-contract CI tests ("every Company field has a source," freshness assertions): no dbt, no DuckDB, no new tool.

### Later (scale-triggered or customer-triggered, deferred on purpose)

- The agent layer (Inngest AgentKit on the Inngest backend, or Mastra as the swap candidate), only when a concrete agentic task the current `step.run`/`step.ai.infer` composition cannot express is named.
- The read-only internal MCP server (official TS SDK) for Claude Code and operator agents; read-only, build-time, never the send-gate.
- Self-hosted Langfuse as the quality/cost/regression lens (registered as a second OTel span processor), once a Fly/Railway host exists and there is live traffic to evaluate; confirm MIT-vs-EE for the specific judge feature at adoption. Route NOVA's DSPy traces in for one pane.
- Ax offline prompt optimization (`scripts/optimize-prompt.ts`) evolving the canon wrapper against the promptfoo dataset; freeze and check in the winner.
- The remaining enrichment rails (Firecrawl, Explorium SignalProvider, Exa Websets/Monitors, Linkup, PDL, Ocean.io, Serper, Stagehand), each only when a named live-run coverage gap demands it, within the 3-vendors-per-quarter cap. For Firecrawl specifically, see the licensing note below.
- Canon RAG: KnowledgeStore/Embedder/Reranker ports plus Neon pgvector and pg_search hybrid (RRF) plus a Contextual Retrieval ingest job, only when the corpus (transcripts plus per-deal findings plus playbooks) outgrows the cached canon; Voyage / Cohere behind the port; Turbopuffer as the escape hatch.
- Analytics OLAP: the whole data-platform layer (dbt on DuckDB-in-CI first, then ClickHouse plus ClickPipes/PeerDB CDC plus self-hosted Metabase) only when "we have N weeks of real send+reply data worth a cohort question," and noting the Fly/Railway host prerequisite for Metabase.
- Compliance at live-PSTN (gated on TDRA): Presidio inside NOVA's external repo, immudb (after the append-only Postgres AuditLog), Skyflow UAE/Bahrain vault, OneTrust or paid DNCR scrubbing when volume justifies.
- NOVA go-live (EXTERNAL, in NOVA's repo, gated on TDRA): LiveKit Cloud SIP plus Telnyx/Twilio; `inference.TurnDetector` plus Deepgram Flux; Cartesia (en) / ElevenLabs Flash (ar); Coval simulation as the CI merge gate. Tracked in PRODUCTION-CHECKLIST as a prerequisite, not as this repo's build.
- Auth: Better Auth on a second-seat / session-revocation / passkey trigger; WorkOS AuthKit SSO/SCIM when a UAE developer or portal customer demands SAML.
- A Fly (or Railway) migration of the origin, IF intended: an explicit gated line item that must land before any Fly-hosted sidecar (Langfuse, Metabase, immudb) or any Cloudflare-in-front design.
- Temporal in NOVA-Python only if its 4-phase voice loop needs crash-safe cross-phase durability; never replacing Inngest in the TS pipeline.

---

## Top bets (in priority order, re-grounded)

1. The durable send-gate: `step.waitForEvent` makes the most dangerous action the most provably controlled, approve in the Close Room, the suspended run resumes live at zero idle cost, and DRY_RUN is re-checked on resume (backed by a regression test). Pure TS, one file, immediate visible result on the existing system. This is now bet #1 because it is the highest-value, lowest-risk, in-repo change at a zero-send stage.
2. The DLD / Dubai Pulse FREE transaction signal: a region-native `transaction_spike` built from the free Dubai Pulse open transaction datasets (`dld_transactions-open` / `-open-api`), grounding the deterministic fit score on real transaction volume that no global vendor packages. Genuine differentiator, but gated on a 1-day availability/licensing spike, and NOT a trivial wrapper (OAuth token-refresh plus CSV rebuild). The `off_plan_launch` part is either a free proxy from the same open data or blocked on Oqood business onboarding; it is not free-by-default.
3. The quality flywheel, starting with promptfoo: a promptfoo CI gate over the existing `cases.ts` turns subjective AI quality into a red/green number now. Ax/GEPA and a Langfuse judge follow later; GEPA-optimized NOVA phases live in NOVA's external repo.
4. The observability spine: one OTel GenAI span at `LlmClient.complete()` to Sentry now (Langfuse later, when a host and live traffic exist), making cost-per-lead and regressions visible without ever feeding back into the score.
5. Compliance as a provable artifact, the cheap in-repo half first: the Zod residual-PII assertion at `nova/findings.ts`, a phone-plus-channel Suppression schema, and a genuinely append-only Postgres AuditLog, all today. immudb, Presidio (in NOVA), Skyflow, and fail-closed external stubs follow on the TDRA-gated NOVA-go-live track.
6. NOVA goes live, compliance-first: the verify-by-conversation moat, but it is an EXTERNAL prerequisite in NOVA's own repo (LiveKit Cloud SIP, Deepgram Flux, Cartesia/ElevenLabs, Coval, behind Presidio plus fail-closed DNCR/consent), tracked in PRODUCTION-CHECKLIST and gated on TDRA approval. Demoted from #1 because no NOVA voice-stack work is actionable from this repository.

(The agent layer is deliberately NOT a top bet: it is deferred until a concrete task the current code cannot express is named.)

---

## What we deliberately do NOT adopt (and why)

- An agent framework (Inngest AgentKit or Mastra) NOW. The existing code-routed, durable pipeline already does exactly what the invariants permit (code routes, LLM only drafts/classifies); an agent layer at a one-customer, zero-send stage is a solution looking for a problem. Adopt only when a concrete agentic task the current `step.run`/`step.ai.infer` composition cannot express is named.
- `step.ai.infer` for personalisation or ANY traced/costed Claude call. It routes through Inngest's own AI gateway, bypassing `LlmClient.complete()`, so it would not emit the OTel span or produce the CostRecord, splitting the one chokepoint. Reserved only for calls deliberately excluded from the OTel/cost chokepoint (currently none).
- Firecrawl `/extract`. It is DEPRECATED; its replacement, the `/agent` endpoint, plus Fire-engine, is MANAGED-ONLY and excluded from the self-hosted (AGPL-3.0) build. So you cannot both have Firecrawl's LLM-extraction AND self-host in-region for PDPL: the two are mutually exclusive. When Firecrawl is eventually needed: for personal data in-region, self-host Firecrawl (AGPL-3.0, a copyleft license that MUST be disclosed in a buyer data room) and do structured extraction yourself by piping the self-hosted markdown/HTML through the existing `LlmClient` (keeping it inside the one Anthropic chokepoint and on-region); reserve managed Firecrawl `/agent` only for non-personal-data public pages.
- LangGraph.js as the orchestration brain. Duplicates the Inngest durability we already own, the TS port trails Python, and LangGraph Platform is by-design incompatible with Vercel and Cloudflare. A second parallel durability model for no invariant benefit.
- Temporal, Trigger.dev, Restate, DBOS, or Hatchet for the TS pipeline now. All replace Inngest and add a worker fleet, a determinism tax, or a migration, with no capability the pipeline lacks today. Revisit only on per-execution billing pain, the sleep cap, or a cross-language (TS plus NOVA) workflow need. Temporal in NOVA-Python only if the voice loop ever needs crash-safe cross-phase durability.
- OpenAI Agents SDK, and Vapi / Retell / Bland for voice. Wrong model ecosystem (OpenAI-tilted vs all-Anthropic plus LiveKit and DSPy), and the all-in platforms own the orchestration, prompt, and data plane, colliding with LLM-never-scores, the human send-gate, and no-vendor-leakage.
- Building RAG for the current canon. `canon.ts` is roughly 9 to 10K tokens and ships whole in a prompt-cached block with zero retrieval-failure risk and trivial citation. Gate strictly on corpus size.
- Standing up ClickHouse, a separate vector DB (Pinecone, Weaviate, Qdrant, Turbopuffer), Estuary, OR the dbt/DuckDB/Metabase analytics layer now. The system has zero sends, zero replies, and zero CallFindings, so there is nothing to model; the data-contract idea is better expressed as plain Prisma/SQL CI tests until a real cohort question exists.
- Tool sprawl across evals, frontend, and enrichment. ONE tool per job until it visibly hurts: promptfoo only (not Ax + GEPA + DeepEval + autoevals + a Langfuse judge); shadcn + AI SDK streaming + TanStack Table only (not also Tremor + Motion + TanStack Virtual until charts have data and lists are slow); DLD only as the net-new data rail (not also PDL + Ocean + Serper + Stagehand + Firecrawl + Linkup until a named live coverage gap appears). Cap: at most 3 net-new vendors per quarter.
- Migrating Prisma to Drizzle. Prisma 7 closed most of the gap; rewriting a working schema, adapter layer, and deterministic engine buys roughly 40ms cold start and a smaller bundle we do not need. High-risk, low-reward churn.
- Helicone as a strategic observability dependency (maintenance mode post-acquisition; acceptable only as a reversible base-URL stopgap), Clerk for auth (server would not own session decryption), the Vercel AI Gateway and assistant-ui Cloud (needless hosting/billing dependencies), and Braintrust or LangSmith hosted tiers (proprietary lock-in that ships prompts and outputs off-region, a PDPL risk; prefer self-hosted Langfuse, or confine Braintrust to optional MIT autoevals).
- Pulling any Python framework (DSPy, DeepEval, Ragas) into the TS monorepo, routing the production pipeline or send-path behind MCP, or wrapping governed rails (HubSpot, Smartlead, Unipile) through Composio. DSPy stays in NOVA's external repo, evals stay TS-native (promptfoo) or NOVA-side, MCP stays read-only and build-time only per ADR-0002, and governed rails keep their own dedicated adapters and contracts.
- BullMQ, Kafka, or Redpanda. A queue or stream is the wrong shape for modest-volume workflow orchestration and adds infra Inngest already covers. Revisit only at a real high-volume signal-firehose use case.

---

## Sources note

This plan adopts only real tools, verified against current docs and the actual repository.

Repository facts verified: `apps/web` is the Vercel-deployed unit (`apps/web/vercel.json`, `scripts/sync-keys-to-vercel.sh`, PRODUCTION-CHECKLIST Stage 2 LIVE 2026-06-16); the root `fly.toml` (app `huscribe-revenue-os`, fra) is stale and not the deployed origin; NOVA is external at `api.novalabs.ae` (`scripts/nova-call.ts`) with only `packages/integrations/src/nova/findings.ts` (68 lines) and its test in-repo, and no Python source, `requirements.txt`, or `pyproject.toml` present; the system is paused at Human Gate 2 with 0 of 17 provider keys and nothing ever sent (`docs/HANDOFF.md`); none of `@ai-sdk/anthropic`, `ai`, `promptfoo`, `@ax-llm/ax`, `@inngest/agent-kit`, `@modelcontextprotocol/sdk`, `langfuse`, `pgvector`, `dbt`, `tremor`, `@tanstack/react-table`, or `shadcn` is in `pnpm-lock.yaml`, while `inngest`, `@sentry/*`, and `@opentelemetry/*` are present. The five contracts in `packages/integrations/src/contracts/interfaces.ts`; the pure `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` and its use in `sequencing/send-step.ts`; `scoring-bridge.ts`; `waterfall.ts`; `sequencing/inngest.ts`; the raw-REST `LlmClient` with its `CostRecord` in `packages/integrations/src/llm/client.ts`; the `ask()` chokepoint and `MODEL_IDS` in `apps/web/lib/llm.ts`; the `signalTypeValues` enum and `DEFAULT_SIGNAL_TTL_DAYS` in `packages/core`; and ADR-0002 (Inngest orchestration, MCP-vs-REST rule) are all as cited.

External tool facts verified at this date (re-verify at adoption time):
- DLD / Dubai Pulse: registered-transaction data is FREE open data on Dubai Pulse (`dld_transactions-open` and `dld_transactions-open-api`), available as bulk CSV and an OAuth-protected REST API; the OAuth token (from `api.dubaipulse.gov.ae/oauth/client_credential/accesstoken`) expires (for example ~30 min) and must be refreshed, with a max-results limit and filter syntax. The Oqood / TAS off-plan-registration API Gateway requires a registered, active DLD business with an Oqood developer account and a formal onboarding process, not an instant key.
- Firecrawl: `/extract` is deprecated in favour of `/agent`; `/agent` and Fire-engine are managed-only and excluded from the self-hosted build, which is AGPL-3.0.
- Inngest `step.ai.infer`: a real feature that offloads inference through Inngest's own AI gateway (Inngest proxies to the provider and does not run your code during the call), so it bypasses `LlmClient.complete()`.
- Langfuse: "MIT licensed, except for the `ee/` folders"; core OTel ingestion and tracing are MIT and self-hostable, but some managed-evaluation / LLM-as-judge surfaces and RBAC/SSO are EE-licensed, and the precise per-feature matrix should be confirmed at adoption; describe as "(MIT core; some managed evaluators / RBAC / SSO are EE-licensed)."

Where a tool's regional, residency, or PDPL and TDRA posture matters, that is called out in the relevant part. Pricing, maturity, and acquisition notes (for example promptfoo acquired by OpenAI in March 2026, still MIT; Helicone in maintenance mode post-acquisition) are carried through from the research and should be re-verified at adoption time.
