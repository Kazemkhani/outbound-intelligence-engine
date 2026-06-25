# Data Acquisition Strategy: How HumAI Gets the Prospect Data to Sell Huscribe

Operator-grade plan for acquiring the prospect data needed to sell Huscribe (voice-AI
inbound lead qualification) into UAE/MENA real estate. Operator: HumAI, Dubai
(gp@humai.ae). Pre-PMF: 2 free pilots, no paid logos yet, no data-acquisition tool wired in.

This is the companion to `docs/strategy/DATA-MOAT.md`. That document is about the
**product moat** (the master DB built by verify-by-conversation, a post-PMF asset). This
document is about the **near-term sales problem**: which firms to target now and how to
reach the human who decides. Keep the two separate. They are different jobs on different
clocks, and conflating them is the most expensive mistake available right now.

It is grounded in the existing engine: `packages/integrations` (the five adapter
contracts), the live `SearchApiAdapter` / `PlacesAdapter` / `ApolloAdapter` /
`ClayAdapter`, the NOVA findings layer (`packages/integrations/src/nova/findings.ts`,
where `mobile` is a canonical call finding), and the compliance enforcement points in
`docs/revenue-os/COMPLIANCE.md`.

This is operator guidance, not legal advice. Legal facts are from law-firm commentary on
the cited statutes. Confirm current figures against uaelegislation.gov.ae and get a short
written opinion from a UAE-licensed data/telecom lawyer (Al Tamimi, Clyde & Co, BSA)
before any at-scale outbound.

**Evidence rule (applies here and in `DATA-MOAT.md`):** every quantitative claim carries a
source and a "measures X, not Y" caveat. If a number cannot be sourced and scoped, it does
not appear. A document whose brand is strategic honesty cannot lean on false precision.

---

## 1. The thesis

The data is the easy part. In UAE real estate, prospect data is unusually public: the DLD
broker and brokerage registries enumerate an authoritative universe; Bayut and
Dubizzle publish agent mobile and WhatsApp by design; Dubai Pulse hands you the firm-level
license registry as open CSV; Google Maps gives the office line and website; LinkedIn names
the actual owner, GM, and head of sales. A precise 150 to 300 account list with named
decision-makers is a weekend job, not a moat, and not a reason to buy a global B2B seat
that covers this region worst.

The hard part is being answered. An unknown solo founder dialing a broker in a market that
is sold to all day converts near zero, and the legally compliant ways to reach those
numbers at scale (cold AI voice, WhatsApp blasts) require TDRA approval, a licence-registered
line, DNCR screening, and prior consent that a pre-PMF founder does not have. So the plan
is deliberately small, precise, warm, and compliant: hand-build the first list, lead with
trust (pilots, events, founder presence), and defer the verify-by-conversation engine and
the DLD adapter until paying logos justify them.

**Two data problems, kept separate:**

| | Problem 1: data to SELL Huscribe NOW | Problem 2: the moat at scale (post-PMF) |
| --- | --- | --- |
| Size | ~150 to 300 precise accounts + decision-maker contact | Tens of thousands of brokers/offices, verified |
| Method | Hand-built from public registries + light automation | NOVA verify-by-conversation writes verified facts |
| Owner | GTM hat (the founder selling) | Eng hat (the product), gated by COMPLIANCE.md |
| Timeline | This week to this quarter | Only after the engine earns the right (paying pilots) |
| Risk if rushed | Low | High: spends the wrong resource before PMF |

The rest of this document is almost entirely about Problem 1. Problem 2 is already
specified in `DATA-MOAT.md`; here it is the "Later" phase, and the only thing that changes
is when, not what.

---

## 2. The real-bottleneck verdict (honest call)

**The bottleneck right now is TRUST and DISTRIBUTION, not DATA. Plan accordingly.**

Two hypotheses were on the table. Both were pressure-tested against the sourced research,
and the verdict is not 50/50.

