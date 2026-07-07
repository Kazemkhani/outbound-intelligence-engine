/**
 * The APEX sales canon, distilled.
 *
 * These constants are faithful, compact distillations of the APEX knowledge
 * files (knowledge/*.md in the cockpit repo). They are injected into the Close
 * Room prompts as grounding so every AI answer is tied to a named framework and
 * never falls back to generic LLM advice. This replaces runtime RAG: the canon
 * is small enough to ship in the system prompt and prompt-caches well.
 *
 * Voice and facts mirror the source: Huscribe is voice-AI inbound lead
 * qualification; the ICP is UAE real-estate developers and portals; framework
 * grounding is SPIN / Challenger / Gap / MEDDICC / JOLT plus Voss, Sandler,
 * Blount, Lavender and Hormozi. Every Huscribe number, price, and proof point in
 * the source is a <CONFIRM> placeholder; that discipline is preserved here so the
 * model never invents specifics.
 *
 * Server-safe: pure string constants, no imports, no secrets.
 */

// ── Frameworks: the question engine (SPIN / Challenger / Gap / MEDDICC / JOLT) ─

export const FRAMEWORKS = `# SALES FRAMEWORKS (the question engine)

CARDINAL SIN: pitching Huscribe features before the buyer has agreed a quantified gap and named a pain owner. A demo opener abandons every framework at once.
SCORING RULE: a rep over 50% of call time on Situation questions is underperforming. A call ending with no Metrics number, no named Champion, and no quantified gap is at high risk of no-decision.

SPIN (Rackham): discovery questioning, calls 1 to 2.
- Sequence: Situation (context, max ~2, you already know their stack) -> Problem (surface the pain) -> Implication (quantify the cost; the heavy-lifting stage, 60 to 70% of question time) -> Need-payoff (let the BUYER state the value).
- GenRiver shape: S "how many inbound leads/month?"; P "what % do you reach on first dial? what happens to an 11pm Saturday lead?"; I "if 800 leads/month never get reached, what does that cost in viewings/units annually?"; N "if every lead got a qualifying call in 90s, 24/7, what does that mean for this quarter's number?"
- Fail flags: S > 2 (over-qualifying); Problem with no Implication follow-up (incomplete); price before Need-payoff (premature pitch).

CHALLENGER (Dixon and Adamson): Teach, Tailor, Take Control. Open call 1 with a commercial INSIGHT before any question, not a product tour.
- Teach (verbatim opener, adapt): "Most developers think their lead-response problem is a staffing problem. The data says otherwise: most buyers choose whoever responds first, and it matters most in the first five minutes. After 30 minutes a prospect is ~21x harder to reach. The winners aren't hiring more SDRs, they're taking the 11pm Sunday inquiry off the human queue entirely."
- Tailor: sales director -> pipeline coverage and SDR productivity; CEO/owner -> revenue per lead, CAC, competitive speed; marketing head -> lead waste (money spent acquiring leads never contacted).
- Take Control: "Let me show where your numbers likely sit vs competition, then you tell me if it's worth 20 more minutes." Never "whatever works for you" when they stall.
- Fail flags: opens with "tell me about your current process" (no Teach); never names a market/competitor dynamic; cedes control on next steps.

GAP SELLING (Keenan): current state vs desired state; the QUANTIFIED gap is the only justification to buy. No gap number = no urgency = no deal.
- Build the gap math live in their numbers: e.g. 2,000 leads x 22% contact x 8% lead-to-viewing = 35 visits/mo; with Huscribe 55% x 15% = 165 visits/mo; delta +130 qualified viewings/mo. Convert to units and AED pipeline.
- KEY RULE: never present Huscribe pricing before the gap number is written down together. Without an agreed gap there is no deal to close, only a demo to give.
- Fail flags: features before the gap is quantified; letting "we lose some leads" stay un-numbered; never computing the AED/USD cost of the gap.

MEDDICC: deal-risk scorecard, fill in CRM after call 1; every blank is a risk.
- Metrics: "what does success look like in numbers (contact rate, cost-per-qualified-lead, units/quarter)?" Economic buyer: "who owns the budget, you or above you?" Decision criteria: "two or three things that make it a clear yes?" Decision process: "who signs off, what's the flow?" Identify pain: "most painful part of the current process?" Champion: "who feels this every day if we get it right?" Competition: "other solutions, or build-vs-buy?" Paper process: "procurement, legal, approval levels?"
- Fail flags: no Metrics (no ROI basis); no Economic buyer by end of call 1 (selling to a non-buyer); no Champion (dies in committee); unknown Paper process (surprised by procurement delays).

JOLT (Dixon and McKenna): the main loss is to INDECISION (FOMU: fear of messing up), not a rival. Reduce perceived risk of buying; do not keep hammering value; overloading information makes indecision worse. Use when a deal goes quiet or "I need to think."
- Judge the indecision: "is it that you need more info from us, or that you want to be sure it's the right call internally?"
- Offer one confident recommendation (not 4 options): "given your volume and team, I'd start with the standard 3-question, 90-second flow, Monday to Sunday."
- Limit options to two max: "full autonomous qualification, or a hybrid that hands off to your SDR within 2 minutes. Which fits how you work?"
- Take risk off the table: "30-day pilot on one project, 300 to 500 leads; if the numbers don't move we don't bill month two." Peer reference offer is the strongest close-assist.
- Fail flags: sending a 10-page deck to a stalled buyer (amplifies FOMU); 3+ tiers with no guidance; no risk-reversal offer.

COMBINING ON ONE DEAL: prep = MEDDICC; call-1 discovery = SPIN (P + I heavy) + Gap, with a Challenger Teach opener; call-1 close = Challenger Take Control + JOLT; proposal = Gap math first + validate MEDDICC; post-demo stall = JOLT; negotiation = Challenger (don't cave); closing = JOLT (risk off the table).`;

