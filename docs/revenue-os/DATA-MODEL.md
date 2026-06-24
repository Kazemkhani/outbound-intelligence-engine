# Revenue OS Data Model

The unified data model is the single source of truth across every provider, channel, and the voice
agent. Vendor payloads are normalised into these entities by anti-corruption adapters; the LLM and
NOVA write only honest, consented facts; and code (never the model) computes every score. This
document is the operator-grade reference for the entities, their relations, enrichment rules, and
provenance.

Source of truth: `packages/db/prisma/schema.prisma`. Normalised DTOs:
`packages/integrations/src/contracts/model.ts`. Scoring: `packages/core/src/scoring-engine.ts`.
Voice ingest: `scripts/nova-call.ts`.

## Entity map

```
IcpProfile 1───* Score *───1 Contact *───1? Company
                              │              │
Company 1───* Contact         │ 1            │ 1
Company 1───* Signal *───? Contact            │
Company 1───* CallSession *───? Contact ──────┘
CallSession 1───* CallFinding
Contact 1───* Enrolment *───1 Sequence;  Enrolment 1───* Message
```

The seven entities in scope: **Company**, **Contact**, **Signal**, **Score**, **Message**,
**CallSession**, **CallFinding**.

## Company

The account record. Dedupe key is `domain` (unique), with `placeId` (unique) as the fallback for
map/local-discovery sources that have no website (`companyDedupeKey` in `packages/core/src/dedupe.ts`).

Firmographic fields feed the deterministic fit score: `industry`, `employeeCount`, `revenueBand`,
`country` / `region`, `lat` / `lng` (radius scoring), `localCategory`, and `techStack` (string array).
`funding`, `socials`, `sources`, and `raw` are JSON. Relations: `contacts`, `signals`, `callSessions`.
Every firmographic field is nullable on purpose: missing data stays unknown and never gets guessed
(see Scoring). Indexed on `(country, region)` and `industry`.

## Contact

The person record and the unit that gets scored, enrolled, and called. Dedupe key is `email`
(unique), falling back to `linkedinUrl` (unique) (`contactDedupeKey`). Persona fields:
`fullName`, `title`, `seniority` (enum `c_level | vp | director | manager | ic`), `department`.
Channel handles: `email` + `emailStatus` (`verified | risky | invalid | unknown`, default `unknown`),
`linkedinUrl`, `phone`, `whatsapp`. `companyId` is nullable with `onDelete: SetNull` so a contact
survives company churn. Relations: `company`, `signals`, `scores`, `enrolments`, `callSessions`.

## Signal

A time-bounded intent event (hiring, funding, tech adoption, job change, news, web change). Carries
`strength` (0..1, raw provider strength, pre-decay), `provider`, `sourceUrl`, `evidence` (JSON),
`detectedAt`, and an optional `expiresAt`. A signal attaches to a Company and/or a Contact (both
`onDelete: Cascade`). Signals dedupe on subject + type + source-URL (or detection day when no URL),
so re-pulls and cross-provider overlap never double-count intent (`signalDedupeKey`).