- **"UAE prospect data is unusually public" is TRUE for the account list and agent mobiles,
  FALSE for the decision-maker's mobile.** No single source hands you {target firm + named
  economic buyer + their personal mobile}. You assemble it from layers (Section 3). The one
  genuinely missing field is the decision-maker's mobile, and that is exactly the gap the
  product's verify-by-conversation moat closes later, not something to solve by mass
  scraping now.
- **"The real bottleneck is trust and distribution" is the decisive truth at this stage.**
  UAE B2B is relationship-first and wasta-driven; a clean list of 200 firms does not get a
  solo unknown answered. The constraint is permission-to-contact and credibility, not raw
  lead volume. The supporting evidence, scoped honestly:
  - Inbound/content leads close roughly 8x better than cold outbound (MarketingSherpa, often
    cited as ~14.6% vs ~1.7% close rate). Caveat: that benchmark is dated (circa 2009) and
    measures inbound SEO/content leads vs cold OUTBOUND, NOT "warm-led outbound vs cold." Use
    it as directional support for "warm beats cold," not as a UAE-real-estate measurement.
  - A green-tick (now blue-tick, see Section 4) verified WhatsApp business profile lifts
    opt-in and open rates in A/B tests (commonly reported ~30 to 50% uplift on opt-in), but
    primary sources are explicit that the badge buys trust, not conversions, and there is no
    reliable UAE-specific multiplier. It does not convert by itself.
  - A named pilot ("Pilot with [recognizable name]") outweighs a 10,000-row scraped list.
    This is a judgement call from how UAE B2B forms, not a measured statistic.

Why this matters for where the energy goes: buying a ZoomInfo or Cognism seat would pay
US/EU prices for the region those tools cover worst, to fix a constraint that is not
binding. Building the master DB now would spend the moat-budget before there is a customer
to justify it. The correct allocation is roughly 80% trust/distribution (references,
founder-led LinkedIn, events, warm intros) and 20% a cheap, hand-curated, compliant list.

The whole roadmap in Section 7 and the 14-day plan in Section 8 follow from this verdict:
do the minimum data work to be credible and precise, and spend the rest on getting answered.
The plan is judged on conversations started, not artifacts built.
Sources: blog.hubspot.com/insiders/11-facts-about-inbound-marketing,
faq.whatsapp.com/794517045178057, gallabox.com/blog/whatsapp-green-tick.

---

## 3. The UAE public-source cascade

Build the list as a layered cascade, each layer answering a different question. None of it
requires a global data seat. Run it manually or lightly automated for the first list, and
only as deep as needed to feed this week's outreach.

**Layer 1: Portals = the segment and the agent-level mobile (capturable, but agents not
buyers).**
Bayut broker/agent profiles publish mobile, WhatsApp, RERA license, and portfolio; Dubizzle
listings show agent name, agency, WhatsApp, and direct contact URL to any visitor. These are
self-published by the agent (PDPL "made public by the data subject"). Caution: Property
Finder hides the number behind a click-to-reveal and does NOT put it in the public payload,
so do not build on it. These numbers are front-line agents, not the firm's economic buyer,
and they are personal data, so this is a manual look-up layer for hand-picked targets, never
an automated harvest (Section 4, scraping caution).
Sources: bayut.com/brokers/dubai, dubai.dubizzle.com/property-agents.

**Layer 2: DLD / RERA = the authoritative universe and the firmographic spine.**
The DLD "Licensed Real Estate Brokers" e-service (and the Dubai REST app) lets you search by
broker name, BRN, office ORN, area, and mobile, and confirm a firm/agent is real and active.
The companion "Licensed real estate brokerage companies" e-service and the Dubai Brokers
portal (trakheesi.dubailand.gov.ae/dubaibrokers) carry office-level records. DLD's end-2025
figures are approximately 32,294 registered brokers and 9,785 registered brokerage offices
(dubailand.gov.ae news). Treat the live registry, not the headline, as canonical, because
counts move quarterly. The larger true number does not weaken the "enumerable universe"
thesis, it sharpens it: the universe is finite and queryable, but you must segment hard
(by activity, size, developer vs brokerage, inbound volume) to reach a workable 150 to 300.
Older snapshots citing 5,933 brokers / 2,285 offices are stale; do not use them.
This source is access-gated (Dubai REST login), so it is a manual verification and seed
source, not a bulk download.
Source: dubailand.gov.ae/en/eservices/licensed-real-estate-brokers/.