// ── Objections: isolate -> acknowledge -> calibrated Q -> reframe -> confirm ──

export const OBJECTIONS = `# OBJECTION HANDLING (Voss + Blount)

MASTER RULE: never answer the stated objection before isolating the REAL one. The words are rarely the blocker. Method for every objection: Isolate -> Acknowledge (label the emotion) -> Calibrated question (What/How, never Why, never yes/no) -> Reframe (connect to the quantified gap, cost of inaction > cost of Huscribe) -> Confirm (a specific low-stakes micro-commitment). Objections are requests for more information, not rejections (Blount).

"It's too expensive": rarely lack of money; value not yet justified, or testing you. Open: "when you say it's expensive, what are you comparing it to?" Reframe: bring back the gap number ("1,560 leads/mo never get a qualifying call; that's a recovery question, not a pricing one"). Never discount before isolating; never defend features.

"No budget right now": usually priority, not absence; or they don't own budget. Open: "what would need to be true for this to find a place in the budget?" Reframe: "you're already spending it on SDR time for unqualified leads; this is a reallocation, not a new line item." Offer pilot-first to ease approval.

"Happy with our current vendor/setup": status quo bias; "happy" = not enough pain to switch. Open: "what does the current setup do well that you'd worry about losing?" then "what's the one part you wish worked differently?" Reframe: isolate the gap (after-hours, weekends, deprioritised queue); Challenger teach the contact-rate benchmark gap (top quartile ~55% vs typical 22 to 28%).

"I need to think about it": FOMU, a JOLT situation, not a request for time. Open: "is it the fit for your use case, or getting alignment internally?" If fit: offer one recommendation + a pilot (real data beats a deck). If internal: offer a one-page numbers summary or to join a 20-min call. Never let it end the call without a specific dated follow-up.

"No time right now": priority, not calendar. Open: "what's taking most of your attention right now?" Reframe: "a launch is exactly when lead volume peaks, so a 22% contact rate is losing the most leads today." Reduce the ask to one 20-minute call with numbers pre-modelled.

"Send me information / a deck": usually a polite end, not how serious buyers buy. Open: "so I send exactly what's relevant, what's the specific part you'd want it to answer?" Reframe: a tailored version beats a generic PDF; ALWAYS anchor a dated next step before hanging up ("Friday morning or early next week?"). A deck with no next step is a dead deal.

"Not the right time / call me in Q3": urgency not established; a gap-selling failure. Open: "what changes in Q3 that makes it better (budget cycle, team change, milestone)?" If real: lock a firm dated call now. If vague: quantify the cost of waiting ("3 months ~ 6,000 leads through the current process; ~4,680 never get a qualifying call").

"I'm not the right person": either true (pivot to the economic buyer) or a shield (convert this contact into a Champion). Open: "who owns this decision, and what does the evaluation process look like?" Convert: "the strongest way to bring this to [decision-maker] is a one-page summary of YOUR numbers; I can build that for you."

NEVER: discount before isolating; answer the surface objection at face value; send info without a booked next step; let "I need to think" end the call without a dated action; accept a vague timeline without turning it into a calendar commitment.`;

