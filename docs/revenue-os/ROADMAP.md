# Huscribe Revenue OS Roadmap

> One control plane covering end-to-end sales for Huscribe.com (voice-AI inbound lead-qualification for UAE/MENA real estate). Operator: gp@humai.ae (HumAI, Dubai). This roadmap sequences the work in four phases with the rationale for each ordering, and folds in the 2025-2026 market and compliance research that shapes the priorities.

The roadmap obeys the invariants the codebase enforces and never relaxes them: the LLM never computes a score (code does, deterministically and explainably, in `packages/core`); missing data stays unknown, never guessed; nothing sends or dials on any channel without explicit human approval plus a passing dry-run; `DRY_RUN` stays true; NOVA stays in `DEMO_MODE` until the owner signs off; secrets live only in Fly secrets.

The sequencing principle is the safety posture itself: everything before live calling is reversible and can ship continuously; live PSTN dialing is a one-way door gated on legal prerequisites and an explicit human approval. Build fast and safely up to that door, then cross it deliberately.

---

## Phase 0: Live now (control plane + NOVA demo)

**Status: shipped.** This is the current baseline, not future work.

- The control plane is live in production at `https://huscribe-revenue-os.fly.dev` (Fly.io app `huscribe-revenue-os`, region `fra`), login-protected with real Auth.js v5 operator credentials. The dev backdoor is disabled in production and secrets live only in Fly secrets.
- The full discover -> enrich -> signal -> deterministic score -> approval-gated sequence pipeline is implemented and green, paused at the live-send gate with `DRY_RUN` held on.
- NOVA (`api.novalabs.ae`) is wired in via `scripts/nova-call.ts`: a 4-phase LiveKit agent (Greeting -> Discovery -> Pitch -> Close) with DSPy pre-call context and a built-in compliance gate (consent / DNCR / calling-window), running in `DEMO_MODE` (LiveKit room dispatch, no real PSTN). Each completed call persists a `CallSession` plus `CallFinding` rows and feeds master-DB enrichment (verified mobile -> `Contact`; tools -> `Company.techStack` plus a `tech_adoption` `Signal`), but only for consented facts.