**Layer 2b: Dubai Pulse = open-data firmographics for segmenting at speed.**
Dubai Pulse hosts `dld_real_estate_licenses-open` and `dld_transactions-open` as
regularly-updated CSV downloads plus a token-based REST API (first access issues an API key
and secret). The licenses dataset is the spine of the target-account universe (which firms
exist, license status, developer vs brokerage); transaction volume is an intent signal. It is
firmographic: it does not reliably hand you an owner name plus a mobile.
Source: dubaipulse.gov.ae/data/dld-licenses/dld_real_estate_licenses-open.

**Layer 3: Google Maps / Places = the office switchboard and website (cheap, official).**
The Places API returns business name, address, phone, website, ratings; at 150 to 300
accounts you sit inside or barely above the free monthly cap, so cost is near zero. Use the
official API (ToS-clean) to confirm the firm, grab the reception line and the site URL (from
which a "Sales" or founder contact sometimes surfaces). Honest limit: it gives the company
main number, not a decision-maker's mobile. This is a discovery and triangulation layer.
Source: developers.google.com/maps/documentation/places/web-service/overview.

**Layer 4: LinkedIn = the one place that NAMES the decision-maker (no mobile, no scraping).**
LinkedIn confirms titles and seniority, solving the decision-maker-identification problem
that portals and DLD do not. It never gives a mobile, and scraping it (especially Sales
Navigator) breaches the User Agreement with real account-ban risk (LinkedIn removed Apollo's
and Seamless.ai's Company Pages in a 2025 crackdown). Use the UI manually to attach a named
owner / GM / head of sales per firm.
Source: linkedin.com/legal/user-agreement.

**Layer 5: Verify = make the number live, and let the conversation confirm the human.**
Phone Lookup (Twilio Line Type Intelligence or an HLR provider; confirm UAE carrier coverage
with the vendor first) is deliverability hygiene only: it proves a number is live, mobile,
and on a carrier, not who owns it. The industry is blunt: "you can't verify the identity of
the phone number owner; you can only validate the number itself." The actual identity check
is the conversation, which is precisely the verify-by-conversation moat (Section 7, Later),
not a pre-call data guarantee.
Source: twilio.com/docs/lookup/v2-api/line-type-intelligence.

### The mobile-number unlock

The decision-maker's mobile is the one field no public source gives you cleanly. Do NOT try
to solve it by scraping at scale. Solve it the warm way, in this order of preference:

1. **The number they published themselves.** If the decision-maker is also a listing agent
   (common in small/mid brokerages), their mobile is on their own Bayut/Dubizzle listing or
   company site. Collect it manually, record the source URL as provenance, and rely on the
   PDPL "made public by the data subject" basis (Section 4).
2. **The warm exchange.** Cityscape and broker/PropTech events, warm intros from the two
   pilots, and founder-led LinkedIn produce a consent-bearing WhatsApp exchange in person or
   in-DM. This is the highest-trust, lowest-legal-risk mobile, and it is how UAE deals form.
3. **Inbound-triggered opt-in.** Drive prospects to a "WhatsApp us" CTA from LinkedIn,
   referrals, or events. The prospect messaging you first creates the opt-in and the 24-hour
   service window, and lets NOVA qualify them, which is a live demo of the product you sell.
4. **Verify-by-conversation at scale (Later).** Post-PMF, NOVA confirms a dialable E.164
   mobile on consented calls and writes it to the master DB. That is the moat, not a tactic
   for the first list.

Net: the cascade gives you {firm + named decision-maker + office line + segment + intent} by
hand. The decision-maker's mobile comes warm, opted-in, or self-published, never from a
bulk scrape.

---

## 4. Legality posture (in plain terms)

Two regimes bind every step. The data is collectible; the cheap automated outreach channel
is the part that is constrained. This is operator guidance, confirm with counsel.

**PDPL (Federal Decree-Law 45/2021): business contact is still personal data, and there is
NO clean B2B carve-out.** A named agent's mobile and work email are personal data even used
in a business context, and the UAE deliberately did NOT adopt GDPR-style "legitimate
interest" as a standalone lawful basis. Consent is the default. The one realistic non-consent
hook is the Article 4 / Article 5 exception for **data the data subject made public
themselves** (an agent publishing their own mobile on a listing is the strongest fit; a
portal or third party publishing it is weaker). Even when it applies, it covers *contacting
that person about their business*, not bulk-storing, reselling, or enriching at scale, and
the other duties survive: fair and transparent processing, purpose limitation, data
minimisation, and the rights to object, restrict, and erase. So: small, person-published,
provenance-logged mobiles are defensible; mass harvesting is not.

**TDRA telemarketing rules (Cabinet Resolution 56 and 57 of 2024, in force 27 Aug 2024):
this governs HOW you contact, and it is enforced.** "Consumer" is defined as a natural
person and "company" as any licensed entity, so marketing calls/SMS/social-app messages
(WhatsApp is explicitly in scope) to an agent's personal mobile are regulated telemarketing
with no clean B2B exemption. Hard requirements: prior TDRA approval; calls only from a local
number registered under the company's commercial licence (not a personal SIM); DNCR
screening; 09:00 to 18:00 only; frequency caps (roughly once/day, twice/week if unanswered);
no same-day re-call after a refusal; opt-out honoured. Fines escalate (individuals
AED 5,000 to 50,000; companies AED 75,000 to 150,000 for operating without approval;
DNCR violations AED 50,000 / 75,000 / 150,000), plus number disconnection. TDRA has already
fined 2,000+ violators and Dubai fined 159 companies in early 2025. **One wrong AI-voice
campaign to UAE mobiles can exceed this pre-revenue company's runway.**

**Two clocks, kept separate (this matters for sequencing):** TDRA approval is required before
ANY automated or at-scale channel (cold AI voice, WhatsApp campaigns), and it is real
multi-week work involving the licensed entity, a registered number, training, and DNCR
integration. It is NOT required before warm 1:1 outreach. A human-paced 1:1 message to a
registered firm's published BUSINESS line about a relevant business tool, sent through the
licensed HumAI entity, can proceed while TDRA approval is still pending. So compliance never
blocks the first conversations: warm intros, event handshakes, and referral-named WhatsApp
run in parallel on a different clock from the regulatory-approval track.

**The favourable nuance, used carefully:** because the protected party is a natural-person
consumer, a human-paced 1:1 message to a registered firm's published BUSINESS line about a
relevant business tool is on materially safer ground than blasting personal mobiles. The
hard constraint stays: do it through the licensed HumAI entity, from a registered number,
human volumes, opt-out and audit trail, never a personal SIM.

**WhatsApp Business is not a cold channel, and the verified badge is gated.** Meta requires
provable prior opt-in; cold blasts get quality-rated down or banned on report. So WhatsApp is
an INBOUND channel: warm/event/referral/LinkedIn drives the prospect to message you first,
which creates opt-in and aligns with Huscribe being an inbound product. On the verified badge:
a standard verified Business profile (verified display name, logo, business description,
catalogue) is solo-doable via the Cloud API or a BSP and carries most of the trust. The
notable-business badge (formerly the green tick, now migrating to a blue tick under Meta
Verified) is a different thing: it requires Meta "notability" (sourced guidance: roughly 5+
articles in major publications over 24 months), only ~5% of API accounts get it, review takes
2 to 8 weeks, and the most common rejection reason is insufficient notability. A pre-revenue
solo founder with no press will almost certainly be rejected. Treat the badge as aspirational
(apply, expect rejection until you have press), NOT as a 14-day deliverable, and never let it
gate the first conversations.
Sources: whatsappbusiness.com/policy, faq.whatsapp.com/794517045178057,
getkanal.com/blog/whatsapp-business-verification-green-tick, setsmart.io/blog/whatsapp-green-tick.

**Scraping caution (ToS + cybercrime, not just privacy).** Bayut's Terms forbid bots,
crawlers, and compiling a database from the platform, and state they will report breaches;
LinkedIn's User Agreement bars copying data directly or via aggregators (the hiQ ruling said
public scraping is not a CFAA crime, but confirmed it still breached the User Agreement).
Separately, UAE Cybercrime Law 34/2021 penalises collecting personal data via IT systems
without a licence (AED 50k to 500k) and the onshore system has no binding precedent telling
you how aggressively it would be applied. So automated harvesting across portals/LinkedIn is
a contract breach and a legally untested cybercrime gray zone, not worth it for a 150 to 300
account list. The defensible lane is a human (or VA) manually viewing public listings and
copying self-published mobiles for a curated list, with the source URL logged per contact.