// ── Voss: the emotional layer (label, mirror, calibrated Q, audit, no, pause) ─

export const VOSS = `# VOSS TACTICAL EMPATHY (the emotional layer)

Cite the tactic by name when coaching. Each tactic is scorable.

LABELLING: verbalise the apparent feeling: "it sounds like...", "it seems like...", "it feels like...". Never "I hear that you feel" (breaks the mirror). Use after any negative signal (silence, sigh, short answer, objection). MISUSE: never follow a label immediately with a question; label -> pause -> let them confirm or correct.

MIRRORING: repeat the last 1 to 3 (or most emotionally loaded) words with a slight upward inflection, then stop. Use to make them elaborate without leading. MISUSE: don't mirror every sentence; more than once per 3 to 4 exchanges is robotic.

CALIBRATED QUESTIONS: open with What or How, never Why (accusatory). "What about qualifying leads is the biggest drain right now?" "What would need to be true for a pilot to be worth your time?" MISUSE: not an interrogation; one per exchange, label the answer before the next.

ACCUSATION AUDIT: pre-name the negative thoughts before they voice them, to neutralise them. "You're probably thinking this is another AI vendor that overpromises, your team won't adopt it, and it can't handle your buyers' objections. All fair. Let me show where that's valid and where it's not." Use at cold/warm openers, before pricing, before asking for a commitment. MISUSE: 3 to 4 fears max, or you sound defensive and surface objections they hadn't considered.

NO-ORIENTED QUESTIONS: phrase so they can safely say "no". "Is now a bad time?" "Would it be ridiculous to spend 15 minutes on whether this fits your Q3 targets?" "Is there any reason we shouldn't run a one-week pilot?" MISUSE: not manipulation; if a sincere "yes, bad time" comes back, accept it and book a slot.

CHASING "THAT'S RIGHT": the discovery goal. "That's right" = they feel fully understood and resistance drops; "you're right" = dismissal. Get there with a tight summary capturing facts AND emotion in their own words after 8 to 12 minutes of discovery, then wait. MISUSE: never fish with a leading question ("so basically you need us, right?" earns a hollow "you're right").

SILENCE / DYNAMIC PAUSE: after a mirror, a label, a number, or the ask: stop talking, count to three internally. Winning calls pause ~0.6 to 1.0s after an objection before responding; rookies respond in under 0.2s (reads as defensive). Don't re-ask, paraphrase, or add "you know what I mean?" (all flinching). MISUSE: don't weaponise silence on warm small talk.

SEQUENCE ON A DISCOVERY CALL: opener (no-oriented question + accusation audit) -> discovery (one calibrated Q per exchange; mirror loaded statements; label negative signals; pause after each) -> synthesis (build to "that's right") -> present/pilot ask (only after "that's right"; no-oriented close; silence after the ask). You may not advance a phase until the current one is complete.`;

// ── Personalization: observation -> implication -> question (Lavender, Hormozi) ─

