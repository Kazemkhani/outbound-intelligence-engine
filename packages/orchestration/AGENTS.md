# AGENTS.md: `@oie/orchestration`

Operating guide for an AI agent making changes in this package. Read this fully before editing. It is specific to this module; do not generalise.

## Purpose

This is the orchestration brain of OIE (Outbound Intelligence Engine). It owns three things the rest of the system depends on:

1. The enrichment waterfall and the signal fan-in (we own the cascade, the cost ceiling, the swap; vendor logic never leaks in here).
2. The deterministic sequencing state machine plus the durable Inngest functions that run multi-day cadences.
3. The send gate: the code-level rail that nothing dials or sends without. `DRY_RUN` defaults true; explicit human approval is mandatory.

Nothing in this package computes a score. Scoring is pure and lives in `@oie/core`. This package only bridges normalised data into the scoring subject and consumes tiers.

## Key files and where things live

| Path                                 | What it is                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                       | The barrel. Re-exports every sub-module plus the top-level `inngest` client and the `inngestFunctions` array the web app serves.                                                             |
| `src/send-gate.ts`                   | `evaluateSendGate` and friends. The pure, total send decision. The single most important file here.                                                                                          |
| `src/waterfall.ts`                   | `enrichCompanyWaterfall`, `mergeCompany`. Priority-ordered provider cascade, fill-missing with per-field attribution, early stop on completeness.                                            |
| `src/collect-signals.ts`             | `collectSignals`. Cross-provider fan-in, keep-stronger dedup, central decay-window assignment.                                                                                               |
| `src/scoring-bridge.ts`              | `toScoringSubject` and the `*FromNormalised` mappers. Maps `@oie/integrations` DTOs into the `@oie/core` `ScoringSubject`. Lives here so `@oie/core` never depends on the integration layer. |
| `src/sequencing/state-machine.ts`    | Pure cadence machine: `nextDueAt`, `advance`, `shouldStop`, `applyBranch`. No I/O. `now` is always injected.                                                                                 |
| `src/sequencing/send-step.ts`        | `executeSendStep`, `buildIdempotencyKey`. The ONLY place that may call an adapter `.send()`, and only when the gate returns `allowSend: true`.                                               |
| `src/sequencing/inngest.ts`          | Durable functions `runEnrolment` and `stopEnrolment`; the shared `inngest` client; `registerAdapters`; DB reads for stop-events/suppression/cost.                                            |
| `src/sequencing/index.ts`            | The sole permitted re-export surface for `sequencing/*`. Nothing outside should reach into the sub-folder directly.                                                                          |
| `src/enrolment/auto-enrol.ts`        | `qualifiesForEnrolment`. Pure decision: fresh signal + at-or-above-bar tier + qualifying type.                                                                                               |
| `src/enrolment/cost-caps.ts`         | `costCapStatus`, `assertWithinCaps`, `CostCapExceededError`. Pure cap evaluation.                                                                                                            |
| `src/enrolment/inngest.ts`           | Durable functions `autoEnrolOnSignal` and `handleSuppression` (bounce/unsubscribe).                                                                                                          |
| `src/enrolment/index.ts`             | Re-export surface for `enrolment/*`.                                                                                                                                                         |
| `src/*.test.ts`, `src/**/**.test.ts` | Vitest specs. `pipeline.test.ts` is the e2e. Read the relevant spec before changing behaviour.                                                                                               |

Cross-package anchors (read but do not edit from here):