**The one-page hygiene the list must carry:** a written legitimate-interest / public-data
assessment, a logged source URL per contact, an accessible privacy note (ideally with Arabic
access), a working opt-out, and a rule never to resell the list. This keeps Problem 1 inside
the defensible lane and is the same provenance discipline the master DB needs later
(`DATA-MOAT.md` Section 3), so it is not throwaway work.

---

## 5. Build vs buy (kept to Problem 1)

**Verdict: BUILD the small list by hand from public sources. Do NOT buy a global B2B seat.
Do NOT build any data tooling until paid volume justifies it.**

For the first list, the right tool is a spreadsheet with a source-URL column per contact,
fed by the cascade in Section 3: DLD/RERA + Dubai Pulse for the universe and segment, Google
Places via the live `SearchApiAdapter` (and `PlacesAdapter` once GCP billing is done) for the
firm + office line + website, LinkedIn UI for the named decision-maker, and manual listing
look-up for self-published mobiles. This is ToS-clean, PDPL-defensible, free or near-free at
this volume, and it beats any seat for the brokerage long tail the globals miss.

**Do NOT buy a ZoomInfo (or Cognism) seat.** MENA is documented as among the worst data
coverage of any region in sales intelligence; Apollo/ZoomInfo/PDL/Lusha all degrade sharply
outside US/Western Europe and their "phone numbers" skew to switchboards and stale
direct-dials, not verified WhatsApp mobiles. ZoomInfo runs roughly $14k+ and charges extra
for international via a Global Data Passport. You would pay premium prices for the region
these tools cover worst, to solve a non-binding constraint.