export const PERSONALIZATION = `# PERSONALIZATION AND COLD OUTREACH (the human layer)

CORE: generic AI 'personalization' is now WORSE than none. Buyers pattern-match a templated opener and archive it on the first clause. A recited fact and a compliment are the SAME failure. The pass is OBSERVATION -> IMPLICATION -> one QUESTION. Relevance beats personalization beats copy quality.

THE ENGINE: Observation (concrete, verifiable, their words) -> Implication (the non-obvious business consequence carrying a number or named stake; this is LOAD-BEARING) -> one Question (5-second, low-friction, a call to conversation). A fact is only ammunition until it is converted to a hypothesis.

RUBRIC (score 0 to 2 on 5 axes = /10): Specificity, Implication/so-what, Relevance/why-now, Brevity+one-ask, Feels-understood-not-researched-at. GATE: 0 on Specificity or Implication, or total < 7/10, means regenerate.
WEAK (~2/10): "Congrats on the Business Bay launch! Exciting times. We help developers with lead management, would love to connect."
STRONG (~9/10): "Your Business Bay launch is about to 3 to 5x your portal leads, and that surge lands in the exact hours nobody's free to call them back. How are after-hours inquiries getting handled right now?"

HARD BANS (forbidden first clause): Congrats / Loved your post / Impressive / Exciting times / Hope this finds you well / I came across your profile / I wanted to reach out / Just following up / circling back / bumping this / touching base / checking in / solution-first opens. If the first clause could be a LinkedIn comment, it is banned. A signal is evidence you understand their operation, not an occasion to congratulate them.

PREMISE HIERARCHY (Becc Holland, best to worst): self-authored content > engaged content > self-attributed traits > company info > junk drawer (never open on it). Specific does NOT mean invented; thin signal -> say so and mark <CONFIRM>; a truthful thin opener beats a fabricated rich one.

SIGNAL -> OPENER (implication-first):
- launch/news: "Your launch is about to 3 to 5x your portal leads, and that surge lands in the hours nobody's free to call them back. How are after-hours inquiries handled now?"
- job_change: "New commercial leaders get ~90 days to show one measurable win; speed-to-lead moves contact rate inside two weeks, faster than any hire. What's the first metric you're judged on?"
- hiring: "Before you add AED 10 to 15k/mo per head to the phones, the leads outrunning your team are the after-hours ones a new hire still won't catch. What's your contact rate on 11pm and weekend inquiries?"
- funding: "Growth capital comes with a board asking why CAC is high; the quietest leak is leads you paid for that never got a callback. Want the math on what that's costing?"

PERMISSION-BASED COLD-CALL OPENER (Jason Bay): observation + implication -> permission check; <= ~25 spoken words before the ask; warm, smiling, no upward inflection. Skeleton: "Hi [Name], I'm calling about the [launch]. I work with developers where launch-week leads spike and the after-hours ones never get called back. Did I catch you at a bad time?" Cribsheet (ledge -> bridge to consequence -> ONE re-ask) for "not interested" / "send me an email" / "we have a team": arguing the reflex no = fail; folding = fail; one re-ask, not three.

HORMOZI VALUE EQUATION: Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort and Sacrifice). Dream outcome = "every lead you already paid for actually picks up"; likelihood = local peer + their own pilot data (<CONFIRM>, never invented); drive time-delay down (<60s, moves in two weeks); drive effort down via the offer. Irresistible pilot: 50 portal leads, 2 weeks, their after-hours/weekend slice, they listen to the calls, they hold the kill switch, VIP villa pipeline excluded.

BREVITY: WhatsApp 1 to 3 lines + exactly one question; cold-call <= ~25 words before the permission ask; voice note 20 to 35s; email de-emphasised, 25 to 75 words, single CTA. The ask is a call to conversation or 20 minutes on their numbers with two times offered.`;

// ── Dubai/UAE GTM: working week, WhatsApp-first, register, consent, P&L ───────

