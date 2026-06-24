# Compliance: UAE PDPL + TDRA for Outbound Voice and Personal Data

Operator reference for Huscribe Revenue OS (the control plane for Huscribe.com voice-AI inbound lead qualification, UAE/MENA real estate). Operator: HumAI, Dubai (gp@humai.ae). This document maps the legal obligations to the exact code paths that enforce them.

This is operator guidance, not legal advice. The legal facts below are sourced from law-firm commentary on the cited statutes. Confirm exact current figures against the official text at uaelegislation.gov.ae before any production dialing.

---

## 1. The two regimes that bind us

| Regime | Instrument | Governs | Authority |
| --- | --- | --- | --- |
| Personal data | PDPL, Federal Decree-Law No. 45/2021 | Consent, purpose limitation, data-subject rights, lawful basis | UAE Data Office |
| Telemarketing | Cabinet Resolution No. 56 of 2024 (and 57/2024), in force 27 Aug 2024 | Calling windows, DNCR, caller-ID, identification, frequency | TDRA / competent authority |

PDPL requires consent that is "clear, specific, informed, unambiguous and freely withdrawable" (Art. 6), with a stated purpose communicated before processing (purpose limitation) and a short list of non-consent bases in Art. 5 (contract, public info, legal claims). Data subjects can require a controller to stop processing for direct marketing. (Sources: securiti.ai/uae-personal-data-protection-law, cookieyes.com/blog/uae-data-protection-law-pdpl.)

The telemarketing rules add operational hard limits on top of PDPL. (Sources: Trench & Associates, Pinsent Masons, Clyde & Co, NR Doshi, Morgan Lewis.)

---

## 2. The obligations, and where the system enforces them

### 2.1 Consent and lawful basis (PDPL Art. 5-6)

- Every `CallSession` carries `consent: Boolean` and `consentBasis: String?` (`packages/db/prisma/schema.prisma`). The current demo basis is `"operator_initiated_demo"` (`scripts/nova-call.ts`).
- The master-DB enrichment path is consent-gated in code: `ingestCallResult` returns early if `!session.consent`, so no fact (mobile, tech stack, signal) compounds without a recorded basis. Enrichment never outlives the consent that justified it.
- Provenance: the full NOVA `get_call` payload is stored in `CallSession.raw`, and each fact is a `CallFinding` row with `source`, `confidence`, and `capturedAt`. Missing data yields no finding (`extractFindings` keeps only recognised, non-empty keys), honoring the invariant "missing data = unknown, never guessed."

### 2.2 Calling window, frequency, weekends/holidays (Cabinet Resolution 56/2024)

