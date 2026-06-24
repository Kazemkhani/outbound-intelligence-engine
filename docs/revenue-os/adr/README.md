# Revenue OS: Architecture Decision Records

This directory records the locked product and architecture decisions for **Huscribe Revenue OS**: the single control plane that runs end-to-end sales for [Huscribe.com](https://huscribe.com) (voice-AI inbound lead qualification for UAE/MENA real estate). Operator and owner: gp@humai.ae (HumAI, Dubai). Live in production at `https://huscribe-revenue-os.fly.dev` (Fly.io app `huscribe-revenue-os`, region `fra`).

Each ADR captures one decision in a standard form so a future reader, or a fresh agent session, understands not just what was chosen but why, and what it costs.

These records extend the program-level ADRs in [`../../adr/README.md`](../../adr/README.md). They do not restate the platform decisions (TypeScript monorepo, anti-corruption adapters, deterministic scoring, send gate) so much as record the Revenue OS framing that sits on top of them. A decision is changed by writing a new ADR that supersedes the old one, never by editing history.

## Index

| ADR  | Title                                            | Status   |
| ---- | ------------------------------------------------ | -------- |
| R001 | NOVA as the voice layer                          | Accepted |
| R002 | One-app consolidation (OIE + APEX → Revenue OS)  | Accepted |
| R003 | Context, not contacts                            | Accepted |
| R004 | Deterministic scoring (the LLM never scores)     | Accepted |
| R005 | DRY_RUN plus a human send-gate                   | Accepted |

## Format

Each ADR follows: **Context** (the forces and constraints), **Decision** (what we chose, active voice), **Consequences** (what becomes easier, what becomes harder, the residual risk).

---

## R001: NOVA as the voice layer

**Status:** Accepted

### Context

Revenue OS needs a voice motion that answers and qualifies inbound real-estate enquiries, because speed-to-lead is the dominant conversion lever and humans structurally lose it: average agent first response runs to roughly 917 minutes, yet replying within 5 minutes makes qualification about 21x more likely than at 30 minutes, and around 78% of buyers transact with the first responder (per NAR data via industry roundups; AgentZap, Verse.ai). About 62% of enquiries arrive outside business hours (AgentZap).

The commodity voice vendors (Bland, Synthflow, Retell, Vapi) sell raw per-minute infrastructure (roughly $0.11–$0.23/min plus $299–$499/mo platform fees) and a build-it-yourself agent, with no enrichment, no deterministic scoring, and no UAE compliance gate (Retell AI, Zeeg). Building our own from those primitives would duplicate work the operator has already shipped.

The operator already runs a production voice agent, **NOVA** (`api.novalabs.ae`): FastAPI plus LiveKit, a 4-phase agent (Greeting → Discovery → Pitch → Close), DSPy pre-call context, and a built-in compliance gate (consent / DNCR / calling-window). LiveKit-class pipelines hit human-perceived latency (sub-300ms feels human; ~85% true-positive semantic turn detection per LiveKit), which is the technical prerequisite for a qualification call that does not feel robotic.

### Decision

Use **NOVA as the voice layer**, integrated as an external service behind an adapter rather than reimplemented. The repo calls NOVA over REST from `scripts/nova-call.ts`: `POST /calls` with `owner_email`, `product`, `leads`, `context`, `goal: "qualify_interest"`, and `consent: true`, then polls `GET /calls/{id}`. Outcomes persist as `CallSession` plus `CallFinding` rows and feed master-DB enrichment. NOVA runs in **DEMO_MODE** (the agent joins a LiveKit room, no real PSTN dial) and stays there without explicit owner sign-off.

### Consequences

- **Easier:** We inherit a working LiveKit stack, bilingual Arabic/English handling, the 4-phase script, and the compliance gate, instead of assembling voice plumbing. Revenue OS dogfoods Huscribe's own agent to sell Huscribe.
- **Easier:** Capturing per-turn latency and turn-detection metrics into `CallSession.raw` gives a defensible "feels human" QA bar before any PSTN flip.
- **Harder:** NOVA's response shape is not contracted, so `extractFindings` in `scripts/nova-call.ts` reads several plausible locations and keeps only canonical keys; a missing field yields no finding (never a guess).
- **Residual risk:** Going live on real PSTN is blocked on operator prerequisites (TDRA telemarketing approval, a licence-registered UAE caller ID), not just a code flag. DEMO_MODE stays the default until the owner signs off.

---

## R002: One-app consolidation (OIE + APEX → Revenue OS)

**Status:** Accepted

### Context

Two repos describe one motion: OIE (outbound discovery, waterfall enrichment, deterministic scoring, approval-gated sequencing) and APEX (the voice and conversation layer). Running them as separate systems would split the master database, duplicate auth and config, and force the operator to reconcile two control surfaces for one funnel.

The market validates a single control plane over a stack of tools. Clay agencies ("claygencies") charge roughly $3k–$15k/month to assemble in human labour what this software already does (Growth Engine X cited at $6k–$8k/mo; ColdIQ positioned around $5k–$12k/mo on 3–6 month minimums; GTM-Engineering, Outreach Ark). The horizontal tools underneath are cheap and commoditizing (Clay $185–$495/mo, Apollo ~$49–$119/user/mo; Clay, Apollo). The durable margin sits in orchestration and outcomes, not in any one tool.

### Decision

Consolidate OIE and APEX into **one app, Huscribe Revenue OS**: a single pnpm/Turbo monorepo with the Next.js 15 control plane in `apps/web`, one Prisma/Postgres (Neon) master database in `packages/db`, and shared domain logic in `packages/core` (types, Zod, scoring), `packages/integrations` (vendor adapters), `packages/orchestration` (waterfall plus send gate), and `packages/config` (fail-fast env validation). The voice motion (R001) writes into the same `Company` / `Contact` / `Signal` / `Score` / `Message` model alongside `CallSession` / `CallFinding`.

### Consequences

- **Easier:** One database, one auth (Auth.js v5 credentials), one config surface. Voice findings enrich the same records that enrichment, scoring, and sequencing already operate on.
- **Easier:** Pricing and positioning anchor to the claygency retainer band as the always-on GTM engineer, not to a single tool's seat price.
- **Harder:** One codebase must serve outbound and voice without coupling them; the package boundaries (core / integrations / orchestration) are the enforced seams.
- **Residual risk:** A single app is a single blast radius. Secrets live only in Fly secrets (never in the image or repo), the dev backdoor is disabled in production, and `AUTH_TRUST_HOST` / `AUTH_URL` are set to contain it.

---

## R003: Context, not contacts

**Status:** Accepted

### Context

B2B contact data decays roughly 22.5%/year (about 2.1%/month; MarketingSherpa via enrichment roundups). A pipeline built on bought contact lists is built on a depreciating asset, and the highest-value enrichment source, the conversation, is the one most tools never capture. Verified, fresh phone data lifts connect rates materially (Cognism reports +25% QoQ; ZoomInfo verified direct dials cited up to 7x). Dubai's addressable base is large and noisy (around 9,785 brokerage offices per Dubai Land Department), so the moat is not owning more contacts but owning better, fresher context about them.

### Decision

Treat the product as building **context, not contacts**. Every consented NOVA call confirms identity and writes verified facts back to the master DB: `verify-by-conversation`. In `ingestCallResult`, a spoken mobile normalises through `toE164` to `Contact.phone` / `Contact.whatsapp`, a stated tool stack merges into `Company.techStack` and creates a `tech_adoption` `Signal`, and structured answers persist as `CallFinding` rows under canonical keys (`identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`). The calls that build the database are the product.

### Consequences

- **Easier:** The DB self-heals: conversation-verified facts replace decaying third-party records the moment they are spoken, and a lead that says inbound "waits till morning" is a high-intent ICP signal the scorer can weight.
- **Easier:** Context compounds. Each call enriches the same record the next motion reads, making the flywheel measurable rather than aspirational.
- **Harder:** Only consented facts may compound; `ingestCallResult` returns early when `session.consent` is false, so enrichment never outlives the consent that justified it (`consentBasis` is recorded on the session).
- **Residual risk:** Context is only as good as its provenance. Every finding carries a `source` and `confidence`, and the full `get_call` payload persists in `CallSession.raw` for audit.

---

## R004: Deterministic scoring (the LLM never scores)

**Status:** Accepted

### Context

The "autonomous AI SDR" category lost buyer trust publicly in 2025: 11x (a16z/Benchmark-backed) was reported with 70–80% customer churn, inflated ARR ($14M claimed vs ~$3M real post-trial), named non-customers on its site, and a product customers said "hallucinat[ed]" (TechCrunch, Mar 24 2025; 11x disputes churn, citing 79% retention). Buyers now treat explainability and auditability as the top accountability requirement; the prevailing pattern is to constrain the LLM so it does not choose what to report (directional: 72.3% of AI professionals rank explainability/auditability most critical, 68% trust AI only with review checkpoints; AllAboutAI, dev.to). A score a broker cannot interrogate is a score a broker will not trust.

### Decision

The **LLM never computes a score. Code does, deterministically and explainably.** The scoring engine in `packages/core` (`scoring-engine.ts`) computes fit, intent, and a composite from configured ICP weights and returns a full `ScoreResult.rationale` with per-component breakdown, coverage, and per-signal results. Scoring is pure: the only injected non-pure input is `now` (for time decay). Missing data is unknown, not guessed, an unknown fit component scores 0 and is flagged `known: false` rather than imputed. Every `Score` records `SCORING_MODEL_VERSION` so a number is always reproducible against the code that produced it. The LLM is confined to personalization (signal → reviewed opener), never to the number.

### Consequences

- **Easier:** Every score is explainable with rationale and reproducible by version, which directly answers the market's stated number-one accountability gap and is a headline control-plane feature.
- **Easier:** Pure scoring is unit-testable (`scoring-engine.test.ts`, `scoring.test.ts`) and stable across runs; changing the computation means bumping `SCORING_MODEL_VERSION`, not silently drifting.
- **Harder:** All scoring weight and logic must live in code, so new signals require an explicit, reviewed change to `packages/core` rather than a prompt tweak.
- **Residual risk:** Deterministic scoring is only as good as the ICP weights; those are config and must be tuned with evidence, but the mechanism stays auditable regardless.

---

## R005: DRY_RUN plus a human send-gate

**Status:** Accepted

### Context

Nothing in this product may contact a real person without a human in the loop, both because buyer trust in autonomous send is gone (R004) and because UAE law makes an ungated dialer a liability. Marketing calls are restricted to 09:00–18:00 with DNCR screening and prior authority approval under Cabinet Resolution 56 of 2024 (in force 27 Aug 2024); PDPL (Federal Decree-Law 45/2021) requires clear, specific, withdrawable consent; DNCR breaches carry graduated fines of AED 50k / 75k / 150k (NR Doshi, Pinsent Masons, Trench & Associates). An accidental real send is not a bug, it is a regulated event.

### Decision

A real send or dial is permitted **only when DRY_RUN is off (system level) AND the specific action is human-approved**, evaluated by `evaluateSendGate` in `packages/orchestration/src/send-gate.ts`. The two conditions are deliberately separate: flipping DRY_RUN alone can never cause a send, and an approval can never override DRY_RUN. **DRY_RUN stays true** by default; the gate simulates (produces a preview, contacts no provider) while it is on, even for approved actions. On the voice side, NOVA's DEMO_MODE (R001) and its built-in consent / DNCR / calling-window gate are the equivalent rails. LinkedIn and WhatsApp are off by default behind the approval queue.

### Consequences

- **Easier:** The safe posture is the default posture, DRY_RUN on plus pending approval never sends, so a misconfiguration fails closed.
- **Easier:** "Every send reviewed, every call consented, calling window and DNCR enforced" becomes a marketed, demonstrable trust feature for UAE brokerages rather than invisible plumbing.
- **Harder:** No batch can be fully automated end-to-end; a human must approve real contact, and the calling-window / DNCR / frequency rules must be enforced as hard pre-dial assertions before PSTN.
- **Residual risk:** The gate guards software; going live still depends on operator prerequisites (TDRA approval, a licence-registered UAE caller ID) and on the content guard hook that refuses any text attempting to disable the safety flag.

---

## References

Claims above are grounded in the repository (`scripts/nova-call.ts`, `packages/core/src/scoring-engine.ts`, `packages/orchestration/src/send-gate.ts`, `packages/db/prisma/schema.prisma`) and in the cited 2025–2026 market and legal sources. External survey, market-size, and vendor figures are directional (secondary aggregators); UAE legal figures should be confirmed against the official `uaelegislation.gov.ae` text before any production dialing.