export const DUBAI_PLAYBOOK = `# DUBAI / UAE / MENA GO-TO-MARKET (local overlay)

SCORING RULE: a technically flawless US-style sequence can LOSE here. Score local fit: right channel (WhatsApp), respect for the week and prayer/Ramadan rhythm, appropriate Arabic/English, consent-awareness, and proof framed locally (a Business Bay developer, RERA, Bayut economics). A flawless sequence sent Friday afternoon to a stranger's WhatsApp with no consent is a FAILING sequence.

THE WEEK AND DAY: prime contact days are Tuesday to Thursday. Monday = catch-up; Friday = NO cold contact (prayers, family); weekends = automated nurture only, never a human dial. KSA and some neighbours run Sunday to Thursday. Golden hours ~10:00 to 13:00 and ~16:00 to 18:00; calls dip 13:00 to 16:00 (lunch + Dhuhr/Asr prayer). A missed call on a prayer window is not a brush-off.
RAMADAN: hours compress (~10:00 to 15:00), afternoon energy drops, tone shifts to relational and gracious. Iftar/evening = no business contact. Reduce volume, lead with goodwill ("Ramadan Kareem"), move hard asks before the afternoon slump, never push a same-week pilot start, schedule the real push post-Eid. Aggressive volume or a hard close on a Ramadan afternoon = tone-deaf, flag.

WHATSAPP-FIRST: in the UAE WhatsApp is the default BUSINESS channel where deals actually happen; email is for documents and formality, LinkedIn for the first credible intro. Keep messages short, warm, one idea per message; use voice notes on warm A-tier threads (native, strong in Arabic); lead with the signal + one question, then stop. NEVER open a cold no-consent WhatsApp with a pitch (norm + consent violation); never broadcast-blast. EARN the channel: LinkedIn/email first -> on reply, "easier to send this on WhatsApp? what's the best number?" -> consent captured -> warm WhatsApp opener.

LANGUAGE AND REGISTER: English is the default language of UAE business; you do not need fluent Arabic. Arabic courtesy carries warmth: As-salamu alaykum / Marhaba, Inshallah, Ramadan Kareem, Shukran. Register matters more than vocabulary: relationship-first, respect-first, titles matter (Sheikh, Eng., Dr., Mr./Ms.); the hard transactional US open lands as rude. Deliver insight as a respectful question. Names span Emirati, Indian, Pakistani, Egyptian, Lebanese, British; don't assume language from a name; mirror whatever language/channel they reply in. NEVER fake Arabic fluency (a misused phrase is worse than none).

CONSENT (PDPL / TDRA): a <CONFIRM> zone: state what you know, confirm current posture, never bluff legal specifics. UAE PDPL (Federal Decree-Law No. 45 of 2021, UAE Data Office) governs personal data and generally expects a lawful basis/consent; free zones (DIFC, ADGM) may have their own regimes; TDRA regulates unsolicited electronic marketing with opt-out. REFRAME as Huscribe's advantage: a lead who submits a Property Finder form has given consent, strongest in the first minutes; Huscribe acts on it within 60 seconds, fully lawful, while it's fresh. The compliance risk is the OPPOSITE of the assumption: it's the lead you call three days later out of the blue. Confirm Huscribe's AI-disclosure posture; never promise "undetectable" AI; position transparency as a feature the developer controls.

DEVELOPER P&L: the portals are Property Finder and Bayut (Dubizzle); developers pay a hard, known cost per lead plus paid traffic (Meta/Google). The wedge: they pay full price for every lead but reach only a fraction; a lead they paid for that never gets a callback is 100% wasted spend, invisible as "low conversion." Gap framing: "you're paying AED [X] per lead, reaching ~22%, so you're burning ~78% of that spend, not because the leads are bad but because nobody calls them in time. Huscribe makes the leads you already paid for actually pick up; the cheapest pipeline you'll ever buy." Pitch the HIGH-VOLUME portal/off-plan funnel, NOT the VIP/HNW villa pipeline (relationship-gated); naming that distinction yourself builds trust.

LOCAL PROOF: geographic specificity beats logos ("a Business Bay developer running ~1,500 portal leads/month"). RERA/DLD literacy and PDPL compliance are trust signals. The peer-reference offer is the single strongest close-assist in a relationship market. Founder-led is a feature here: "you'll deal with me directly." Never name a client without permission; never invent numbers.`;

// ── Discovery first call: Up-Front Contract + Pain Funnel + NEAT (Sandler) ─────

export const DISCOVERY = `# THE DISCOVERY FIRST CALL (the container, Sandler)

SCORING RULE: a first call without an agreed agenda at the top (Up-Front Contract) and a quantified pain at the bottom (Pain Funnel reaching cost) is a conversation, not discovery. The most common failure is the friendly rep who learns nothing actionable ("a nice chat"). Score the structure HELD, not the rapport felt. No pain, no sale.

UP-FRONT CONTRACT (open every call, re-set before each meeting): agree five things: Time ("you'd blocked 30 minutes, still good or a hard stop earlier?"); Their agenda ("what made you take this call? what would make the next 30 minutes worth it?"); Your agenda ("I want to understand your lead flow and the first five minutes, then show where your contact rate likely sits vs benchmark; I'm not going to demo at you cold"); Outcomes ("at the end either there's a gap worth fixing and a next step, or there isn't and we both move on, or we need more people; all three are fine"); Right to 'no' ("if partway through this isn't a fit, tell me; I'd rather hear a fast no than a slow maybe"). FAIL: no agenda / straight into product; buyer's agenda not surfaced.

PAIN FUNNEL (fixed descent; do NOT rescue them out of the pain by jumping to the solution): L1 Surface ("walk me through a lead's first hour today") -> L2 Specific ("the last lead in at 10pm Friday, what actually happened?") -> L3 Duration ("how long has the after-hours gap been like this?") -> L4 Tried-before ("more SDRs, a BPO, an auto-dialler? how did that go?" the qualifier: tried-and-failed = real, pre-qualified buyer) -> L5 COST, the money level, do not skip ("~2,000 leads/mo at 22% contact = ~1,560 never get a qualifying call; at your unit economics, what does that come to?") -> L6 PERSONAL, the level rookies never reach ("when the MD asks why CAC is up, how does that sit with you?"). Use the Voss layer between levels: label -> mirror -> pause. PASS: reaches L5 with a number in the BUYER'S own words ("Yes, Full"); EXCELLENT: reaches L6. FAIL: stalls at problem-naming, or the rep states the cost FOR the prospect (it's only pain if they say it).

QUALIFICATION: run NEAT on the call, MEDDICC on the deal, never BANT-first. NEAT = Need, Economic impact (the cost of the problem, replacing "do you have budget"), Access to authority, Timeline. Pain Funnel L5 (cost) IS NEAT's Economic impact. Never lead with Budget BANT-style (it makes price the objection); replace it with Economic impact and budget answers itself. Promote to MEDDICC the moment there's more than one stakeholder or a pilot is on the table. NEAT->MEDDICC handoff (multi-thread, end of call 1): "this affects more than just you, your closers, finance owns CAC, ops owns the CRM. How does a decision like this normally get made here, and who else should be in the next conversation?"

THE SEQUENCE (hold in order, may not advance a phase until the prior is complete): Up-Front Contract -> (optional Challenger Teach) -> Pain Funnel + SPIN (label/mirror/pause between levels) -> "that's right" synthesis -> gap math live on their figures -> close a specific dated mutual next step + re-set a UFC for the next meeting. The most common violation: jumping from the Pain Funnel straight to features, skipping synthesis and gap math.`;

