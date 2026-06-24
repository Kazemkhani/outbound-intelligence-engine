# Huscribe Revenue OS: GTM Experiments

Operator-grade experiment plan to convert the two free pilots into paying, referenceable logos and a repeatable motion. Owner of every action: gp@humai.ae (HumAI, Dubai), solo. Live control plane: https://huscribe-revenue-os.fly.dev. Voice layer: NOVA (api.novalabs.ae), in `DEMO_MODE` until owner sign-off.

This is a backlog of sequenced, falsifiable experiments, not a roadmap. Each has a hypothesis, the action, a metric, and a kill/keep rule. Companion to `docs/revenue-os/GTM.md` (ICP, offer, packaging, pricing thesis); read that first.

---

## Operating principles

- One owner, so run **few experiments at once** (max 2 live). Sequence beats parallelism for a solo founder.
- Every prospect-facing action stays inside the repo's invariants: `DRY_RUN` true, `DEMO_MODE` on, every send through `/approvals`. Dogfood the engine to sell the engine.
- The headline proof is one number: **917 minutes vs <60 seconds** first response (AgentZap; directional), instrumented as the lead-arrival-to-first-ring delta on `CallSession` (`completedAt`, `status`).

---

## Phase 0 (this week): instrument and arm

| # | Action | Owner | Done when |
| --- | --- | --- | --- |
| 0.1 | Confirm both pilots have a written, time-boxed scope (2-3 weeks) and a named decision-maker. | gp@ | Two one-page pilot agreements signed. |
| 0.2 | Verify the before/after instrument: lead-arrival-to-first-ring delta visible per `CallSession`. | gp@ | Delta shows on `/voice` for a demo call. |
| 0.3 | Pick the conversion metric per pilot and write it in the agreement (e.g. qualified after-hours leads captured, viewings booked). | gp@ | Metric agreed in writing by the buyer. |
| 0.4 | Draft the 90-second NOVA demo clip (DEMO_MODE call, Arabic + English) as the universal opener asset. | gp@ | Clip recorded, score rationale visible in frame. |

Kill/keep: if a pilot has no named decision-maker or no agreed metric by end of week, it is not a pilot. Replace it.

---

## Phase 1 (weeks 1-3): pilot-to-paid conversion play

Hypothesis: an undeniable before/after plus a visible trust posture converts a free pilot to paid without discounting.

1. **Weekly pilot value report** (every Monday, owner gp@). One page from `/analytics`: after-hours leads NOVA answered in <60s, qualified count, explainable score rationale per lead, verified facts written back (mobile via `toE164`, tools into `Company.techStack`). Lead with `after_hours_handling = waits till morning` matches, the hottest ICP signal (62% of inquiries arrive after hours; AgentZap, directional).
2. **The conversion call** (end of pilot week 2). Frame value as captured first-responder revenue, not hours saved (~78% of buyers transact with the first responder; per NAR via roundups). Use `/close` ROI tool (code does the arithmetic via `computeRoiMath`; unknowns render as `<CONFIRM>`, never fabricated).
3. **Trust as the close, not autonomy.** Show `/approvals` (nothing dials without human approval), the deterministic score rationale (`scoreLead` returns `fit`/`intent`/`composite`/`tier`/`rationale`; the LLM never scores), and the compliance gate. This is the explicit contrast to the "autonomous AI SDR" category whose trust collapsed in 2025 (11x reported 70-80% churn; TechCrunch, Mar 2025).
4. **Ask for the logo and the referral in the same breath as the close.** A paying pilot that will not be named is a pricing problem, surface it now.

Metric: 1 of 2 pilots converts to paid by end of week 3 (target 2 of 2). Keep the play if conversion-call-to-paid >= 50%.

---

## Phase 2 (weeks 2-6): outreach angles (A/B, dogfooded)

Run all outbound through OIE itself (LinkedIn + email + WhatsApp behind the approval gate), so the engine is its own case study. Target the fragmented base: ~9,785 Dubai brokerage offices plus named developers and portals (Dubai Land Department 2025 review). Test one angle per cohort of ~30 contacts.

- **Angle A: the after-hours leak.** "62% of your inquiries arrive after 6 PM. Where do they go?" Open with the question NOVA asks in DISCOVERY; the answer qualifies and enriches.
- **Angle B: first-responder math.** "78% of buyers sign with whoever answers first. Your average is 917 minutes. NOVA's is under 60 seconds." Attach the demo clip.
- **Angle C: off-plan launch spike.** For developer sales heads: a single tower launch spikes hundreds of simultaneous remote inquiries no human team can triage (off-plan 60%+ of 2025 sales; Arthur Mackenzy, directional). NOVA triages them in Arabic + English in real time.
- **Angle D: compliance-first.** For larger/portal buyers: "An AI dialer you can actually run in the UAE." Built-in TDRA/PDPL gate (consent / DNCR / 9 AM-6 PM window), where generic voice vendors have none.

