# Speed-to-Lead Proof Pack

Objective: a tight, sourced set of external proof points for the speed-to-lead gap, so the operator can
cite credible third-party numbers in discovery and the pitch, and so the Close Room ROI narrative rests
on verifiable data. These are industry statistics, not Huscribe claims. Any Huscribe-specific metric
stays a `<CONFIRM>` placeholder until measured on a real pilot.

Related: [GTM.md](../revenue-os/GTM.md), [PRICING.md](PRICING.md),
[VOICE-NOVA.md](../revenue-os/VOICE-NOVA.md). The ROI math the buyer can reproduce lives in the Close
Room (`computeRoiMath`); these stats frame the gap, the math quantifies it on their numbers.

## The numbers (2025-2026, sourced)

| Claim | Stat | Source |
| --- | --- | --- |
| Real-estate agents are slow | Average first response to a new lead is ~917 minutes (over 15 hours) | Inman 2025 survey, via AgentZap |
| Most inquiries arrive off-hours | ~62% of real-estate inquiries are submitted outside 9-5, Mon-Fri (peaks evenings 6-9pm and weekends) | AgentZap |
| First responder wins | ~78% of homebuyers work with the first agent who responds | AgentZap |
| The 5-minute rule | Responding within 5 minutes makes a lead ~21x more likely to qualify than at 30 minutes | Kixie / Casey Response |
| Rapid decay | Each minute of delay in the first 5 minutes drops qualification ~10%; after an hour, odds fall ~90% | Casey Response |
| Industry is slow everywhere | Average lead response time across industries is ~47 hours; real estate ~5.7 hours | GreetNow |
| Almost everyone is too slow | ~88% of leads are answered in more than 5 minutes; most common response time is a full day | AgentZap |

## How to use it in the pitch

Lead implication-first, never stat-dump. Pick the one number that matches what discovery surfaced, tie it
to their economics, then ask a question. Frame with Gap Selling and SPIN (see the sales canon).

- Opening implication (after-hours): "About 62% of property inquiries land after hours. What happens to a
  lead that comes in at 9pm on a Friday before someone calls it Monday?" Then quantify with their numbers.
- First-responder wedge: "Roughly 78% of buyers go with whoever responds first. If a portal lead waits
  hours, you are usually not first. How many of last month's leads did you reach inside five minutes?"
- The decay frame: "Qualification odds fall about 90% after the first hour. Your average response on
  portal leads is what, honestly?" Let them say the number; it is almost always hours.
- Close to the math: hand the gap to the Close Room ROI tool. recoveredLeads = leadsPerMonth x
  pctUnanswered; recoveredDeals = recoveredLeads x closeRate; recoveredAed = recoveredDeals x avg
  commission. The arithmetic is theirs to check; the stats above explain why the gap exists.

## The Huscribe wedge (frame, do not overclaim)

The gap above is structural: humans cannot answer at 9pm, on weekends, in two languages, in under a
minute, every time. A 24/7 bilingual voice agent that qualifies inbound in seconds closes exactly that
gap. State the mechanism, not invented results: any Huscribe response-time or conversion figure is
`<CONFIRM>` until a pilot measures it on `CallSession` (lead-arrival-to-first-ring). The pilot's job is to
turn these industry stats into the buyer's own before/after number. See [PRICING.md](PRICING.md) pilot
section.

## Caveats

- These are third-party industry figures as of 2025-2026; cite the source at the point of use and treat
  them as directional, not guarantees. Re-check before putting any number in writing to a prospect.
- Several figures (917 minutes, 62% after-hours, 78% first responder) recur across the canon; this doc is
  the sourced backing so the operator can attribute them credibly.
- Never present an industry stat as a Huscribe result. The wedge is the mechanism plus the buyer's own
  measured gap, not a borrowed conversion number.

## Sources

- [GreetNow: Lead Response Time Statistics](https://greetnow.com/blog/lead-response-time-statistics)
- [Casey Response: The 5-Minute Rule](https://caseyresponse.com/blog/lead-response-time-statistics)
- [Kixie: Speed to Lead Response Time Statistics](https://www.kixie.com/sales-blog/speed-to-lead-response-time-statistics-that-drive-conversions/)
- [AgentZap: Real Estate Lead Response Statistics](https://agentzap.ai/blog/real-estate-lead-statistics)
- [Apten: Speed-to-Lead Benchmarks](https://www.apten.ai/blog/speed-to-lead-benchmarks-2026)