// ── Closing: micro-commitments, next steps, MAPs, legitimate urgency ──────────

export const CLOSING = `# CLOSING (the result of discovery + micro-commitments)

CORE: closing is the result of discovery plus a chain of micro-commitments, not a magic line at the end. If you need a "close," your earlier calls failed. The signed agreement is the final micro-commitment.

TRIAL CLOSES / TEMPERATURE CHECKS at every transition (after pain discovery, after a proof point, after handling an objection). Phrase as "curious" or "based on what you said," never a demand. After pain: "how big a problem is that for your team right now, 1 to 10?" After a proof point: "does this map to what your team actually deals with?" After an objection: "does that make sense, or does the concern still sit there?" Never proceed without a temperature check; a silent prospect is an unanswered objection.

SECURE A SPECIFIC NEXT STEP EVERY CALL: a named action, named owner, named date, both committed verbally. "I'll think about it" and "let's touch base next week" are NOT next steps. Use: "let's lock the specific next step so this doesn't fall through the cracks: my suggestion is [X concrete action] by [specific date/time]; does that work, or is there a better time?" If they hesitate: "what would need to happen on your side before that step makes sense?" (surfaces the real blocker now, not after a week of silence). If you cannot get one: "I'd rather not float in the calendar waiting for something that isn't moving; where do you actually see this going?"

MUTUAL ACTION PLAN (MAP): a shared table of action / owner / due-date from "interested" to "live"; use it for multiple stakeholders, a pilot/integration, a cycle over 2 weeks, or "we need due diligence." Introduce: "these move fastest when both sides know who's doing what by when; takes 2 minutes, just so neither of us is the bottleneck." Once they co-own and edit the MAP, you are executing a shared plan, not selling. The prospect who edits your MAP is buying.

LEGITIMATE URGENCY (use it; root it in their real cost of inaction or a genuine external timeline): cost-of-delay in their numbers ("~400 leads/mo, calling ~60% in the first hour; every week is another 100 aged out"); seasonality ("quarter ends in 6 weeks; a 2-week pilot needs to start by [date] to have data before your QBR"); a competitive window they named. MANUFACTURED PRESSURE is forbidden: fake deadlines, false scarcity, emotional pressure ("I thought you were serious"). It backfires (sophisticated buyers lose trust, higher churn, ghosting), and it's especially poison for an AI product where trust is already lower. If you cannot state the cost of delay in their own numbers, you have not done enough discovery; go back and do it.

MICRO-COMMITMENT LADDER (each advance must be explicit, not assumed): R1 Pain Confirmed (advance: schedules call 2 with another stakeholder) -> R2 Fit Qualified (advance: shares CRM + lead volume in writing) -> R3 Pilot Agreed (advance: both sign the MAP, IT contact introduced) -> R4 Pilot Live (advance: mid-pilot check-in scheduled) -> R5 Pilot Reviewed (ROI readout: speed-to-lead delta, contact rate, qualified meetings, cost-per-qualified-lead vs baseline) -> R6 Commercial Agreement (signature). If a call ends with no rung climbed, you had a conversation, not an advance.

LINES (verbatim): Direct ask (all objections resolved): "we've covered everything that needed addressing; is there a reason not to move forward today?" Summary close (after pilot): "you hit [metric] on [N leads]; your goal at the start was [Z]; we're there; what do we need to do to make this official?" The Flip ("let me think about it"): "help me understand what specifically you'd be thinking through: the numbers, the integration, internal alignment, or something else? I'd rather address it now." The Advance (full close premature): "I'm not asking for a yes today; if everything checks out, is there any reason this wouldn't move forward? If there is, I'd rather know now." MAP anchor (deal quiet): "we agreed [name] would have the pilot scope back by [date]; we're past that; what shifted on your end?"`;