**Do NOT build adapters, an enrichment waterfall, a DLD provider, a provenance DTO, or buy
Clay yet.** None of that detail is needed to land the first 5 customers, and writing it now
risks anchoring the founder on building tooling instead of selling. The contract-fit details
and the Clay/DLD/DTO/waterfall specifics live in `DATA-MOAT.md` and in the "Next" and "Later"
phases of Section 7. Keep this document ruthlessly about Problem 1: a hand-built list and a
warm way in. The eventual semi-automation will land behind the five stable interfaces in
`packages/integrations/src/contracts` when, and only when, post-paid volume justifies it.

---

## 6. Phased roadmap

### Now: hand-build ~150 to 300 precise targets + the path to a mobile (this week to ~3 weeks)

Goal: a credible, compliant, precise list and a warm way in, so the two pilots can become
paid logos. This is GTM-hat work, not engineering. List-building runs only as deep as needed
to feed that week's outreach (a Dream-20, not a 300-row longlist polished in isolation).

- Run the cascade by hand: DLD/RERA + Dubai Pulse to enumerate and segment to ~150 to 300
  firms that fit Huscribe (mid-to-large brokerages with high inbound volume, plus developers
  running portal lead-gen, since Huscribe is INBOUND qualification). Narrow to a
  "Dream 20 to 40" where the founder/principal answers WhatsApp personally.
- Layer Google Places (via `SearchApiAdapter` today, `PlacesAdapter` once GCP billing is
  done) + LinkedIn UI to name the decision-maker per firm and grab the office line + site.
