# NOVA Voice Activation Plan: Demo to Live

Operator playbook for moving NOVA (the operator's own production voice agent, `api.novalabs.ae`, FastAPI + LiveKit) from DEMO_MODE to live PSTN dialing for Huscribe Revenue OS. Owner/operator: HumAI, Dubai (gp@humai.ae). Source of truth: `scripts/nova-call.ts`, the `CallSession` / `CallFinding` models in `packages/db/prisma/schema.prisma`, and `docs/revenue-os/COMPLIANCE.md`.

**The one rule that overrides everything: no live dialing without explicit owner (gp@humai.ae) sign-off on record.** Until every prerequisite below is true and signed, DEMO_MODE and DRY_RUN stay on. In `scripts/nova-call.ts`, `demoMode = !NOVA_KEY`: with no Bearer key the agent only joins a LiveKit room (`call-<context_id>`) and no PSTN dial occurs. Flipping NOVA to live is the NOVA owner's action on the NOVA side, not a code change in this repo.

Why this matters commercially: speed-to-lead is the dominant conversion lever (average agent first-response cited at ~917 minutes, ~62% of inquiries arrive after hours, ~78% of buyers transact with the first responder; AgentZap, https://agentzap.ai/blog/real-estate-lead-statistics). The compliance gate is not overhead, it is the trust differentiator that lets a UAE brokerage trust an AI dialer at all, while commodity voice vendors (Bland, Synthflow, Retell, Vapi) sell raw minutes with no consent/DNCR/window gate (Retell, https://www.retellai.com/blog/bland-vs-synthflow).

---

## Stage 0: Prerequisites (all blocking, must be true before any live dial)

These gate the owner sign-off; they are not optional and several are operator (not code) tasks. Mirrors the go-live checklist in `docs/revenue-os/COMPLIANCE.md` section 6.

| # | Prerequisite | Owner | Type | Status |
| --- | --- | --- | --- | --- |
| 1 | TDRA telemarketing approval obtained by HumAI (operating without it: AED 75k-150k) | gp@humai.ae | Operator | Not done |
| 2 | Licence-registered local UAE caller-ID wired into the LiveKit/PSTN path (personal/non-local numbers prohibited) | gp@humai.ae + NOVA | Operator | Not done |
| 3 | DNCR status source confirmed; gate fails closed on unknown number | gp@humai.ae | Operator + code | Not done |
| 4 | Calling-window gate enforces Asia/Dubai 09:00-18:00 plus a UAE weekend/public-holiday calendar | NOVA / engine | Code | Not done |
| 5 | Per-contact frequency ledger live: 1 call/day, 2/week if unanswered, hard stop after a same-day refusal | engine | Code | Not done |
| 6 | Recording disclosure + AI-caller disclosure + non-skippable continue/stop checkpoint, logged to `CallFinding` before Pitch | NOVA script | Code | Not done |
| 7 | Voice opt-out writes a durable cross-channel `Suppression` (blocks email/LinkedIn/WhatsApp too) | engine | Code | Not done |
| 8 | Documented cross-border transfer basis (UAE lead data to US LLM / Fly `fra` region) | gp@humai.ae | Operator | Not done |
| 9 | Explicit owner sign-off recorded (date, scope, caller-ID, allowed list) | gp@humai.ae | Operator | Not done |

Legal basis: Cabinet Resolution No. 56 of 2024 (in force 27 Aug 2024) restricts marketing calls to 09:00-18:00, bans weekends/public holidays, mandates DNCR screening, licence-registered caller-ID, and in-call identification; PDPL (Federal Decree-Law No. 45/2021) requires clear, specific, informed, unambiguous, freely withdrawable consent (Pinsent Masons, https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity; Trench & Associates, https://www.trenchlaw.com/new-telemarketing-rules-in-uae-timings-fines-exemptions-explained/). DNCR fines escalate AED 50k / 75k / 150k for first/second/third breach. Confirm exact current figures against uaelegislation.gov.ae before going live; this is operator guidance, not legal advice.

---

## Staged rollout

The engine-side invariants stay on through every stage: nothing dials without explicit human approval AND a passing dry-run; DRY_RUN stays true; the LLM never computes a score (code does, in `packages/core`); missing data = unknown, never guessed.

### Stage 1: SHADOW (DEMO_MODE on, no PSTN): start this week, run ~1-2 weeks

Goal: prove the conversation, capture quality, and persistence are sound with zero dial risk.

1. Run the demo loop against the master DB: `pnpm exec tsx --env-file=.env scripts/nova-call.ts [limit]`. The agent joins a LiveKit room only; `demoMode` persists `true` on every `CallSession`.
2. Operator joins the demo room (via NOVA's `get_demo_token` for the printed `context_id`) and runs the 4-phase arc (Greeting -> Discovery -> Pitch -> Close) against scripted scenarios, including an opt-out and a "wait till morning" answer.
3. Verify capture: each call upserts a `CallSession` keyed on `novaCallId` with `consentBasis: "operator_initiated_demo"`; findings land as `CallFinding` rows on the seven canonical keys (`identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`); the full payload is in `CallSession.raw`. Confirm a missing field yields no finding.
4. Verify enrichment is consent-gated: `ingestCallResult` returns early when `!session.consent`; a `mobile` finding normalises via `toE164()` to `Contact.phone`/`whatsapp`; a `tools` finding merges to `Company.techStack` plus a `tech_adoption` `Signal`.
5. QA bar (LiveKit reports <300ms end-to-end "feels human", ~85% true-positive semantic turn detection; https://livekit.com/blog/understand-and-improve-agent-latency): persist per-turn latency/turn-detection metrics into `CallSession.raw` and set a pass threshold before any human is on the other end.

Exit criteria: 20+ clean demo sessions, every finding correctly typed, opt-out path verified, no fabricated data, latency QA bar met.

### Stage 2: SUPERVISED (first live PSTN, operator on every call): only after Stage 0 complete and owner sign-off

Goal: first real dials, tiny volume, human watching each one, live to a hard stop.

1. Owner signs off (prerequisite 9), defining scope: a named allow-list of 5-10 numbers (warm contacts / consenting pilot brokers), the caller-ID, the date window.
2. NOVA owner enables live dialing on the NOVA side; the optional `NOVA_API_KEY` Bearer is set in Fly secrets only (never the repo/image), which sets `demoMode = false` on new sessions.
3. Restrict the source list: the loop pulls leads from `Message` rows in `awaiting_approval` (the same human gate as every other channel). Keep volume to the allow-list; operator approves each number before dial.
4. The operator listens live to every call, ready to terminate. Confirm in-call: AI-caller disclosure, recording disclosure, the continue/stop checkpoint before Pitch, and immediate opt-out honouring.
5. After each call, review the transcript, findings, and that a captured opt-out wrote a durable cross-channel `Suppression`.

Exit criteria: 10+ supervised live calls with zero compliance defects (window respected, DNCR clean, disclosures present, opt-outs honoured, frequency ledger correct), and the enrichment loop writing verified mobiles back to the master DB.

### Stage 3: LIVE (controlled volume, monitored): after a clean supervised run

Goal: scale within the legal envelope while keeping the gate fail-closed.

1. Lift the allow-list to a ranked queue, still only `awaiting_approval` leads, prioritising tier A/B ICP matches and prospects whose `after_hours_handling = waits till morning` (the hot wedge signal).
2. Cap daily volume conservatively; let the frequency ledger and 09:00-18:00 / weekend-holiday window throttle automatically. Never override a fail-closed DNCR/window result.
3. Monitor KPIs daily (below). Hold a weekly compliance + quality review; any breach triggers an immediate rollback to DEMO_MODE.

---

## Guardrails (always on, all stages)

The system never relies on a remembered instruction. Four independent layers must all pass before any real outreach (`docs/revenue-os/COMPLIANCE.md` section 3):

1. **NOVA compliance gate** (voice, pre-dial): consent + DNCR + calling-window, fail-closed. If no authoritative DNCR or window status exists, the number is not-callable.
2. **DEMO_MODE** (voice transport): on by default without owner sign-off; `place_calls` dispatches to a LiveKit room, no PSTN.
3. **DRY_RUN** (all OIE channels, system-level): defaults `true` in validated env. The content-based guard hook refuses any text containing the literal disable token, even in docs, so it cannot be flipped casually.
4. **Send gate** (per-action): a real send/dial requires DRY_RUN off AND explicit human approval; DRY_RUN always wins over approval.

Additional standing guardrails: secrets (`NOVA_API_KEY`, Anthropic key) live only in Fly secrets; every `place_calls` writes an append-only `AuditLog` row (`action: "voice.place_calls"`) for the telemarketing record-keeping obligation; cross-border movement of UAE data to the US LLM or `fra` region needs a documented basis; a captured opt-out blocks all channels, not just one call.

---

## KPIs

Instrument these on `CallSession` / `CallFinding` and surface in the control plane at `/voice` (live: https://huscribe-revenue-os.fly.dev).

| KPI | Definition | Target / proof |
| --- | --- | --- |
| Speed-to-first-ring | lead-arrival to first dial | the headline before/after: "917 minutes vs seconds" |
| Compliance defect rate | calls breaching window/DNCR/disclosure/frequency | 0 (any breach = rollback to DEMO_MODE) |
| Connection rate | answered / dialed | track; verified mobiles should lift it over decayed numbers |
| Qualification rate | `identity_confirmed` + full Discovery captured / connected | rising; the qualifying field is `after_hours_handling` |
| Hot-wedge hits | `after_hours_handling = waits till morning` | high-intent ICP matches to prioritise |
| Enrichment yield | new verified `mobile` + `tools` written per consented call | the verify-by-conversation moat, made measurable |
| Demo conversion | `demo_interest` / `opt_in` affirmative / qualified | pipeline into the next sales step |
| Opt-out rate + honour latency | opt-outs captured / honoured immediately as cross-channel `Suppression` | 100% honoured, immediate |
| Turn latency / interruptions | per-turn LiveKit metrics in `CallSession.raw` | <300ms feels-human bar, no early cut-offs |
| Cost per qualified call | `CallSession.costUsd` / qualified | margin vs the claygency retainer anchor ($3k-$15k/mo of human labour; https://blog.gtm-engineering.io/blog/best-clay-automation-agencies) |

Verify-by-conversation is the durable moat: B2B contact data decays ~22.5%/year, and NOVA replaces decaying third-party records with conversation-verified facts the moment they are spoken (https://www.spotlight.ai/post/ai-crm-data-enrichment). The calls that build the database ARE the product.

---

## This week (concrete next actions)

1. **gp@humai.ae**: open the TDRA telemarketing approval application and request a licence-registered UAE caller-ID number from a licensed operator (prerequisites 1-2, longest lead time, start now).
2. **gp@humai.ae**: confirm the DNCR status source (how HumAI obtains DNCR lookups via TDRA registration) so the gate can fail closed (prerequisite 3).
3. **Engine**: run Stage 1 SHADOW today via `scripts/nova-call.ts`; verify CallSession/CallFinding persistence and consent-gated enrichment against the master DB.
4. **Engine**: scope the four code prerequisites (calling-window calendar, frequency ledger, in-call disclosure/checkpoint logging, cross-channel opt-out suppression) as the work needed before Stage 2.
5. **Do NOT** set `NOVA_API_KEY`, disable DEMO_MODE, or turn off DRY_RUN. Live dialing waits for owner sign-off with every Stage 0 box checked.