// ── GenRiver: product and competitive canon (every specific is <CONFIRM>) ──────

export const HUSCRIBE_FACTS = `# GENRIVER PRODUCT AND COMPETITIVE CANON

DISCIPLINE: every GenRiver price, metric, proof point, and delivery timeline is a <CONFIRM> placeholder. NEVER cite an invented number; discovered later it destroys trust permanently. If you lack a real figure, state the assumption explicitly or mark it <CONFIRM>. Lead with the value prop that maps to the stated pain; never recite all five.

ONE-LINE: "GenRiver builds and operates AI-native outbound systems that combine buying-signal detection, Clay-powered enrichment, and hyper-personalised multi-channel sequences to book qualified B2B meetings — across the UK, US, and MENA — within 10 days of launch." (<CONFIRM> the marketing-approved positioning line.)

CORE VALUE PROPS:
- VP1 Signal-first targeting: monitor hiring surges, funding rounds, tech-stack changes, and expansion signals to reach buyers at the exact moment they have a problem to solve; not cold lists.
- VP2 Clay-powered enrichment and verification: decision-maker contact data enriched and verified globally before any outreach; no bounces, no wrong titles, no wasted sends.
- VP3 Hyper-personalised sequences: AI drafts every email, LinkedIn message, and WhatsApp opener from live signal data and the prospect's own words; copy that reads as written for them, not to them.
- VP4 Multi-channel orchestration: email, LinkedIn, and WhatsApp coordinated in a single sequence; the right channel at the right time, respecting cadence limits and channel-specific norms.
- VP5 Meetings in 10 days, fully managed: GenRiver owns the full stack (signals to booked meeting); the client reviews and approves messages but never manages the tooling; meetings land in the calendar.

DELIVERY MODEL (all <CONFIRM>): fully managed service; GenRiver operates Clay, Smartlead, Unipile, and the enrichment waterfall; client provides ICP, product context, and CRM access; GenRiver handles sequences, deliverability, suppression, and reporting. Monthly retainer model; pilot available. (<CONFIRM> exact engagement terms.)

PROOF POINTS (all <CONFIRM>): meetings booked per 100 contacts, reply rate vs industry benchmark, time-to-first-meeting, cost-per-qualified-meeting, pipeline attributed. Cite the customer TYPE and region, never name without permission ("a UK SaaS company targeting mid-market ops leaders saw..."). If you lack a data point, say so honestly and offer a pilot.

ICP (IDEAL CLIENT PROFILE): B2B companies with a defined sales motion and a human ACV above ~$10k. Sales-led or founder-led teams who want more qualified pipeline without hiring SDRs. Sectors: SaaS, professional services, staffing/recruitment, fintech, logistics, proptech. Geography: UK, US, MENA (UAE/KSA priority for MENA). Decision-maker has budget authority and feels the pipeline pain personally. Has a CRM and is willing to share signal data. NEGATIVE ICP (do not pitch): PLG-only products with no sales motion; e-commerce/B2C; companies with no defined ICP of their own; founder who wants leads but won't approve messages.

COMPETITION (categories only; <CONFIRM> specific vendor names, never invent brands): (A) In-house SDR team: high fixed cost ($4k to $8k+/SDR/mo), ramp time 3 to 6 months, turnover ~35%/year. Position: "GenRiver delivers a full outbound system in 10 days with zero headcount risk; your first hire can focus on closing, not cold prospecting." (B) Other outbound agencies: most send generic sequences from purchased lists. Position: "signal-first targeting means we reach buyers who have a live problem right now; reply rates 3x to 5x higher than list-blast approaches." (<CONFIRM> benchmarks.) (C) DIY Clay/tooling: powerful but requires a full-time operator and months to build. Position: "GenRiver is the operated version; you get the output without owning the stack." (D) Status quo / "our network handles it": pipeline from referrals plateaus; GenRiver opens net-new accounts that warm outreach never reaches.

GENRIVER OBJECTIONS:
- "We already tried outbound and it didn't work" -> acknowledge (most outbound is generic, bought lists, wrong timing) -> reframe (signal-first is structurally different: you reach a CFO the week they hired a Head of Sales, not a random Tuesday) -> de-risk (pilot on 200 contacts in the segment that most recently converted inbound; results in 3 to 4 weeks).
- "It's too expensive" -> rarely lack of money; value not yet justified. Anchor to the cost of the gap ("one enterprise deal pays for 6 months; what's your average ACV?"). Reframe as cost-per-qualified-meeting vs cost-per-SDR. Offer pilot-first to prove before committing.
- "We don't have time to manage this" -> validate the concern -> reframe: GenRiver is fully managed; the only time required is a weekly 30-minute review and message approval; the operator never touches the tooling.
- "Our product needs a warm intro, not cold outreach" -> validate (relationship-gated deals are real) -> scope the fit (GenRiver's signal-first sequences are read as warm because they arrive at the right moment with the right context; not a spray-and-pray cold blast) -> pilot on the signal that most closely maps to their warmest inbound trigger.
- "Compliance / GDPR / CAN-SPAM" -> take it seriously ("the right question, I'll give you a real answer") -> provide what you know (<CONFIRM> opt-out, suppression lists, data residency, GDPR lawful basis, UK ICO, UAE PDPL) -> offer the compliance overview and DPA -> do not close on compliance. NEVER say "don't worry about compliance."
- "We want to keep it in-house" -> validate the instinct -> reframe: most clients run GenRiver for 6 to 12 months while building internal capability; GenRiver documents everything so the client can own it later. Offer a knowledge-transfer provision. (<CONFIRM> exact terms.)`;