Decay is the only place freshness matters at score time. `signalDecayFactor` (in
`packages/core/src/scoring.ts`) is linear from 1 at `detectedAt` to 0 at `expiresAt`; a signal with
no expiry does not decay. This is the mechanism that operationalises CRM data decay
(B2B contact data decays ~22.5%/year, ~2.1%/month; MarketingSherpa via enrichment roundups,
https://www.spotlight.ai/post/ai-crm-data-enrichment): give intent signals an `expiresAt` and stale
intent fades from the score automatically. Indexed on `(companyId, type)` and `(type, detectedAt)`.

## Score

The deterministic verdict for one Contact under one ICP, unique on `(contactId, icpProfileId)`.
Fields: `fit`, `intent`, `composite` (all 0..100), `tier` (`A | B | C | D`), `rationale` (JSON),
`modelVersion`, `computedAt`. Relations: `contact` and `icpProfile` (both `onDelete: Cascade`),
where `IcpProfile` stores the versioned, validated ICP config as JSON.

The hard invariant: the LLM **never** computes a score; `scoreLead` does, deterministically and
purely, with `now` injected as the only time input (`packages/core/src/scoring-engine.ts`). Fit is a
weighted average of only the configured (weight > 0) firmographic, technographic, persona, and
keyword components; unknown inputs score 0 and are reported as `known: false` plus a `coverage`
ratio, so a low score caused by missing data is visible rather than disguised. Intent combines
decayed signal strengths with diminishing returns. The full `rationale` (per-component score,
weight, known flag, and human-readable detail) is persisted on every Score, which directly answers
the market's top stated accountability gap: 72.3% of AI professionals rank explainability and
auditability the most critical factor (https://www.allaboutai.com/resources/llm-hallucination/).
`modelVersion` (`SCORING_MODEL_VERSION`, currently `scoring-v1`) stamps every row so a scoring change
is auditable and re-scorable. Indexed on `(tier, composite)`.

## Message

Every channel action (email, LinkedIn, WhatsApp), including ones awaiting approval. Fields:
`channel`, `direction` (`outbound | inbound`, default `outbound`), `status`
(`queued | awaiting_approval | sent | delivered | opened | replied | bounced | failed`), `body`,
`templateId`, `externalId` (the provider id and idempotency anchor; unique per `(channel, externalId)`).
Linked to an `Enrolment` (`onDelete: SetNull`). The `awaiting_approval` status is the enforced human
gate: nothing moves to `sent` on any channel without explicit approval and a passing dry-run, and
DRY_RUN stays true by default. This is the trust wedge against the autonomous-AI-SDR model whose
reliability collapsed publicly in 2025 (11x reported at 70-80% churn, named non-customers,
"hallucinat[ed]" output; TechCrunch, https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/).

## CallSession

One row per NOVA voice call, dogfooding Huscribe's own production agent. `novaCallId` is unique and
the idempotency anchor; `novaContextId` maps to the LiveKit room (`call-<context_id>`). Operational
fields: `status` (`pending | in_progress | completed | failed | no_answer`), `goal`
(default `qualify_interest`), `language`, `transcript`, `outcome`, `summary`, `costUsd`, `placedAt`,
`completedAt`. Compliance fields: `demoMode` (default `true`; mirrors NOVA's no-PSTN demo flag and is
true unless a `NOVA_API_KEY` is set), `consent` (default `true`), `consentBasis`
(e.g. `operator_initiated_demo`), `optOut`. `raw` stores the full `get_call` payload for provenance.
Contact and Company are nullable with `onDelete: SetNull` (ad-hoc calls are allowed). Relations:
`contact`, `company`, `findings`. Indexed on `status` and `companyId`.

Compliance is a first-class, persisted property of the call, not invisible plumbing: NOVA's built-in
gate (consent, DNCR, 09:00-18:00 calling window under UAE Cabinet Resolution 56/2024 and PDPL
Federal Decree-Law 45/2021; https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity)
means every session carries an auditable `consentBasis` and `demoMode` record. DEMO_MODE stays on
until owner sign-off.

## CallFinding

A structured fact captured on a call. Fields: `key`, `value`, `confidence` (nullable 0..1),
`source` (default `nova`), `capturedAt`; `onDelete: Cascade` from CallSession. Canonical keys:
`identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`,
`opt_in`. Only recognised canonical keys are kept and only honest, consented facts are written; a
missing field yields no finding (`extractFindings` in `scripts/nova-call.ts`). Findings are rewritten
idempotently per session (deleted then re-created on each ingest). Indexed on `callSessionId` and `key`.

## Enrichment rules and provenance

**Provenance.** `Company.sources` and `Contact.sources` are a JSON `FieldSource` map (field name ->
provider name), set by the adapter that supplied each field, so we always know who said what. Vendor
shapes never reach the database: adapters translate into `NormalisedCompany` / `NormalisedContact` /
`NormalisedSignal` first (`packages/integrations/src/contracts/model.ts`). Per-provider cost is
recorded separately on `ProviderCost`, and every send, enrolment, score change, and data pull lands
on the append-only `AuditLog`.

**Conflict resolution.** Identity is decided by our normalised dedupe keys, never by a vendor row id.
Companies merge on `domain` (then `placeId`); contacts on `email` (then `linkedinUrl`); signals on
subject + type + anchor.

## The master-DB enrichment flywheel

The moat is verify-by-conversation: the voice agent confirms identity and enriches the master DB on
every consented call, replacing decaying third-party records with conversation-verified facts. The
loop in `ingestCallResult` (`scripts/nova-call.ts`):

1. **Place + persist.** A queued lead is dialled; the call is written immediately as a
   `CallSession` (status `pending`) so the control plane shows it live.
2. **Ingest the outcome.** Status, transcript, outcome, summary, cost, and the full `raw` payload are
   stored; canonical `CallFinding` rows are extracted.
3. **Compound only consented facts** (guarded by `session.consent`):
   - `mobile` -> normalised to E.164 (`toE164`) -> `Contact.phone` and `Contact.whatsapp`. This is
     the high-value enrichment: most queued numbers are toll-free or landline switchboards NOVA cannot
     dial, so the verify-call is precisely how a dialable, verified mobile enters the DB.
   - `tools` -> tokenised and merged into `Company.techStack` (deduped) **and** written as a
     `tech_adoption` Signal (provider `nova`, evidence linking the `novaCallId`), so a fact spoken on
     a call flows straight into the next deterministic score.
   - `opt_in` -> a non-affirmative answer sets `CallSession.optOut`, the durable suppression signal.

The result is a compounding asset: calls that build the database are the product. `after_hours_handling
= waits till morning` is the clearest ICP tell (62% of real-estate inquiries arrive after hours;
https://agentzap.ai/blog/real-estate-lead-statistics), surfaced as a finding and feedable to intent
weighting so the DB auto-prioritises prospects visibly losing the after-hours window. Because intent
signals decay (`expiresAt`) and verified contact facts can be re-queried, the flywheel stays fresh
rather than aging into the ~2.1%/month decay curve that silently kills static CRMs.
