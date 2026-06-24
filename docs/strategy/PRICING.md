# Pricing and Packaging: Huscribe Revenue OS

Objective: price Huscribe as a high-ticket, end-to-end revenue system, not as a voice tool sold by the
minute. This plan turns the 2025-2026 market bands into a recommended packaging the operator can quote
with confidence. It exists because the current price is set well below the value delivered and below the
band buyers already pay for far less. Numbers here are recommended anchors grounded in sourced market
bands; figures tied to HumAI's own cost basis are marked `<CONFIRM>` and must be set before quoting.

Related: [GTM.md](../revenue-os/GTM.md), [DATA-MOAT.md](DATA-MOAT.md), [VOICE-ACTIVATION.md](VOICE-ACTIVATION.md).

## 1. What the market already pays (2025-2026, sourced)

| Category | Typical price | Note |
| --- | --- | --- |
| Enterprise AI SDR (11x, Qualified) | ~$40k-$68k/year, custom, sales-led | Pricing not public; infra/CRM costs on top. Category stretched to $100k-$147k/yr on large multi-region deals. |
| Per-seat AI SDR (Regie) | $180-$499/user/mo, 10-seat min (floor ~$1,800/mo) + data packages ($750-$8,140/mo) | A realistic deployment runs ~$3,450/mo, scaling to $13,000+/mo. The "per-agent tax" compounds fast. |
| Multichannel AI SDR (Artisan/Ava) | ~$2,000-$7,200/mo, annual, custom | Contact-sales pricing. |
| Clay-agency / managed outbound retainer | $3,000-$15,000/mo | ColdIQ ~$5,000/mo on a 3-month initial commit. Email/LinkedIn outbound only, no voice, no compliance gate. |
| AI voice tooling (Vapi/Retell/Bland/Synthflow) | $0.05-$0.35/min all-in + ~$299-$499/mo platform | This is raw plumbing. It is Huscribe's COGS line, not its price. |

Sources in section 7.

## 2. Positioning: what to anchor against

- ANCHOR against the claygency retainer ($3k-$15k/mo) and the per-seat AI-SDR tax. Huscribe does in
  software what a claygency assembles with human labor, and adds a compliant voice qualification motion
  the email-only agencies and the raw voice tools do not bundle.
- DO NOT anchor against voice minutes. Per-minute pricing frames Huscribe as a commodity dialer and
  caps the deal at the cost of plumbing. Minutes are a transparent pass-through COGS line, never the price.
- The wedge is the governed, end-to-end outcome: discover, enrich, voice-qualify, score deterministically,
  human-gated close, and a compliant PDPL/TDRA posture, all in one control plane with no per-agent tax.
- The compounding asset is the master DB (verify-by-conversation). See [DATA-MOAT.md](DATA-MOAT.md). Price
  reflects that each engagement makes the buyer's own data more valuable over time.

## 3. Recommended packaging

Three tiers plus a paid pilot. Prices are recommended anchors positioned at the credible high end of the
claygency band because Huscribe is end-to-end and adds voice + compliance. Convert to AED at quote time.
Set the floor from HumAI's COGS and target margin (`<CONFIRM>`); never quote below the margin floor.

| Tier | Who | What is included | Recommended anchor (illustrative) |
| --- | --- | --- | --- |
| Pilot (2 weeks) | New logo proving value | Demo-mode voice qualification on their real inbound, before/after speed-to-lead on their numbers, 1 scored lead list | $1,500-$3,000 one-time, credited to the first month on conversion |
| Activate | Single brokerage / team | Discovery + enrichment waterfall, voice qualification, deterministic scoring, approvals, Close Room, 1 seat-free workspace | $3,500-$6,000/mo |
| Scale | Multi-team brokerage / portal advertiser | Activate + higher volume, multi-user, analytics, priority support, quarterly data-moat review | $7,000-$12,000/mo |
| Enterprise / Developer | Off-plan developer, portal | Scale + launch-spike capacity, custom integrations, dedicated success, SLA | Custom, anchored $12,000+/mo |

Rules baked into the packaging:

- No per-agent tax. One flat workspace price; adding users does not multiply the bill. This is an explicit
  contrast to the per-seat AI-SDR model and a headline selling point.
- Voice minutes are billed as transparent pass-through at cost + a small handling margin, shown as a
  separate line. Buyers trust transparency here; it also protects margin as usage scales.
- Annual commitment earns 1.5-2 months free, not a discount on the headline rate (protect the anchor).

## 4. Pilot to paid conversion (the two free pilots)

The current two pilots are free. Convert them and use them as the proof engine, do not give the product
away indefinitely.

1. Frame the pilot as a paid 2-week proof even when the fee is waived: state the list price and that it is
   credited, so value is anchored from day one.
2. Instrument one before/after metric on their own numbers: lead-arrival-to-first-contact (917 minutes vs
   under 60 seconds is the canonical gap). Capture it on `CallSession`. This is the conversion lever.
3. End the pilot with a single decision: move to Activate at the quoted rate, with the pilot fee credited.
   Use JOLT risk-reversal (the 2-week proof is the risk reversal) and Gap Selling (their lost-commission
   gap), per the sales canon.
4. Target a pilot-to-paid conversion rate and a time-to-first-paid; track both. `<CONFIRM>` the targets.

## 5. Pricing guardrails

- Lead with the gap (lost commission from slow or never first-contact), then price. Never open on price.
- If a buyer opens on price, reframe to their economics before quoting (commission per deal x deals lost
  to slow first-contact). See the Outreach and ROI tooling in the Close Room.
- Hold the anchor. Concede on term length, scope, or onboarding speed before the headline rate.
- Keep DRY_RUN and NOVA demo mode until live calling is signed off; the pilot proves value without live
  dialing. See [VOICE-ACTIVATION.md](VOICE-ACTIVATION.md).

## 6. What to confirm before quoting (`<CONFIRM>`)

- HumAI's fully-loaded COGS per engagement (voice minutes, enrichment API spend, model spend) and target
  gross margin, to set the price floor.
- AED conversion of the anchors above and any VAT treatment.
- Pilot-to-paid conversion and time-to-first-paid targets.
- Whether to offer a setup fee on Activate/Scale or fold onboarding into month one.

## 7. Sources

- AI SDR pricing: [MarketBetter](https://www.marketbetter.ai/blog/best-ai-sdr-tools/),
  [Prospect AI](https://prospectai.co/resources/blog/ai-sdr-pricing-comparison-2026),
  [Instantly](https://instantly.ai/blog/ai-sdr-pricing-cost-analysis/),
  [Landbase (Artisan)](https://www.landbase.com/blog/artisan-ai-pricing).
- Clay-agency / managed outbound retainers: [GTM Engineering](https://blog.gtm-engineering.io/blog/best-clay-automation-agencies),
  [Salesforge (ColdIQ)](https://www.salesforge.ai/blog/coldiq-review-2026-ai-powered-outbound-lead-generation),
  [Clay pricing](https://www.clay.com/pricing).
- AI voice per-minute economics: [Retell](https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis),
  [Zeeg](https://zeeg.me/en/blog/post/ai-voice-agent-pricing-guide),
  [Klariqo](https://klariqo.com/blog/voice-ai-cost-per-minute/).

All figures are third-party estimates or list prices as of 2025-2026 and should be re-checked before they
anchor a live quote. Treat them as directional bands, not guarantees.