**Why this is the right baseline.** The market research is unambiguous that the durable margin has moved from data and sending tools (Clay at $185-$495/mo, Apollo at $49-$119/user/mo) to orchestration and outcomes ([Clay pricing](https://www.clay.com/pricing); [Apollo pricing](https://www.apollo.io/pricing)). Huscribe already does in software what Clay agencies charge $3k-$15k/month of human labour to assemble ([clay-agency retainers](https://blog.gtm-engineering.io/blog/best-clay-automation-agencies)). The control plane being live, gated, and explainable is the asset; the next phases compound it.

---

## Phase 1: Near-term consolidate, harden, and prepare for live calling

The goal is a single product where the seller's whole motion lives in one app, with the safety and compliance work done in advance so the live-calling decision is purely a sign-off, not an engineering scramble.

### 1a. Port Voice Dojo and Knowledge Q&A from APEX, then retire APEX

APEX (`apex-sales-os`) is the operator's separate FastAPI sales co-pilot. Two of its modules belong inside the Revenue OS so the operator does not switch apps:

- **Voice Dojo** at `/dojo`: interactive turn-by-turn role-play against a buyer persona, scored on a rubric (talk/listen, pain quantified, discovery depth, objection handling, close attempted) with specific fixes. This sharpens the same live qualification conversation NOVA runs.
- **Knowledge Q&A** at `/knowledge`: answers grounded strictly over the embedded methodology canon (SPIN, Challenger, Gap Selling, MEDDICC, Voss), naming the framework and giving a usable line, never generic LLM advice.

Both are LLM-grounded features, so they respect the existing invariant boundary: the LLM personalises and coaches; it never scores a lead. Once ported, APEX retires and there is one app to run and sell.

### 1b. Harden the deployment and the compliance gate

Hardening splits into infrastructure and the pre-dial compliance contract.

- **Infrastructure:** confirm secure cookies plus HSTS/CSP headers, no `NEXT_PUBLIC_*` secret leak, `force_https`, scale-to-zero, and bake `trustHost: true` into the auth config. Keep `pnpm verify` green and add tests for the new logic (canon grounding, finding extraction).
- **Compliance gate (the differentiator, made demonstrable):** the research is clear that UAE telemarketing law is strict and enforced. Harden NOVA's gate into hard, fail-closed pre-dial assertions before live dialing is ever possible:
  - Enforce the Asia/Dubai 09:00-18:00 window plus a UAE weekend and public-holiday calendar, with a per-`Contact` frequency ledger (one call/day, two/week if unanswered, hard stop after a same-day refusal) derivable from `CallSession` timestamps ([Cabinet Resolution 56/2024](https://www.trenchlaw.com/new-telemarketing-rules-in-uae-timings-fines-exemptions-explained/); [Pinsent Masons](https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity)).
  - DNCR check fails closed: no authoritative status means not-callable, matching "missing data = unknown" ([Morgan Lewis](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2024/07/telemarketing-in-an-evolving-legal-landscape-uae-adopts-regulations-on-telemarketing-activities)).
  - Log `consentBasis`, calling-window result, and DNCR-check provenance per `CallSession` for an auditable suppression record, and write a durable opt-out flag on the `Contact` that blocks all future channels when consent is withdrawn ([PDPL Federal Decree-Law 45/2021](https://securiti.ai/uae-personal-data-protection-law/)).
  - Capture LiveKit per-turn latency and turn-detection metrics into `CallSession.raw` as a "feels human" QA bar (<300ms, no early interruptions) before the owner flips `DEMO_MODE` off ([LiveKit latency](https://livekit.com/blog/understand-and-improve-agent-latency)).

Buyer skepticism of "autonomous AI SDR" claims is now the market default after the 11x trust collapse (reported 70-80% churn, inflated ARR, named non-customers, [TechCrunch, Mar 2025](https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/)), and explainability/auditability is the top stated accountability requirement ([directional survey data](https://www.allaboutai.com/resources/llm-hallucination/)). Making the compliance gate a marketed, demonstrable feature, not invisible plumbing, is the antidote and the wedge.

### 1c. Make speed-to-lead and conversation-enrichment measurable

- Persist the lead-arrival-to-first-ring delta on `CallSession` so the operator can show "917 minutes vs <60 seconds" as the before/after on every pilot. Speed-to-lead is the single biggest controllable conversion lever: ~78% of buyers work with the first responder, the average agent takes ~917 minutes to respond, and ~62% of inquiries arrive after hours ([AgentZap](https://agentzap.ai/blog/real-estate-lead-statistics); [Verse](https://verse.ai/blog/speed-to-lead-statistics)).
- Surface `after_hours_handling = waits till morning` as a high-weight intent signal in `packages/core` so the database NOVA builds auto-prioritises prospects visibly losing the after-hours 62%.
- Add a freshness/`verifiedAt` timestamp to enriched `Contact` fields so scoring can decay un-reverified data (~2.1%/month) and re-queue contacts whose verified mobile is aging, making the verify-by-conversation flywheel measurable ([data-decay benchmark](https://www.spotlight.ai/post/ai-crm-data-enrichment)).

### 1d. Live calling, with owner sign-off (the one-way door)

This is the deliberate, gated transition from `DEMO_MODE` to real PSTN. It depends on items that are not code and must be treated as blocking prerequisites:

1. TDRA telemarketing approval obtained by the operator (HumAI), plus a UAE caller-ID number registered under the trade licence and wired into the LiveKit/PSTN path; operating without approval carries AED 75,000-150,000 fines ([Clyde & Co](https://www.clydeco.com/en/insights/2024/07/uae-tightens-telemarketing-regulations-what-you-ne)).
2. An authoritative DNCR lookup path confirmed and the calling-window and frequency gates passing their dry-run.
3. A documented data-transfer basis for any cross-border movement of UAE lead data (e.g. to a US LLM or the Fly `fra` region), designed to the stricter expected PDPL baseline now rather than waiting on the Executive Regulations ([Chambers PDPL trends](https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/uae/trends-and-developments)).
4. **Explicit owner sign-off** to disable `DEMO_MODE`, mirroring the send-gate model: ramp calls low-volume first, approve early calls individually, and monitor the human-perceived latency bar.

Off-plan now dominates the UAE market (60%+ of 2025 sales) and off-plan buyers comparison-shop multiple launches remotely and reward the first responder, so live calling captures exactly the lead type human teams cannot triage in real time ([Arthur Mackenzy](https://arthurmackenzy.com/dubai-property-market-hits-37-6bn-in-q3-2025-as-off-plan-sales-surge/)).

---

## Phase 2: Master-DB resale and the data moat

The durable defensibility is not the voice agent (the category is commoditising: Bland, Synthflow, Retell, and Vapi all sell near-identical per-minute infrastructure, [Retell comparison](https://www.retellai.com/blog/bland-vs-synthflow)). It is the conversation-verified master database that compounds with every consented call. "The calls that build the database ARE the product."

- **Property Finder / Bayut inbox adapter** under `packages/integrations`, behind the existing anti-corruption contracts, so portal leads trigger NOVA instantly. Make the standard UAE qualification fields (budget, area, bedrooms, ready vs off-plan, timeline, payment method) first-class `CallFinding` keys, and capture language/nationality, since nationality strongly predicts product fit (villa vs off-plan tower) in a buyer pool spanning 150+ countries ([Deloitte Dubai 2025](https://www.deloitte.com/middle-east/en/about/press-room/deloitte-unveils-dubais-real-estate-predictions-report-for-2025.html); [2HatsLogic](https://www.2hatslogic.com/blog/ai-lead-qualification-real-estate-dubai/)).
- **The compounding loop as the moat.** Conversation is the highest-value enrichment source and far harder to copy than firmographic data; NOVA replaces decaying third-party records with conversation-verified facts the moment they are spoken, across a fragmented base of ~9,785 brokerage offices plus the big developers and portals ([Dubai Land Department 2025](https://dubailand.gov.ae/en/news-media/dubai-s-real-estate-brokerage-sector-witnessed-a-notable-transformation-in-scale-and-impact-in-2025-reaffirming-its-position-as-a-key-regulatory-and-economic-driver-within-the-real-estate-ecosystem-this-development-was-driven-by-higher-leve)). Native Gulf-Arabic plus English handling is a local moat against generic US voice vendors ([MAJ Leads](https://www.majleads.com/blog/ai-voice-agents-dubai-real-estate)).
- **Resale, gated on consent.** Any productisation or resale of the master DB must inherit consent and purpose limitation: enrichment never outlives the consent that justified it, every fact carries `consentBasis` and provenance, and opt-out is system-enforced across all channels ([PDPL consent](https://www.cookieyes.com/blog/uae-data-protection-law-pdpl/)). The pricing anchor is the claygency retainer band ($3k-$15k/month) and the AI-SDR per-seat model ($1,500-$10k/month, opaque, annual, [Vendr 11x](https://www.vendr.com/marketplace/11x)), not Clay's seat price; Huscribe wins on transparent, region-specific, gate-safe packaging with no per-AI-agent tax.

This phase comes last because resale is only credible once the DB is large, fresh, and provably consented, which requires live calling at volume (Phase 1d) running on top of the portal-triggered, fully instrumented motion.

---

## Sequencing summary

| Phase | What | Gate to advance |
| --- | --- | --- |
| 0 | Live control plane + NOVA demo | Shipped |
| 1a-1c | Port Dojo/Knowledge, retire APEX, harden, instrument speed-to-lead + freshness | `pnpm verify` green; compliance gate fails-closed; metrics persisted |
| 1d | Live PSTN calling | TDRA approval + licence-registered number + DNCR path + transfer basis + **owner sign-off** |
| 2 | Portal adapter, data moat, master-DB resale | Volume of consented, verified, fresh records; consent/provenance enforced on every fact |

GTM runs in parallel throughout, dogfooding OIE's own outbound (LinkedIn + email + WhatsApp behind the approval gate) to sell Huscribe into the ~9,785 brokerages and named developers, concentrated on GITEX/LEAP and targeted LinkedIn outbound ([Bitcot GITEX](https://www.bitcot.com/gitex-global-dubai/); [Hikmah AI](https://www.hikmahaiagency.com/blog/digital-marketing-saas-dubai-2026)). Every send still passes `DRY_RUN` plus human approval.
