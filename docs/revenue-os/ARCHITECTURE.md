# Huscribe Revenue OS: Architecture

One control plane for the entire revenue motion behind [Huscribe.com](https://huscribe.com): a voice-AI inbound lead-qualification product for UAE/MENA real estate. Operator/owner: gp@humai.ae (HumAI, Dubai). Live in production at https://huscribe-revenue-os.fly.dev (Fly.io app `huscribe-revenue-os`, region `fra`).

This document is the end-to-end system reference: the component map, the data flow (discover -> enrich -> NOVA voice -> master DB -> deterministic score -> human-gated close), the send/dial gate, and the exact boundary between where the LLM is and is not used.

## Design thesis

The horizontal tool layer is cheap and commoditizing: Clay sits at roughly $185-$495/mo, Apollo at ~$49-$119/user/mo ([clay.com/pricing](https://www.clay.com/pricing); [apollo.io/pricing](https://www.apollo.io/pricing)), and voice platforms (Bland, Synthflow) sell raw minutes at ~$0.11-$0.23/min plus a platform fee ([retellai.com](https://www.retellai.com/blog/bland-vs-synthflow)). Meanwhile "claygency" managed-outbound retainers run $3k-$15k/mo of human labour ([gtm-engineering.io](https://blog.gtm-engineering.io/blog/best-clay-automation-agencies)). Revenue OS buys the commodity (data, sending, voice minutes) behind anti-corruption adapters and builds the differentiator: a deterministic, explainable orchestration brain with a hard human gate. The tool fees become COGS; the value lives in the governed end-to-end outcome no single tool delivers.

The AI-SDR category's trust collapsed publicly in 2025 (11x reported 70-80% churn, inflated ARR, hallucinated output; [techcrunch.com](https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/)), and buyers now rank explainability/auditability as the top accountability requirement ([allaboutai.com](https://www.allaboutai.com/resources/llm-hallucination/)). The hard invariants below are the direct answer to that gap.

## Hard invariants (enforced in code, not by convention)

1. The LLM **never** computes a score. Code does, deterministically and explainably (`packages/core`).
2. Scoring is pure: the only injected non-pure input is `now` (used for signal decay). No clock reads, no I/O.
3. Missing data = **unknown**, never guessed. Unknown fit components score 0 and are flagged `known: false`.
4. Nothing sends or dials on any channel without explicit human approval **and** a passing dry-run.
5. `DRY_RUN` defaults `true` everywhere and is validated from env ([packages/config/src/schema.ts](../../packages/config/src/schema.ts), line 43).
6. Secrets only via env (Fly secrets in production); never in the image or repo.

## Component map

Monorepo (pnpm + Turbo). Internal packages are consumed as TS source.

| Component | Path | Responsibility |
|---|---|---|
| Control plane (web) | `apps/web` | Next.js 15 operator UI: leads, signals, ICP, approvals, voice, close room, analytics. Auth.js v5 credentials (single operator). |
| Domain + scoring | `packages/core` | Domain types, Zod schemas, and the pure deterministic scoring engine. **Scores computed here, never by the LLM.** |
| Data model | `packages/db` | Prisma/Postgres (Neon). The unified master DB and migrations/seed. |
| Vendor adapters | `packages/integrations` | Anti-corruption adapters behind five stable contracts. Vendor shapes never leak into core. Hosts the LLM client. |
| Orchestration | `packages/orchestration` | The brain: enrichment waterfall, signal collection, scoring bridge, sequencing, and the **send gate**. |
| Config | `packages/config` | Fail-fast env validation; `DRY_RUN` default true. |

Stable adapter contracts ([packages/integrations/src/contracts/interfaces.ts](../../packages/integrations/src/contracts/interfaces.ts)): `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore`. The waterfall and fallback logic live in **our** orchestration, not in any vendor; swapping a provider touches only its adapter.

## Master data model

`packages/db/prisma/schema.prisma` is the single source of truth. Core entities: `Company`, `Contact`, `Signal`, `Score`, `Message` (every channel action, including those `awaiting_approval`), plus the voice layer `CallSession` and `CallFinding` (with `callSessions` back-relations on both `Company` and `Contact`). Supporting: `IcpProfile` (versioned, JSON config), `Sequence`/`Enrolment`, `Suppression`, `AuditLog` (append-only), `ProviderCost`. `sources` records per-field provider attribution; dedupe is on `domain`/`placeId` for companies, `email`/`linkedinUrl` for contacts.

## End-to-end data flow

```
                       ┌──────────────────────── Huscribe Revenue OS (apps/web control plane) ───────────────────────┐
                       │  leads · signals · icp · APPROVALS · voice · close · analytics   (Auth.js single operator)  │
                       └───────────────────────────────────────────────────────────────────────────────────────────┘
                                            ▲ read/write                              ▲ approve / reject / close
                                            │                                          │
  (1) DISCOVER            (2) ENRICH                 (3) NOVA VOICE              (4) MASTER DB        (5) SCORE         (6) CLOSE
  ───────────            ──────────                  ─────────────              ───────────          ───────          ───────
  EnrichmentProvider     enrichCompanyWaterfall()    scripts/nova-call.ts       Postgres (Neon)      scoreLead()      human-gated
  .discoverCompanies     priority cascade, fills     POST /calls -> NOVA        Company · Contact    @oie/core        Close Room +
  (SearchApi/Places/     only-missing fields,        (api.novalabs.ae)          Signal · Score       PURE, det.,      send gate
   Apollo/Clay/          stops "complete enough",    4-phase LiveKit agent      Message              explainable
   Explorium)            per-field `sources`         Greeting→Discovery→        CallSession +        rationale +
        │                attribution                 Pitch→Close, DSPy          CallFinding          tier
        │                     │                      pre-call context                ▲                   │
        ▼                     ▼                      compliance gate:                │ verify-by-         ▼
   NormalisedCompany ──> waterfall merge ──────────> consent/DNCR/window       ─────┘ conversation   Score row
                              │                      DEMO_MODE on (no PSTN)       writes back:        (fit/intent/
                       SignalProvider                poll GET /calls/{id}        mobile→Contact;      composite/tier
                       collectSignals()              ingestCallResult()          tools→techStack +    + rationale JSON)
                       (TheirStack/Predict           persists CallSession        tech_adoption Signal      │
                        Leads/Exa) → Signal          + CallFinding                                         ▼
                                                                                              ┌─────────────────────────┐
                                                                                              │  THE SEND/DIAL GATE      │
                                                                                              │  evaluateSendGate()      │
                                                                                              │  DRY_RUN off (system)    │
                                                                                              │   AND approval=approved  │
                                                                                              │   AND channel enabled    │
                                                                                              │  -> only then real send  │
                                                                                              └─────────────────────────┘
                                                                                                          │ allowSend
                                                                                                          ▼
                                                                                   EmailSender / MessagingChannel / NOVA PSTN
```

### (1) Discover
`EnrichmentProvider.discoverCompanies` against live providers (SearchApi, Places, Apollo, Clay, Explorium) returns `NormalisedCompany[]`. The phone-first local motion (`scripts/discover-live.ts`) discovers, enriches, scores, and lands `awaiting_approval` messages without sending.

### (2) Enrich
`enrichCompanyWaterfall` ([packages/orchestration/src/waterfall.ts](../../packages/orchestration/src/waterfall.ts)) calls providers in priority order, each filling **only** fields still missing, stopping once "complete enough" (we own the cost ceiling), and falling through on provider error rather than aborting. Per-field provider attribution is recorded in `company.sources`. Buying signals are gathered via `SignalProvider` (TheirStack, PredictLeads, Exa) into `Signal` rows carrying raw `strength` (pre-decay).

### (3) NOVA voice
NOVA is the operator's own production voice agent (`api.novalabs.ae`): a FastAPI + LiveKit 4-phase agent (Greeting -> Discovery -> Pitch -> Close) with DSPy pre-call context and a built-in compliance gate (consent / DNCR / calling-window). Speed-to-lead is the lever NOVA exists for: human agents average ~917 minutes to first response and ~62% of inquiries arrive after hours ([agentzap.ai](https://agentzap.ai/blog/real-estate-lead-statistics)), while responding within 5 minutes is 21x more likely to qualify the lead ([verse.ai](https://verse.ai/blog/speed-to-lead-statistics)).

Integration: [scripts/nova-call.ts](../../scripts/nova-call.ts) pulls queued leads, `POST /calls` with `owner_email + product + leads + context + goal:"qualify_interest" + consent:true`, then polls `GET /calls/{id}` and ingests the result. **DEMO_MODE stays on** (the agent joins a LiveKit room; no real PSTN dial) until the owner signs off. Going live is gated on TDRA telemarketing approval, a licence-registered UAE caller-ID, and DNCR access ([trenchlaw.com](https://www.trenchlaw.com/new-telemarketing-rules-in-uae-timings-fines-exemptions-explained/)), not a code change.

### (4) Master DB and the verify-by-conversation moat
Conversation is the highest-value enrichment source: B2B contact data decays ~22.5%/year ([spotlight.ai](https://www.spotlight.ai/post/ai-crm-data-enrichment)). On every consented call, `ingestCallResult` persists `CallSession` (status, transcript, outcome, summary, cost, full `raw` payload for provenance) and `CallFinding` rows (canonical keys: `identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`). Only **consented, honest** facts compound: a verified mobile normalises to E.164 onto `Contact.phone`/`whatsapp`; spoken tools merge into `Company.techStack` and create a `tech_adoption` `Signal`. Missing fields yield no finding. The calls that build the database are the product.

### (5) Score
`scoreLead(subject, icp, now)` ([packages/core/src/scoring-engine.ts](../../packages/core/src/scoring-engine.ts)) computes weighted **fit** (industry, employees, revenue, geography, local category, technographics, people, keywords), **intent** (signal criteria with time decay; `now` is the only time input), a blended **composite**, and a **tier** (A-D). It returns a full `rationale` (per-component score/weight/known/detail, plus fit coverage and intent criteria). Only configured dimensions (weight > 0) participate; unknown data scores 0 and is flagged. The `scoring-bridge` maps normalised adapter output into the engine's narrow `ScoringSubject` so `@oie/core` never depends on the integration layer. This is exactly the deterministic, server-enforced pattern buyers now demand over free-running LLM output ([dev.to](https://dev.to/nodefiend/trust-the-server-not-the-llm-a-deterministic-approach-to-llm-accuracy-20ag)).

### (6) Human-gated close
The control plane's Approvals and Close Room are where a human reviews and acts. The Close Room ([apps/web/app/close/actions.ts](../../apps/web/app/close/actions.ts)) generates prep battlecards, outreach copy, post-call coaching, and an ROI narrative, but the ROI **math is deterministic** (`computeRoiMath`, pure arithmetic the buyer can reproduce); the LLM only frames it and is instructed to emit `<CONFIRM>` rather than invent any number.

## The send/dial gate

The single chokepoint for every live action ([packages/orchestration/src/send-gate.ts](../../packages/orchestration/src/send-gate.ts)). `evaluateSendGate` is pure and total, every branch returns a decision; there is no implicit "allow". A real send (`allowSend: true`) requires **all** of:

1. `DRY_RUN` is off (system-level), **and**
2. the specific action is `approved` by a human (per-action), **and**
3. for LinkedIn/WhatsApp, the channel is explicitly enabled (off by default).

These conditions are deliberately independent: flipping `DRY_RUN` alone can never cause a send, and an approval can never override `DRY_RUN`. Outcomes are explicit: `send`, `simulate` (DRY_RUN preview), `blocked_awaiting_approval`, `blocked_rejected`, `blocked_channel_disabled`. NOVA's DEMO_MODE is the same posture for the voice rail. Every send, enrolment, score change, and data pull is written to the append-only `AuditLog`.

## Where the LLM is: and is NOT

The LLM (Claude, behind the `LlmClient` adapter; Sonnet for personalisation, Opus for deep judgement) is confined to language tasks under structured-output + Zod validation, and a swappable eval harness ([packages/integrations/src/llm/evals](../../packages/integrations/src/llm/evals)):

- **Personalisation**, opener grounded in the exact detected signal, or a cold opener grounded only in verified vertical/locale/size; never a fabricated signal ([personalise.ts](../../packages/integrations/src/llm/personalise.ts)).
- **Extraction**, structured company facts from free text, every ungrounded field emitted as `null` with provenance ([extract.ts](../../packages/integrations/src/llm/extract.ts)).
- **Close Room copy**, prep, outreach, coaching, ROI narrative, grounded in the sales canon with `<CONFIRM>` for unknowns.

The LLM is **NOT** used to: compute or adjust any score; decide a tier; fill missing data; run the enrichment waterfall cascade; gate a send or dial; or do the ROI arithmetic. Every personalisation prompt carries the literal instruction "Never emit a score or a number as the output. Never fabricate a data point." Verifiability and the human gate, not autonomy, are the trust differentiator.