- Get the decision-maker's mobile only warm, opted-in, or self-published (Section 3 unlock),
  logging the source URL per contact.
- Stand up a standard verified WhatsApp Business profile (display name, logo, description,
  catalogue) via the Cloud API or a BSP, plus a "WhatsApp us" inbound CTA. The notable-business
  badge is a separate, aspirational track, not a gate.
- Weaponize the two pilots into named references + a 1-metric case study (speed-to-lead,
  % leads qualified, after-hours capture). Start 2 to 3x/week founder-led LinkedIn content.
- Book Cityscape and 1 to 2 PropTech/broker communities; pre-book Dream-20 meetings.

**Parallel, non-blocking compliance track (does NOT gate the above):** register the HumAI
business line and start the TDRA telemarketing approval process. This is required before ANY
automated or at-scale channel, NOT before warm 1:1 outreach. Warm intros and 1:1 messages to a
published business line through the licensed entity proceed while approval is pending.

### Next: semi-automate the cascade behind the adapter contracts (~weeks 3 to 8, post first-paid)

Goal: turn the manual cascade into repeatable, owned tooling, without changing the safety
posture or the contracts. The adapter-contract fit, enrichment-waterfall placement, Clay
tier, and provenance DTO specifics are documented in `DATA-MOAT.md`; build them here only
once post-paid volume justifies the work.

- Wire discovery + firmographics through the live `EnrichmentProvider` adapters
  (SearchApi/Places; Dubai Pulse CSV ingest as a seed importer).
- Add an enrichment waterfall in `@oie/orchestration` (not in any adapter) for the named
  contact + email; mobile stays `null` when unknown, never fabricated.
- Adopt Clay as the pay-per-match assembly layer once volume justifies it, per `DATA-MOAT.md`.
- Keep the one-page compliance hygiene as a per-contact field (source URL, basis, opt-out),
  so provenance is built in, not retrofitted.

### Later: the verify-by-conversation moat at scale + the DLD adapter (post-PMF)

Goal: build Problem 2, the asset competitors cannot buy. This is fully specified in
`DATA-MOAT.md`; only the timing is set here: not before paying pilots and a clean audit
trail justify it.

- Build the DLD source so the authoritative registry flows through the owned firmographic
  spine (`DATA-MOAT.md` has the adapter and DTO detail).
- Turn on verify-by-conversation: consented NOVA calls write a dialable E.164 mobile to
  `Contact`, spoken tools to `Company.techStack`, opt-outs to durable suppression
  (`ingestCallResult`). The calls that build the DB are the product.
- Gate strictly on `docs/revenue-os/COMPLIANCE.md`: TDRA approval, licence-registered
  caller-ID, DNCR fail-closed, calling-window + frequency ledger, recording + AI-caller
  disclosure, cross-border transfer basis, owner sign-off. Until all are true, DEMO_MODE and
  DRY_RUN stay on.

---

## 7. Next 14 days (conversation-first action checklist)

Single operator (gp@humai.ae); "owner" = the hat worn. The verdict in Section 2 is the
constraint is being answered, so this plan starts conversations on Day 1 and runs list-building
in PARALLEL, only as deep as each touch needs. **Success metric: >=5 real conversations and
>=2 booked meetings by Day 14.** The plan is judged on conversations, not artifacts.

**Day 1 (highest-yield first: open the warm graph):**
- [ ] Ask both pilots and every advisor for 2 warm intros each to Dream-20 accounts.
- [ ] DM 10 reachable principals (self-published mobile or LinkedIn) with a specific MENA
      real-estate POV, human-paced, inside 09:00 to 18:00, opt-out respected. No blasts.
- [ ] Start a Dream-20 (not a 300-row longlist): the 20 accounts where the principal answers
      WhatsApp personally, just enough rows to feed this week's outreach.

**Days 1 to 3 (in parallel, the trust asset the first touch needs):**
- [ ] Turn the two pilots into named, on-the-record references + one 1-metric case study
      (speed-to-lead / % qualified / after-hours capture). This is needed for the FIRST touch.