- Domain enums: `@oie/core` `Channel` = `email | linkedin | whatsapp`; `SignalType` = `hiring | funding | tech_adoption | job_change | news | web_change`; `Tier` = `A | B | C | D`.
- Helpers consumed: `signalDedupeKey`, `signalExpiry` from `@oie/core`.
- Adapter contracts: `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, plus `NormalisedCompany`, `AdapterContext`, `CostRecord`, `AdapterError` from `@oie/integrations`.
- Decision record: `docs/adr/0009-send-gate-and-dry-run.md`.

## Public contracts (what other packages import)

Everything below is exported from `@oie/orchestration` (root barrel):

- Send gate: `evaluateSendGate`, `isRealSendAllowed`, `SendBlockedError`, types `SendGateInput`, `SendGateDecision`, `SendGateOutcome`, `ApprovalState`.
- Waterfall: `enrichCompanyWaterfall`, `mergeCompany`, types `WaterfallOptions`, `WaterfallResult`, `WaterfallTrace`.
- Signals: `collectSignals`, types `CollectSignalsResult`, `CollectTrace`.
- Scoring bridge: `toScoringSubject`, `companyFactsFromNormalised`, `contactFactsFromNormalised`, `signalFactFromNormalised`.
- Sequencing machine: `advance`, `nextDueAt`, `shouldStop`, `applyBranch`, types `SequenceStep`, `StepCondition`, `EnrolmentState`, `StepAction`, `SequenceEvent`.
- Gated send step: `executeSendStep`, `buildIdempotencyKey`, types `SendStepParams`, `SendStepResult`, `SendStepOutcome`, `PendingMessage`, `SuppressionRecord`.
- Enrolment: `qualifiesForEnrolment`, types `EnrolmentTrigger`, `EnrolmentPolicy`, `AutoEnrolDecision`.
- Cost caps: `costCapStatus`, `assertWithinCaps`, `CostCapExceededError`, types `CostCaps`, `DailySpend`, `CostCapStatus`.
- Runtime: `inngest`, `inngestFunctions` (array passed to the serve handler), `registerAdapters`, `runEnrolment`, `stopEnrolment`, `sequencingFunctions`.

The web app wires this as: `serve({ client: inngest, functions: inngestFunctions })`, after calling `registerAdapters({ emailSender, messagingChannels })` once at startup.

## Invariants

YOU MUST:

- Route every send-path through `evaluateSendGate`. A real send requires BOTH conditions independently: `dryRun === false` AND `approval === "approved"`. These are deliberately separate so flipping one can never imply the other.
- Keep `evaluateSendGate` pure and total: every branch returns a decision; there is no implicit allow. The default posture (`dryRun: true`, `approval: "pending"`) must return `simulate` / `allowSend: false`.
- Keep `executeSendStep` the only function that calls an adapter `.send()`, and only after `decision.allowSend === true`.
- Treat LinkedIn and WhatsApp as OFF by default: they need a third gate (`channelEnabled === true`) before any other check. They are in `GATED_CHANNELS` in `send-gate.ts`.
- Keep all `state-machine.ts`, `cost-caps.ts`, `auto-enrol.ts`, and `send-gate.ts` functions pure with `now` injected. No `Date.now()`, no `process.env`, no DB calls inside them.
- Keep idempotency keys deterministic via `buildIdempotencyKey(enrolmentId, stepIndex, channel)`. The same logical send must always produce the same key so adapter-level dedup and Inngest replay are safe.
- Check suppression BEFORE the gate in `executeSendStep`, and DB-load suppressions inside a `step.run` so they are honoured on replay.
- Record provider attribution per field in `company.sources` when merging in the waterfall.
- Treat missing data as unknown, never guessed (null/empty stays null/empty; `isPresent` governs fill-missing).

NEVER:

- Never default `dryRun` to false, never read or write any disable-flag for DRY_RUN, and never add a code path that sends when the gate did not return `allowSend: true`. (A content-based guard hook rejects the literal disable-flag token even inside docs; reword, never bypass.)
- Never let the LLM compute a score or a tier here. This package consumes tiers; it does not produce them.
- Never let a vendor shape leak across the boundary. Inputs are `Normalised*` DTOs from `@oie/integrations`; outputs are core types. Vendor-specific branching belongs in the adapter, not here.
- Never read `process.env` inside the pure modules or inside `state-machine.ts`. Env reads are confined to `readCostCaps`/`readDailySpend` in the Inngest files and to `@oie/config`.
- Never abort a whole cascade on one provider error. The waterfall and `collectSignals` log the failure to their `trace` and fall through to the next provider.
- Never set a signal `expiresAt` inside an adapter; the central `withExpiry` (via `signalExpiry`) owns the decay window.
- Never reach into `sequencing/*` or `enrolment/*` internals from outside; import from the sub-folder `index.ts` or the root barrel.
- Never reorder the gate checks in `executeSendStep`: suppression -> `evaluateSendGate` (channel-enabled -> rejected -> DRY_RUN -> approval) -> adapter send.

## How to make a change safely

1. Read the file you are changing AND its `*.test.ts` sibling. The tests encode the contract.
2. If the change touches sending, enrolment, or the gate, re-read `docs/adr/0009-send-gate-and-dry-run.md` first.
3. Prefer changing a pure function (`send-gate.ts`, `state-machine.ts`, `cost-caps.ts`, `auto-enrol.ts`, `waterfall.ts` merge/complete logic). Keep DB and env at the Inngest layer.
4. If you add a new `SendGateOutcome` or `SendStepOutcome`, update BOTH mapping helpers in `send-step.ts` (`gateOutcomeToStepOutcome` and `pendingMessageStatus`); their `switch` statements are exhaustive and a missed case fails typecheck.
5. Add or update a test that asserts the default-deny posture still holds.
6. Verify locally:
   - `pnpm --filter @oie/orchestration test`
   - `pnpm --filter @oie/orchestration typecheck`
   - Before claiming done, run the repo gate: `pnpm verify` (typecheck + lint + test + build).
7. If you add an env key, document it in the root `.env.example` (do not write secret values anywhere).

## Do / Don't

Do:

- Keep gate logic in one place and call it from every path.
- Inject `now`, adapters, caps, and suppressions; assert on the returned `trace` / `decision` in tests.
- Persist a `Message` row AND an `AuditLog` entry for every send-step outcome, including blocked/simulated ones (this is how the approval queue and audit trail are populated).
- Use `upsert` for enrolment and suppression writes so Inngest replay is idempotent.

Don't:

- Don't add hidden defaults that weaken the gate.
- Don't memoise the gate or approval check across an Inngest replay; they must re-evaluate on every execution. Only persistence/IO is memoised in `step.run`.
- Don't compute `nextActionAt` or `dueAt` with the wall clock inside the pure machine; pass `from`/`now`.
- Don't return Dates from a `step.run` block expecting them to survive: Inngest serialises through JSON, so reconstruct Dates from ISO strings (see `advance-state-step` in `sequencing/inngest.ts`).

## Worked examples

### 1. Default posture must never send

```ts
import { evaluateSendGate } from "@oie/orchestration";

evaluateSendGate({
  dryRun: true, // system default
  approval: "pending", // nothing approved yet
  channel: "email",
  channelEnabled: true,
});
// => { outcome: "simulate", allowSend: false, reason: "DRY_RUN is on ..." }
```

A real send only happens with `dryRun: false` AND `approval: "approved"` (and, for `linkedin`/`whatsapp`, `channelEnabled: true`). Any change that makes the snippet above return `allowSend: true` is a defect.

### 2. Signal-triggered auto-enrolment still goes through the gate

`qualifiesForEnrolment` decides only whether to CREATE an `Enrolment` row; it never sends.

```ts
import { qualifiesForEnrolment } from "@oie/orchestration";

qualifiesForEnrolment(
  { signalType: "funding", signalExpiresAt: futureDate, tier: "B" },
  { minTier: "B", qualifyingTypes: ["hiring", "funding", "tech_adoption", "job_change"] },
  now,
);
// => { enrol: true, reason: "fresh funding signal on a tier-B lead" }
```

Even when `enrol: true`, the first message lands in the approval queue: `autoEnrolOnSignal` writes the `Enrolment` and an `AuditLog` entry only; the first actual send still flows through `executeSendStep` -> `evaluateSendGate`, which simulates while `DRY_RUN` is on. An expired signal, a below-bar tier, or a non-qualifying type returns `enrol: false`.

## Gotchas

- DRY_RUN beats approval: an approved action still only simulates while `dryRun` is true. This is intentional (`send-gate.ts` checks DRY_RUN before approval).
- A `simulate` (dry-run) outcome maps the persisted `PendingMessage.status` to `awaiting_approval`, not a separate state: dry-run previews sit in the approval queue (`pendingMessageStatus` in `send-step.ts`).
- Suppression match is email/domain only and only for the `email` channel (`isSuppressionMatch`). It does not suppress LinkedIn/WhatsApp; those are gated by `channelEnabled`.
- Cost caps are non-critical-path safe: `readDailySpend` returns zero spend on any DB error so a transient hiccup never falsely halts; LLM spend is distinguished by provider-name convention (`openai`, `anthropic`) since `ProviderCost` has no type column.
- Cost-cap halts skip non-critical work (auto-enrol, sequencing steps) but never throw in the Inngest path; they log `*.skipped.cost-cap` and return. `assertWithinCaps` (throwing) is for direct call sites, not the durable functions.
- The waterfall seeds with an empty `name` so the first matching provider's `name` is still attributed in `sources` (see the comment in `mergeCompany`).
- Default completeness is `domain && industry && employeeCount`; pass `options.isComplete` to change the cost-ceiling stop point.
- `stopEnrolment` works two ways at once: it writes `Enrolment.status = stopped` (so `loadStopEvents` halts the run on its next check) AND relies on Inngest `cancelOn` to cancel pending sleeps. Keep both.
- Internal packages are consumed as TS source (no JS emit); `build` here is `tsc --noEmit`. Vitest/tsx transpile on the fly.