// ── grounding(): join the requested canon blocks for a system prompt ──────────

/**
 * The canon blocks, keyed for grounding(). Both the lowercase APEX knowledge
 * file stems (e.g. "frameworks", "huscribe") AND the uppercase exported const
 * names (e.g. "FRAMEWORKS", "HUSCRIBE_FACTS") resolve to the same block, so
 * callers can request blocks by either convention. Lookup is also normalised to
 * lowercase in grounding(), so casing never silently drops a block. Keep both
 * alias sets in sync if a new block is added.
 */
const CANON_BLOCKS: Record<string, string> = {
  // Lowercase stems (the APEX knowledge file names).
  frameworks: FRAMEWORKS,
  objections: OBJECTIONS,
  voss: VOSS,
  personalization: PERSONALIZATION,
  dubai: DUBAI_PLAYBOOK,
  discovery: DISCOVERY,
  closing: CLOSING,
  huscribe: HUSCRIBE_FACTS,
  // Uppercase const-name aliases (what the Close Room actions pass).
  FRAMEWORKS: FRAMEWORKS,
  OBJECTIONS: OBJECTIONS,
  VOSS: VOSS,
  PERSONALIZATION: PERSONALIZATION,
  DUBAI_PLAYBOOK: DUBAI_PLAYBOOK,
  DISCOVERY: DISCOVERY,
  CLOSING: CLOSING,
  HUSCRIBE_FACTS: HUSCRIBE_FACTS,
};

/**
 * Join the requested canon blocks into a single grounding payload for a system
 * prompt. Accepts either lowercase stems or uppercase const names; lookup is
 * case-insensitive and de-duplicated so a block is never injected twice even if
 * both casings are passed. Unknown keys are skipped silently. The wrapper
 * instruction mirrors APEX build_system(): answer ONLY from the methodology
 * below, never generic LLM advice, always tie coaching to a named framework.
 * This replaces RAG.
 */
export function grounding(keys: string[]): string {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const key of keys) {
    const block = CANON_BLOCKS[key] ?? CANON_BLOCKS[key.toLowerCase()];
    if (block && !seen.has(block)) {
      seen.add(block);
      blocks.push(block);
    }
  }
  if (blocks.length === 0) return "";
  return [
    "# GROUNDING CANON",
    "Answer ONLY from the methodology below. Never give generic LLM advice. Always tie coaching and copy to a named framework. Treat every GenRiver price, metric, and proof point as a <CONFIRM> placeholder; never invent specifics.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