- [ ] Stand up the one-page provenance sheet: per-contact source URL, basis (public/warm),
      opt-out, no-resell rule. Draft an Arabic-accessible privacy note.
- [ ] Optimise the LinkedIn profile headline to a human, specific solution line.

**Days 4 to 7 (deepen the list only as far as outreach needs, keep DMing):**
- [ ] Extend the Dream-20 toward ~150 to 300 firms only as outreach consumes it: Dubai Pulse
      `dld_real_estate_licenses-open` CSV (request the API key/secret), ICP filter, sample-
      verify against the DLD "Licensed Real Estate Brokers" e-service / Dubai REST app.
- [ ] Run Google Places (via `SearchApiAdapter`) over the named targets for firm + office
      line + website; use LinkedIn UI to name the owner / GM / head of sales per firm.
- [ ] Stand up a standard verified WhatsApp Business profile (display name, logo, description,
      catalogue) and a "WhatsApp us" inbound CTA. Do NOT wait on the notable-business badge.
- [ ] Publish 2 founder-led LinkedIn posts with a specific MENA real-estate POV.
- [ ] Send the next wave of warm 1:1 touches (warm intro > event handshake > referral-named
      WhatsApp > LinkedIn) to the intros and DMs that have warmed.

**Days 8 to 14 (get in the room, keep the conversations moving):**
- [ ] Register for Cityscape and 1 to 2 PropTech/broker communities; pre-book Dream-20
      meetings around the event.
- [ ] Follow up every Day-1 intro and DM; convert warm replies into booked meetings; aim to
      clear the >=5 conversations / >=2 meetings metric.
- [ ] Book a short written opinion with a UAE data/telecom lawyer (Al Tamimi / Clyde & Co /
      BSA) on the exact B2B scope of 56/2024 before any automation.

**Parallel, non-blocking track (own clock, does NOT gate any conversation above):**
- [ ] Register the HumAI business line and start the TDRA telemarketing approval process.
      Required before ANY automated/at-scale channel, NOT before warm 1:1 outreach. Let it run
      in the background; never treat it as a blocker to talking to buyers.
- [ ] Optionally apply for the WhatsApp notable-business badge, expecting rejection until you
      have press. Aspirational, not a 14-day deliverable.

**Explicitly NOT in the next 14 days:** buying a ZoomInfo/Cognism/Apollo seat; building a
portal scraper; building adapters, the enrichment waterfall, the DLD adapter, or the master
DB; flipping DEMO_MODE or DRY_RUN; any automated cold dial or WhatsApp blast; treating TDRA
approval or the notable-business badge as a gate to the first conversations.

---

## 8. What does NOT work (honest risks)

- Relying on Property Finder for mobiles: not in the public payload.
- Mass-scraping Bayut/Dubizzle agent mobiles: ToS breach + PDPL personal-data exposure +
  cybercrime gray zone, and they are agents, not buyers.
- LinkedIn / Sales Navigator scraping: User-Agreement breach, ban risk, and still no phone.
- Buying "Cityscape attendee" contact lists from third-party vendors: unverified, PDPL-risky,
  low-trust. The value is the in-person warm intro and the published exhibitor roster.
- Any marketing call or WhatsApp from a personal number: explicitly prohibited, escalating
  fines plus disconnection.
- Buying a global B2B seat to fix a non-binding constraint in the region those tools cover
  worst.
- Front-loading 11 days of list-building before talking to a buyer: the warm graph, not a
  300-row list, is the gate to the first 5 conversations.
- Treating the WhatsApp notable-business badge or TDRA approval as a checkbox that completes
  in the window: one is gated by Meta's editorial judgement, the other is a multi-week
  regulatory project. Neither gates warm 1:1 outreach.

The winning posture is small, precise, warm, and compliant: a hand-built 150 to 300 account
list from authoritative public registries, a registered business channel with a standard
verified WhatsApp Business profile, TDRA approval running on its own non-blocking clock, and
trust earned through pilots, events, and founder presence. Data is the means; trust and
distribution are the bottleneck; the moat comes later.