Marketing calls are restricted to 09:00-18:00 local time, banned on weekends and public holidays, and limited (per Trench & Associates' read) to one call per day and two per week if unanswered, with no same-day re-call after a refusal. (Sources: Trench & Associates, Pinsent Masons.)

- NOVA's built-in compliance gate enforces consent / DNCR / calling-window before dial.
- Status: the calling-window gate must enforce Asia/Dubai 09:00-18:00 plus a UAE weekend/public-holiday calendar AND a per-contact frequency ledger (1/day, 2/week-if-no-answer, hard stop after a same-day refusal). A UAE-holiday source and a Contact-level frequency counter (derivable from `CallSession.placedAt` / `completedAt` timestamps) are required before `DEMO_MODE` is turned off. Treat this as a blocking production item, not done.

### 2.3 Caller-ID, registration, prior approval (Cabinet Resolution 56/2024)

Marketing calls must come from a local UAE number issued by a licensed operator and registered under the company's trade licence. Personal and non-local numbers are prohibited. Prior TDRA approval is required to operate; operating without it carries AED 75,000-150,000 fines. (Sources: Clyde & Co, Trench & Associates.)

- These are operator prerequisites, not code tasks. Before NOVA places a single real PSTN call, HumAI needs TDRA telemarketing approval and a licence-registered UAE caller-ID wired into the LiveKit/PSTN path. Surface both as blocking items in the production checklist; they gate the owner sign-off that disables `DEMO_MODE`.

### 2.4 Do-Not-Call Registry (DNCR)

Numbers on the TDRA-managed DNCR cannot be called for marketing; firms must train staff on and check the DNCR before dialing. The sources confirm the obligation but do not publish a public API spec. (Sources: Pinsent Masons, Morgan Lewis.)

- NOVA's DNCR gate must fail-closed: if no authoritative DNCR status is available for a number, treat it as not-callable (the invariant again: unknown, never guessed).
- Persist DNCR-check provenance per `Contact` / `CallSession` so every call has an auditable suppression record. Confirm how the operator obtains DNCR status (via TDRA registration) before going live.

### 2.5 In-call identification, recording disclosure, no pressure

At the start of a call the agent must identify itself, confirm the consumer wants to continue before pitching, disclose any recording, and apply no unjustified pressure. Deceptive marketing draws AED 25,000-75,000. (Sources: Trench & Associates, Pinsent Masons.)

- NOVA's 4-phase script (Greeting -> Discovery -> Pitch -> Close) already opens permission-based ("you weren't expecting me, can I borrow 20 seconds?") and identifies Huscribe (`HUSCRIBE_CONTEXT` in `scripts/nova-call.ts`).
- Hardening required: a non-skippable continue/stop checkpoint logged to `CallFinding` before the Pitch phase, a recording-disclosure line, and (because NOVA is an AI agent) an explicit automated/AI-caller disclosure to stay on the right side of the no-deception rule.

### 2.6 Data-subject rights and opt-out

PDPL gives data subjects access, rectification, erasure, restriction, and the right to stop direct-marketing processing, with an easy withdrawal mechanism.

- NOVA's call objective already requires honoring opt-out immediately ("Honour any opt-out immediately," CLOSE phase). In code, `ingestCallResult` derives `optOut` from the `opt_in` finding (`optOut = !affirmative(optIn.value)`) and writes it to `CallSession.optOut`.
- Required hardening: a withdrawal must write a durable suppression that blocks all future contact on every channel, not just flag one call. OIE already has a cross-channel `Suppression` model and a send-step that skips suppressed recipients; a captured voice opt-out should write into that same suppression path so email (`Channel.email`), LinkedIn, and WhatsApp sends are all blocked. Record `consentBasis` and purpose per fact so suppression and consent stay coherent.

---

## 3. NOVA's compliance gate + DEMO_MODE + DRY_RUN: the enforced layers

The system never relies on a remembered instruction; safety is enforced by code and flags. Four independent layers must all pass before any real outreach.

1. NOVA compliance gate (voice, pre-dial): consent + DNCR + calling-window, fail-closed. Runs inside NOVA before a dial.
2. DEMO_MODE (voice transport): when on (the default without owner sign-off), `place_calls` dispatches the agent into a LiveKit room (`room = call-<context_id>`) and no real PSTN dial happens. In `scripts/nova-call.ts`, `demoMode = !NOVA_KEY` and is persisted on every `CallSession`. The public demo endpoints let a prospect see the qualification flow with zero PSTN risk.
3. DRY_RUN (all OIE channels, system-level): defaults `true` in validated env (`packages/config/src/schema.ts`, `DRY_RUN: boolFromEnv(true)`). The guard hook refuses any text containing the literal disable token, even in docs, so this flag cannot be flipped casually.
4. Send gate (OIE email/LinkedIn/WhatsApp, per-action): `evaluateSendGate` (`packages/orchestration/src/send-gate.ts`) is pure and total. A real send requires BOTH `DRY_RUN` off AND explicit human approval; LinkedIn and WhatsApp carry a third gate (`channelEnabled`, off by default). DRY_RUN always wins over approval, and approval can never override DRY_RUN.

Net invariant: nothing sends or dials on any channel without explicit human approval AND a passing dry-run, and the LLM never computes a score (code does, deterministically, in `packages/core`). The compliance posture is the trust differentiator, not autonomy.

---

## 4. Provenance, audit, and cross-border transfer

- Audit trail: `place_calls` writes an append-only `AuditLog` row (`actor: "system:nova-call"`, `action: "voice.place_calls"`), and every consequential action (send, score change, data pull) is logged the same way. Keep these for the record-keeping obligation under the telemarketing rules.
- Per-call provenance: `CallSession.raw` holds the full payload; `CallFinding` holds each typed fact with `source`/`confidence`. This is the auditable basis for every enriched value.
- Cross-border: UAE lead data moving to a US LLM (Anthropic) or a non-UAE hosting region (the app runs on Fly.io region `fra`) is a cross-border transfer needing a documented basis under PDPL. Treat any such move as in scope; secrets (including the Anthropic key) live only in Fly secrets, never in the image or repo.

---

## 5. Penalties (directional; confirm before going live)

| Breach | Reported fine |
| --- | --- |
| DNCR violation (1st / 2nd / 3rd) | AED 50k / 75k / 150k |
| Operating without prior approval | AED 75k-150k |
| Deceptive / misleading marketing | AED 25k-75k |
| PDPL serious violations | ~AED 50k to AED 5m (unlawful disclosure may carry imprisonment under cybercrime law) |

PDPL Executive Regulations were still unpublished into 2025; once issued, organisations get a six-month compliance window. Design to the stricter expected baseline now (consent + provenance + purpose + opt-out + breach logging) to avoid rework. (Sources: NR Doshi, Chambers Practice Guides, cookieyes.com.)

---

## 6. Go-live checklist (must all be true before DEMO_MODE off)

- [ ] TDRA telemarketing approval obtained by HumAI (operator task, blocking).
- [ ] Licence-registered UAE caller-ID number wired into the LiveKit/PSTN path.
- [ ] DNCR status source confirmed; gate fails closed on unknown.
- [ ] Calling-window gate enforces Asia/Dubai 09:00-18:00 + UAE weekend/holiday calendar.
- [ ] Per-contact frequency ledger live (1/day, 2/week-if-no-answer, no same-day re-call after refusal).
- [ ] Recording disclosure + AI-caller disclosure + continue/stop checkpoint logged to `CallFinding` before Pitch.
- [ ] Voice opt-out writes a durable cross-channel `Suppression`.
- [ ] Documented cross-border transfer basis for UAE data to US LLM / `fra` region.
- [ ] Explicit owner (gp@humai.ae) sign-off on record.

Until every box is checked, DEMO_MODE and DRY_RUN stay on. The compliance gate is a marketed, demonstrable feature, the reason a UAE brokerage can trust an AI dialer at all.
