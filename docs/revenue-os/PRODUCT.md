# Huscribe Revenue OS: Product

The control plane for end-to-end sales of Huscribe.com (voice-AI inbound lead qualification for UAE/MENA real estate). One operator (gp@humai.ae, HumAI, Dubai) runs the whole revenue motion from a single app: discover and rank accounts, enrich them, qualify them by NOVA voice call, score them deterministically, and close them, with a human approval gate on every send and dial.

Live: https://huscribe-revenue-os.fly.dev (Fly.io, region `fra`). The shell brands as "Control Plane by HumAI"; operator login is real (Auth.js v5 credentials, bcrypt), the dev backdoor is disabled in production, and secrets live only in Fly secrets.

**The wedge.** Claygencies and AI-SDR vendors sell the same outbound motion as $3k–$15k/month of human labour or per-AI-seat contracts behind opaque, annual, sales-led quotes (ColdIQ ~$5k–$12k/mo; 11x ~$1.5k/seat/mo; sources: gtm-engineering.io, vendr.com/marketplace/11x). Revenue OS does that motion in software. The trust differentiator is structural, not marketing: the LLM **never** computes a score (code does, deterministically and explainably), missing data stays unknown rather than guessed, and nothing sends or dials without explicit human approval plus a passing dry-run. That directly answers the market's #1 stated accountability gap, explainability and auditability (allaboutai.com), at a moment when "autonomous AI SDR" trust has collapsed publicly (11x reported 70–80% churn; techcrunch.com, Mar 2025).

The shared invariants below hold across every module. They are enforced in code (`packages/core`, `packages/orchestration`, `apps/web`), not by convention.

- The LLM never scores. Scoring is pure and deterministic in `packages/core`; the only injected impure input is `now` (for signal decay).
- Missing data = unknown, never guessed.
- DRY_RUN stays true. Nothing sends or dials on any channel without explicit human approval **and** a passing dry-run.
- Secrets only via env. NOVA stays in DEMO_MODE (no real PSTN) without owner sign-off.

---

## Modules

Navigation routes (`apps/web/components/nav-sidebar.tsx`): Home `/`, Leads `/leads`, ICP Editor `/icp`, Signals `/signals`, Approvals `/approvals`, Voice `/voice`, Close `/close`, Analytics `/analytics`. Planned: Dojo `/dojo`, Knowledge `/knowledge`.

### Leads: `/leads`
**What it does.** Shows every Contact scored and ranked by composite against the active ICP, with tier filters. A row expands to enrichment, the signal timeline, and the full score rationale (`scoreLead` returns `fit`, `intent`, `composite`, `tier`, and an explainable `rationale`, stamped `SCORING_MODEL_VERSION`). This is the pane where the operator decides who is worth a call or a sequence.
**Who uses it.** The operator, daily, as the primary work queue.
**Value.** A ranked, explainable buy-list across a fragmented base of ~9,785 Dubai brokerages plus developers and portals (dubailand.gov.ae). Because the rationale is visible, the operator can defend "why this lead is hot" without trusting a black box.

### ICP Editor: `/icp`
**What it does.** Tunes firmographic, technographic, people, and signal weights for the active `IcpProfile` (versioned, stored as validated JSON). Leads re-rank live as sliders move; no save needed to preview the effect.
**Who uses it.** The operator, when a new segment or off-plan launch pattern emerges (off-plan is now 60%+ of UAE sales; arthurmackenzy.com).
**Value.** Turns "who is a good lead" into a governed, versioned config instead of an SDR's gut feel. A high-signal UAE pattern, for example `after_hours_handling = waits till morning`, can be weighted up so prospects visibly losing the after-hours window auto-rise (~62% of inquiries arrive after hours; agentzap.ai).

### Signals: `/signals`
**What it does.** A reverse-chronological feed of every detected buying signal (`hiring`, `funding`, `tech_adoption`, `job_change`, `news`, `web_change`) with strength, provider attribution, evidence, source link, and decay/expiry. Expired signals are marked.
**Who uses it.** The operator, to find a timely, verifiable hook before reaching out.
**Value.** Signals feed the deterministic intent score with time decay, so freshness is priced in rather than asserted. NOVA writes back too: a consented call that surfaces a prospect's tool stack creates a `tech_adoption` Signal, making conversation a first-class signal source (`scripts/nova-call.ts`).