Metric: positive-reply rate per angle. Keep the top 2 angles; kill the bottom 2 after ~30 sends each. Channel: open on LinkedIn for owners/sales heads (89% of B2B marketers use LinkedIn; Hikmah AI, directional), follow with email; WhatsApp only after opt-in.

---

## Phase 3 (weeks 4-10): pricing tests

Hypothesis: Huscribe prices at or above the claygency band as the higher-ticket, end-to-end alternative, not at tool prices.

- **Anchor explicitly.** In every pricing conversation, name the claygency retainer ($3k-$15k/mo, ColdIQ ~$5k-$12k/mo on 3-6 month minimums; gtm-engineering.io, outreachark.com, third-party estimates) and the per-seat AI-SDR tax (11x ~$1,500/seat/mo; Vendr). Position Huscribe as one control plane, no per-seat tax, plus a voice motion the claygencies do not have.
- **Test 1 (boutique tier):** productized done-for-you inbound qualification, priced at the lower claygency band, monthly, no annual lock. Hypothesis: transparency beats opaque annual contracts for the solo/boutique buyer.
- **Test 2 (developer/portal tier):** full Revenue OS + NOVA at or above the upper band. Hypothesis: off-plan launch revenue justifies premium.
- **Test 3 (anchor framing):** present the COGS line openly (Clay $185-$495, Apollo $49-$119; clay.com, apollo.io) as "what you would pay for raw tools," then the governed outcome on top. Test whether transparency raises or lowers close rate vs a flat number.

Metric: close rate and average contract value per tier. Keep the tier/framing with the highest ACV x close-rate. Do not discount to convert a pilot; trade price for a multi-month commitment or a public reference instead.

---

## Phase 4 (weeks 3-8): proof assets

Each asset is built from real pilot output, never fabricated. Unknown facts stay `<CONFIRM>` or unknown, never guessed (repo invariant).

1. **The before/after one-pager** per converted pilot: 917 min vs <60s, qualified-lead count, viewings booked. The single most persuasive artifact.
2. **The 90-second DEMO_MODE clip** (Angle B asset): NOVA handling a real after-hours call in Arabic + English, with the explainable score rationale on screen.
3. **The trust teardown**: a short doc/screen-recording of `/approvals` + score rationale + compliance gate, positioned against the 11x churn story.
4. **Two named reference logos** (the converted pilots) with a one-line quote and permission to use. The first two are the master DB's first verified entries and the GTM flywheel's seed.

Metric: 1 before/after one-pager and the demo clip live by week 4; 2 named logos by week 10.

---

## Phase 5 (weeks 8-16): channel scale and the live-dial gate

- **Events.** Plan walk-the-floor outreach to developer sales heads and portal leadership at GITEX / LEAP / GISEC (GITEX 2025: 200,000+ visitors; Bitcot). Build the target list now from the brokerage base and named developers.
- **Portal partnership (longer play).** Scope a Property Finder / Bayut inbox adapter under `packages/integrations` (behind anti-corruption contracts) so portal leads trigger NOVA instantly. This is the highest-leverage distribution unlock.
- **Hard pre-live gate (blocking, not a code task).** Before NOVA places a single real PSTN call for a paying customer: TDRA telemarketing approval, a licence-registered UAE caller-ID number, and live DNCR screening (Cabinet Resolution 56/2024; PDPL 45/2021). The 9 AM-6 PM window, weekend/holiday ban, and frequency caps are hard pre-dial assertions; DNCR fails closed. Until then, every paid engagement runs in `DEMO_MODE`. Keep this in `docs/PRODUCTION-CHECKLIST.md`.

---

## Weekly metrics (review every Monday, owner gp@)

| Metric | Source | Target |
| --- | --- | --- |
| Pilots converted to paid | pilot agreements | 2 of 2 by week 3 |
| Best before/after delta shown | `CallSession` (arrival-to-ring) | < 60s vs 917 min |
| Outbound positive-reply rate | `/approvals` + replies | rising; keep top 2 angles |
| Conversion-call to paid | sales log | >= 50% |
| Average contract value per tier | sales log | at/above claygency band |
| Named reference logos | signed permissions | 2 by week 10 |
| Master DB verified contacts | `Contact` (verified mobile) | growing weekly |

Cadence: Monday review (metrics + kill/keep), midweek execution, Friday the weekly pilot value report goes to the buyer. Never run more than 2 experiments live at once.
