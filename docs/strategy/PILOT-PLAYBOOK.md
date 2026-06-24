# 14-Day Pilot Operating Playbook

Objective: run a 2-week, demo-mode pilot that produces the buyer's own before/after speed-to-lead number
on their real inbound, then convert it to a paid Activate plan. This is the day-by-day execution layer
that sequences the strategy into actions. It assumes DRY_RUN stays true and NOVA stays in DEMO_MODE for
the whole pilot: the pilot proves value without a single live PSTN dial.

Related: [PRICING.md](PRICING.md) (the offer + conversion), [SPEED-TO-LEAD-PROOF.md](SPEED-TO-LEAD-PROOF.md)
(the stats that frame the gap), [GTM.md](../revenue-os/GTM.md), [VOICE-ACTIVATION.md](VOICE-ACTIVATION.md)
(compliance gates before any live calling), [RUNBOOK.md](../revenue-os/RUNBOOK.md) (the operator playbook).

## Day 0: qualify and set up

- Confirm the prospect fits the ICP (UAE real-estate developer, portal advertiser, or brokerage with real
  inbound volume). If they have no inbound lead flow, there is no gap to close: disqualify kindly.
- Capture the four ROI inputs on their own numbers (these feed `computeRoiMath` in the Close Room):
  leadsPerMonth, pctUnanswered (or after-hours share), avgCommissionAed, closeRatePct. If any is unknown,
  mark it `<CONFIRM>` and agree to measure it during the pilot.
- State the pilot's list price and that it is credited on conversion (see PRICING). Anchor value from day 0.
- Set up the workspace: seed their ICP, load a starter lead list, confirm operator login. Nothing dials.

## Week 1 (days 1-7): instrument and run the proof

- Day 1: run discovery using the SPIN sequence from the Close Room prep tool. Most weight on Implication
  and Need-payoff. Goal: the prospect says their current response time out loud (it is almost always hours).
- Day 2-3: place demo-mode NOVA calls against the starter list. The agent joins a LiveKit room, no PSTN
  dial. Each call persists a `CallSession` + `CallFinding` and enriches the master DB only for consented
  facts. This is the verify-by-conversation moat in action (see DATA-MOAT).
- Day 4-5: instrument the headline metric on `CallSession`: lead-arrival-to-first-ring. Contrast it with
  their current first-response time. The canonical framing is 917 minutes vs under 60 seconds.
- Day 6-7: review captured findings in the Voice screen. Confirm the after-hours pattern in their data
  (the share of inbound landing outside 9-6). Draft the mid-pilot readout in the Close Room.

## Week 2 (days 8-14): readout, refine, convert

- Day 8: mid-pilot readout call. Show the before/after number on their own leads. Use the Close Room ROI
  tool: recoveredLeads = leadsPerMonth x pctUnanswered; recoveredDeals = recoveredLeads x closeRate;
  recoveredAed = recoveredDeals x avg commission. The buyer can reproduce every step.
- Day 9-11: tighten the agent script to their objections (use the Voice Dojo to rehearse the human side of
  the sale). Capture any new master-DB facts. Keep DEMO_MODE on.
- Day 12: build the results one-pager in the Close Room (deterministic math + Gap Selling narrative). No
  invented Huscribe figures: anything not measured stays `<CONFIRM>`.
- Day 13: send the results pack. Use the CopyButton to drop the one-pager into WhatsApp or email.
- Day 14: the conversion conversation (below).

## The conversion conversation

Frame with Gap Selling (their lost-commission gap), JOLT risk-reversal (the 2-week proof was the risk
reversal), and SPIN Need-payoff. Sequence:

1. Replay the gap in their numbers: "Here is what slow first-contact cost you last month."
2. Show the recovered AED per month and per year from the ROI tool.
3. Quote the Activate tier from PRICING, with the pilot fee credited. Hold the anchor; concede on term or
   onboarding speed, not the headline rate.
4. Close to a single next step: start Activate, or a named reason not to. Honor any opt-out immediately.

## Success metrics and go/no-go gates

| Gate | Target | If missed |
| --- | --- | --- |
| Day 0 setup complete | ROI inputs captured (or `<CONFIRM>` agreed) | Reschedule, do not start blind |
| Week 1 proof | A real before/after first-response number on their leads | Extend instrumentation a few days |
| Day 8 readout | Buyer agrees the gap is real and material | Revisit ICP fit; this may not be a buyer |
| Day 14 conversion | Activate signed or a clear, named objection | Book a follow-up with the specific gap |

Track pilot-to-paid conversion rate and time-to-first-paid across pilots (`<CONFIRM>` the targets).

## Guardrails

- DRY_RUN stays true and NOVA stays in DEMO_MODE for the entire pilot. No live PSTN dialing without the
  full sign-off in VOICE-ACTIVATION (consent, calling window, DNCR, recording disclosure, TDRA approval).
- Never present an industry stat as a Huscribe result. The wedge is the mechanism plus the buyer's own
  measured number. Any Huscribe price or proof point not yet measured is a `<CONFIRM>` placeholder.
- Enrich the master DB only for consented facts captured on the call. No fabricated PII or findings.