### Approvals: `/approvals`
**What it does.** The mandatory human gate. Every outbound Message sits in `awaiting_approval` and must be individually approved by the operator before it can progress. Nothing leaves the system from this interface, and DRY_RUN cannot be disabled here.
**Who uses it.** The operator, as the last checkpoint before any send.
**Value.** This is the trust core, in product form. Buyers now trust AI only with review checkpoints (68%; allaboutai.com). The gate is the explicit contrast to the autonomous-SDR model whose claims the market stopped believing.

### Voice: `/voice`
**What it does.** Every NOVA voice call, newest first, with status, consent, structured findings, transcript, and the facts written back to the master DB. NOVA (api.novalabs.ae) is the operator's own production agent: FastAPI + LiveKit, a 4-phase script (Greeting → Discovery → Pitch → Close), DSPy pre-call context, and a built-in compliance gate (consent / DNCR / calling-window). Integration: `scripts/nova-call.ts` posts to `/calls` (owner_email + product + leads + context + `goal:"qualify_interest"` + `consent:true`), polls `GET /calls/{id}`, and persists `CallSession` + `CallFinding`.
**Who uses it.** The operator, to review qualification calls and the enrichment they produced.
**Value.** This is the moat: **verify-by-conversation**. Where third-party contact data decays ~2.1%/month (spotlight.ai), every consented call confirms identity, writes a verified mobile (`toE164`) to the Contact, and merges the tool stack into the Company. The calls that build the database are the product. NOVA also captures the canonical UAE qualifier `after_hours_handling`, where "waits till morning" is both the disqualifier for them and the hottest signal for us. DEMO_MODE (no PSTN) stays on until owner sign-off, matching the safety posture before live UAE dialing (which additionally requires TDRA approval and a licence-registered number; trenchlaw.com).

### Analytics: `/analytics`
**What it does.** Pipeline health at a glance, derived from the live database and the active scoring run: total leads, signals this week, pending approvals, estimated provider cost, leads-by-tier, top leads, and a per-lead score distribution.
**Who uses it.** The operator, for a daily read and for pilot reporting.
**Value.** Makes the engine's output legible and the COGS visible, since the commodity tool fees (Clay $185–$495, Apollo $49–$119; clay.com, apollo.io) are the cost line while the orchestration is the value.

### Close Room: `/close`
**What it does.** The closing cockpit, grounded in the distilled APEX sales canon (`apps/web/lib/canon.ts`: SPIN, Challenger, Gap, MEDDICC, JOLT, Voss). Four tools per selected lead: **Prep** (battlecard with SPIN discovery set and objection map), **Outreach** (implication-first multi-channel pack including Gulf-Arabic WhatsApp and voice notes), **Coach** (paste a transcript, get a scorecard, the biggest leak, and the next action), and **ROI** (the buyer's numbers turned into a Gap Selling narrative).
**Who uses it.** The operator, in deal prep and post-call review.
**Value.** Same invariant as scoring: in ROI, **code does the arithmetic** (`computeRoiMath`) and the LLM only frames it; unknown Huscribe facts become a literal `<CONFIRM>` token rather than a fabricated stat. Every output is a draft for review, never auto-sent. The canon ships in the system prompt (no runtime RAG) so answers stay tied to a named framework.

### Dojo: `/dojo` (planned)
**What it will do.** Port the Voice Dojo: interactive sales roleplay with scoring, grounded in the same canon (`docs/autonomous/BACKLOG.md`, PORT1).
**Value.** Lets the operator drill objections and discovery against a scored bar before a real call, closing the loop with the Coach scorecard.

### Knowledge: `/knowledge` (planned)
**What it will do.** Port grounded Q&A over the APEX canon (BACKLOG PORT2), after which the separate APEX app retires.
**Value.** One source of methodology, in one app, with the same `<CONFIRM>` discipline so it never invents Huscribe specifics.

---

## How the modules compose

`/leads` and `/icp` decide **who**. `/signals` and `/voice` decide **when** and supply verified facts. `/close` and `/approvals` govern **how and whether** to reach out. `/analytics` measures it. The data spine is one unified model (`packages/db/prisma/schema.prisma`): `Company`, `Contact`, `Signal`, `Score`, `Message`, plus `CallSession` and `CallFinding`. Vendor shapes never leak into the core; they enter through anti-corruption adapters (`packages/integrations`). The result is one governed end-to-end outcome no single horizontal tool delivers, anchored against the claygency retainer rather than a per-seat tool price.
