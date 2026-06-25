# packages/orchestration Plan

> The durable runtime and the send-gate seam: make the human approval a true durable suspend, push channel caps and quiet hours onto Inngest's declarative flow control, and prove DRY_RUN survives a suspend-approve-resume. Derived from docs/architecture/TARGET-ARCHITECTURE.md (Part 6, Top bet #1) and docs/strategy/DATA-ACQUISITION.md (warm-only outreach now; automated/at-scale send is TDRA-gated and on a separate clock).

## Current state (from the code)

The orchestration package is wired and serving. Verified against the source:

- **Inngest** is the durable brain. `inngest@3.54.2` is installed (lockfile), and `@inngest/ai@0.1.7` is present transitively (the gateway behind `step.ai.infer`). The shared client is `export const inngest = new Inngest({ id: "oie" })` in `src/sequencing/inngest.ts:37`.
- **The send-gate is pure and total.** `evaluateSendGate(input: SendGateInput): SendGateDecision` in `src/send-gate.ts` enforces three independent conditions in this order: channel-enabled (LinkedIn/WhatsApp in `GATED_CHANNELS`), not-rejected, DRY_RUN-off, approved. Default posture (`dryRun: true, approval: "pending"`) returns `{ outcome: "simulate", allowSend: false }`. It is exercised by `src/send-gate.test.ts`.
- **The gate is called on every send execution** inside `executeSendStep` (`src/sequencing/send-step.ts:221`), after a suppression check, and it is the ONLY place that calls an adapter `.send()`.
- **The cadence is durable but approval is static.** `runEnrolment` in `src/sequencing/inngest.ts:248` loops steps with `step.run` (stop-check, suppression load, send, advance) and `step.sleepUntil` for the cadence delay. Approval is a static field on the event payload (`EnrolContactPayload.approval: ApprovalState`, line 64) snapshotted at enrol time. There is **no `step.waitForEvent`**: a run never suspends for a human; whatever `approval` was in the payload at enrol time is what the gate sees, so today an approved enrolment would simply flow through (DRY_RUN still simulates).
- **The waterfall is one plain async loop.** `enrichCompanyWaterfall` in `src/waterfall.ts:88` iterates providers in priority order with no `step.run` wrapping per provider, so a retry of the enclosing step would re-bill every matched provider.
- **No declarative flow control.** `runEnrolment`'s `createFunction` config (lines 249-259) sets `id`, `name`, `retries: 3`, and `cancelOn` only. There is no `throttle`, no `concurrency`, no `rateLimit`. Channel caps and quiet hours are not enforced at the platform level (and there is nothing live to rate-limit yet: 0 of 17 keys, nothing ever sent).
- **`cancelOn` + DB-status stop** is the manual-stop path: `stopEnrolment` writes `Enrolment.status = "stopped"` and the `cancelOn: [{ event: "oie/sequence.stop", if: ... }]` cancels pending sleeps.
- Cost caps are read at the Inngest layer (`readCostCaps`/`readDailySpend`, lines 110-151), fail-open to zero on DB error, and halt non-critical work without throwing.
- Barrel `src/index.ts` re-exports everything and assembles `inngestFunctions = [...sequencingFunctions, ...enrolmentFunctions]`. The web app serves `serve({ client: inngest, functions: inngestFunctions })` after `registerAdapters(...)`.
- `package.json` `build` is `tsc --noEmit` (TS-source consumption, no emit). Tests are Vitest; this file is "typecheck-only" by design (no running Inngest server in CI).

## Target architecture for this module (from the research)

Part 6 of TARGET-ARCHITECTURE.md and Top bet #1 are unambiguous: **stay on Inngest and exploit capabilities not yet used; do not migrate engines.** Trigger.dev, Temporal, Restate, DBOS, Hatchet, LangGraph, BullMQ/Kafka are all on the deliberately-NOT list until a named trigger (per-execution billing pain on many long cadences, the sleep cap blocking multi-week cadences, or one durable engine needing to span the TS pipeline and the Python NOVA service).

Three concrete changes, all inside `packages/orchestration`, none touching the adapter boundary or the scorer:

1. **Make the send-gate a durable suspend (NOW, bet #1).** Insert `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })` immediately before the send `step.run` in `runEnrolment`. The Close Room approval emits `oie/send.approved`; the run resumes at zero idle compute. `evaluateSendGate` STILL runs on resume as the final, non-memoised code gate, so DRY_RUN can never be replayed away. Pure TS in one file plus a regression test.
2. **Move channel rate limits to declarative flow control (NEXT).** Attach `throttle` keyed by mailbox+channel and `concurrency` keyed by contact to the sequencing function, enforcing LinkedIn (~100 connects/week, operate well within), WhatsApp, per-mailbox email caps, and quiet hours on the platform instead of ad-hoc checks. Real value but nothing is live to rate-limit yet, so NEXT.
3. **Wrap each `EnrichmentProvider.enrichCompany` call in its own `step.run` (NEXT)** so a retry memoises matched providers instead of re-billing them.

The `step.ai.infer` question is resolved by the research and is a do-NOT here: it routes through Inngest's own AI gateway (`@inngest/ai`), bypassing `LlmClient.complete()`, so it would not emit the single OTel GenAI span or the `CostRecord`. Every traced/costed Claude call stays on `LlmClient.complete()` inside a plain `step.run`. `step.ai.infer` is reserved for calls deliberately excluded from the OTel/cost chokepoint (currently none).

AgentKit-on-Inngest (`@inngest/agent-kit`) is **Later, not now**, gated on a concrete agentic task the current `step.run`/`step.ai.infer` composition cannot express. It runs on the same Inngest backend so adoption is additive, not a migration.

Data-acquisition alignment: warm 1:1 outreach is the only active outreach now and does not run through this engine at volume; automated/at-scale sending (the thing throttle/concurrency governs) is TDRA-gated and on a separate clock. So the durable suspend lands now (it makes the most dangerous action the most provably controlled on the existing dry-run system), while throttle/concurrency is staged for NEXT when there is live volume and TDRA approval is in motion.

## Invariants this module must preserve

- **Deterministic scoring stays in code.** Nothing here computes a score or tier; this package consumes tiers via the scoring bridge. No `step.ai.infer`, no LLM, ever produces a number on this path.
- **DRY_RUN default true + mandatory human send-gate.** `evaluateSendGate` re-runs on EVERY execution including resume; it is never memoised inside a `step.run`. The new `waitForEvent` adds a durable human checkpoint; it does not replace the code gate. DRY_RUN beats approval, always.
- **Vendor shapes never leak into core.** All Inngest-shaped config stays in `sequencing/inngest.ts` so a future engine port rewrites one file. Inputs are `Normalised*` DTOs; outputs are core types. The `oie/send.approved` event payload is our own shape, not a vendor's.
- **Secrets only via env/Vercel.** No new secrets are introduced. `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` stay at the serve layer. Quiet-hours and cap config read from `@oie/config`, never `process.env` inside pure modules.
- **UAE PDPL + TDRA gate any live voice / any at-scale send.** Throttle/concurrency and any live-send reachability stay behind the gate and (NEXT) a feature flag; nothing here flips DRY_RUN or auto-approves.
- **Do NOT adopt deliberately-NOT items:** no engine migration, no `step.ai.infer` for traced/costed calls, no agent framework now, no queue/stream infra.

## Now (0 to 4 weeks)

### Task 1 (NOW, bet #1): Durable approval suspend before send, with the regression test. Effort: S

Insert a `step.waitForEvent` suspend immediately before the send `step.run` in `runEnrolment`, so the run parks at zero compute until the Close Room emits `oie/send.approved`, then resumes and re-evaluates `evaluateSendGate`.

**1a. Define the approval event payload (in `src/sequencing/inngest.ts`, with the other payload interfaces):**

```ts
/**
 * `oie/send.approved`, emitted by the Close Room approval UI to resume a
 * suspended send step. `actionId` MUST equal the step's idempotency key so the
 * waitForEvent `match` resolves to the correct suspended run.
 */
export interface SendApprovedPayload {
  /** The idempotency key of the send step being approved: buildIdempotencyKey(enrolmentId, stepIndex, channel). */
  actionId: string;
  /** Operator identity for the AuditLog (e.g. "gp@humai.ae"). */
  approvedBy: string;
  /** Per-action approval decision. The gate still re-checks DRY_RUN independently. */
  approval: ApprovalState;
}
```

**1b. Suspend before the send step.** In `runEnrolment`, between the suppression-load `step.run` (line ~371) and the send `step.run` (line ~399), add the suspend and fold its result into the gate inputs:

```ts
// ── 3.5 Durable human approval gate ──────────────────────────────────
// Park the run at zero compute until the Close Room approves THIS action.
// The match is on the step's idempotency key so one event resumes one step.
const actionId = buildIdempotencyKey(payload.enrolmentId, i, sequenceStep.channel);
const approvalEvent = await step.waitForEvent(`await-approval-step-${i}`, {
  event: "oie/send.approved",
  match: "data.actionId",
  timeout: "7d",
  if: `async.data.actionId == "${actionId}"`,
});

// timeout => approvalEvent is null. Treat as still-pending: the gate will
// simulate/block. We DO NOT auto-approve on timeout (fail-closed).
const resolvedApproval: ApprovalState =
  approvalEvent?.data?.approval === "approved" ? "approved" : payload.approval;
```

Then change the `sendParams.approval` from `payload.approval` to `resolvedApproval` (line ~390). Everything else in the send `step.run` is unchanged: `evaluateSendGate` runs inside `executeSendStep` on resume, DRY_RUN is re-checked, and the AuditLog/Message rows are written as today. Record `approvedBy` and `approvalEvent === null` (timeout) in the send AuditLog payload.

Key correctness points (from the AGENTS.md invariants and the Inngest replay model):
- `buildIdempotencyKey` is already imported in `send-step.ts`; import it into `inngest.ts` too (it is exported from `./send-step`). Compute `actionId` deterministically so a replay produces the same match key.
- The suspend goes AFTER the post-sleep stop-check (so a reply during the wait still halts) and BEFORE the send `step.run`. `cancelOn: oie/sequence.stop` still cancels a run parked in `waitForEvent`.
- Do NOT memoise the approval into a `step.run`; `waitForEvent` is itself a durable suspend primitive and its result is durable. The gate re-evaluation stays inside `executeSendStep`.
- `timeout: "7d"` returns `null`, which maps to NOT approved (fail-closed). Never default the missing event to approved.

**1c. The regression test (the load-bearing acceptance check).** Add `src/sequencing/durable-approval.test.ts`. Because `inngest.ts` is typecheck-only (no running server in CI), test the SEMANTIC invariant the suspend protects without booting Inngest: model the resume-with-DRY_RUN-on path through `executeSendStep`, which is exactly what runs after resume.

```ts
import { describe, it, expect } from "vitest";
import { executeSendStep } from "./send-step";
import type { SendStepParams } from "./send-step";
import { evaluateSendGate } from "../send-gate";

// Simulate: run suspended at waitForEvent, received oie/send.approved with
// approval:"approved", resumed, but DRY_RUN is STILL ON. Must return simulate.
it("suspend -> approve -> resume with DRY_RUN on still simulates (never sends)", async () => {
  const calls: unknown[] = [];
  const sender = {
    name: "fake", isConfigured: () => true,
    async send(m: unknown) { calls.push(m); return { outcome: "sent", externalId: "x", provider: "fake" }; },
  };
  const resolvedApproval = "approved"; // the oie/send.approved event arrived
  const params: SendStepParams = {
    step: { channel: "email", delayHours: 0, templateId: "intro" },
    stepIndex: 0, enrolmentId: "enr-1",
    recipientEmail: "lead@x.com", fromEmail: "me@oie.ai", subject: "s", body: "b",
    dryRun: true,                 // <-- DRY_RUN still on after resume
    approval: resolvedApproval,   // <-- approval event was received
    channelEnabled: true, suppressions: [],
    emailSender: sender as never,
  };
  const result = await executeSendStep(params);
  expect(result.outcome).toBe("dry_run");        // simulate, not send
  expect(result.gateDecision.allowSend).toBe(false);
  expect(calls).toHaveLength(0);                  // adapter NEVER called
});

it("the gate independently confirms DRY_RUN beats a received approval", () => {
  const d = evaluateSendGate({ dryRun: true, approval: "approved", channel: "email", channelEnabled: true });
  expect(d.outcome).toBe("simulate");
  expect(d.allowSend).toBe(false);
});

it("timeout (no approval event) is fail-closed: pending, never sends", async () => {
  // approvalEvent === null => resolvedApproval falls back to payload.approval ("pending")
  const params: SendStepParams = {
    step: { channel: "email", delayHours: 0, templateId: "intro" },
    stepIndex: 0, enrolmentId: "enr-1",
    recipientEmail: "lead@x.com", fromEmail: "me@oie.ai", subject: "s", body: "b",
    dryRun: false,             // even with DRY_RUN off,
    approval: "pending",       // a timed-out approval must block
    channelEnabled: true, suppressions: [],
    emailSender: { name: "fake", isConfigured: () => true, async send() { throw new Error("must not send"); } } as never,
  };
  const result = await executeSendStep(params);
  expect(result.outcome).toBe("awaiting_approval");
  expect(result.gateDecision.allowSend).toBe(false);
});
```

**Acceptance check:** `pnpm --filter @oie/orchestration test` passes including the new file; the suspend-approve-resume-with-DRY_RUN-on case returns `"dry_run"`/`allowSend:false` and the fake adapter is never called; `pnpm --filter @oie/orchestration typecheck` passes (the `waitForEvent` call typechecks against `inngest@3.54.2`); `pnpm verify` is green. Manual: in `npx inngest-cli dev`, send `oie/sequence.enrol`, observe the run suspend at `await-approval-step-0`, send `oie/send.approved` with the matching `actionId`, observe resume and (with DRY_RUN on) a `dry_run` outcome.

### Task 2 (NOW): Emit the approval-request event so the Close Room has something to approve. Effort: S

The suspend is only useful if the operator knows an action is waiting. When the run reaches the suspend, it has already written nothing for the operator. Add a single `step.sendEvent` (or write an `AuditLog` + `Message` row with status `awaiting_approval`) immediately before `waitForEvent`, carrying `{ actionId, enrolmentId, stepIndex, channel, body, subject }`, so the approval queue can render the pending action and emit `oie/send.approved` back with the same `actionId`.

```ts
await step.run(`request-approval-step-${i}`, async () => {
  await prisma.auditLog.create({
    data: {
      actor: "orchestration",
      action: "message.awaiting_approval",
      entity: "Message",
      entityId: actionId,
      payload: { enrolmentId: payload.enrolmentId, stepIndex: i, channel: sequenceStep.channel, actionId },
    },
  });
});
```

This keeps the approval-queue contract (`actionId` round-trips unchanged) and means the Close Room mutation from apps/web Part 9 emits `oie/send.approved` with `data.actionId === actionId`.

**Acceptance check:** after enrolling, an `AuditLog` row with `action: "message.awaiting_approval"` and `entityId === buildIdempotencyKey(...)` exists before the run suspends; the round-trip `actionId` matches the `waitForEvent` `match`/`if`. `pnpm verify` green.

### Task 3 (NOW): Export the new event payload type and document the event contract. Effort: S

Add `SendApprovedPayload` to the `sequencing/index.ts` type re-exports (next to `EnrolContactPayload`, `StopEnrolmentPayload`) and to the root barrel via the existing `export * from "./sequencing/index"`. Add a one-paragraph "Events" section to `AGENTS.md` and `README.md` listing the three events this package owns: `oie/sequence.enrol`, `oie/sequence.stop`, and the new `oie/send.approved` (purpose, `match` key, fail-closed-on-timeout). No `.env` change is needed.

**Acceptance check:** `import { type SendApprovedPayload } from "@oie/orchestration"` typechecks from apps/web; `pnpm --filter @oie/orchestration typecheck` green; AGENTS.md/README list `oie/send.approved`.

## Next (1 to 3 months)

### Task 4 (NEXT): Declarative throttle + concurrency for channel caps and quiet hours. Effort: M

Move channel rate limits and quiet hours off ad-hoc checks and onto Inngest's platform flow control on `runEnrolment`'s `createFunction` config. Wire caps from `@oie/config` (not literals) so they stay one editable place. Grounded in the channel-limits and email-deliverability conventions:

```ts
inngest.createFunction(
  {
    id: "sequence-enrol",
    name: "Sequence: enrol contact",
    retries: 3,
    cancelOn: [ /* unchanged */ ],
    // Per-mailbox+channel cap: conservative, below the ceiling. Email per-mailbox
    // daily cap; LinkedIn well within ~100 connects/week; WhatsApp conservative.
    throttle: {
      key: "event.data.fromEmail + '|' + event.data.steps[0].channel",
      limit: CHANNEL_CAPS.perMailboxPerPeriod,   // from @oie/config
      period: CHANNEL_CAPS.period,               // e.g. "1d"
    },
    // One in-flight cadence per contact so steps never overlap/burst.
    concurrency: [{ key: "event.data.enrolmentId", limit: 1 }],
  },
  { event: "oie/sequence.enrol" },
  /* handler */
);
```

Quiet hours: keep the cadence-due time inside the working window by adjusting `nextDueAt`'s result before `step.sleepUntil` (a pure helper `clampToQuietHours(dueAt, windowConfig)` in `state-machine.ts`, `now`-injected, no env reads), so a step that would fire at 02:00 local sleeps until 09:00. This stays in the pure machine; the Inngest layer just sleeps until the clamped time. Add jitter (randomised human-like delay) via a deterministic-per-step offset derived from `actionId` so replays are stable but volume is not an exact pattern.

Caps belong in `@oie/config` as a typed `CHANNEL_CAPS` object: per-mailbox email daily cap, LinkedIn weekly/daily connect caps (well within ~100/week), WhatsApp pacing, and the quiet-hours window (UAE local, 09:00-18:00 for TDRA-relevant channels). LinkedIn and WhatsApp stay OFF by default (`channelEnabled` gate is independent of throttle).

**Acceptance check:** unit test `clampToQuietHours` (a 02:00 due-time clamps to 09:00; an in-window time is unchanged) with injected `now`; `throttle`/`concurrency` typecheck against `inngest@3.54.2`; manual in `inngest-cli dev` shows two rapid enrolments on the same mailbox queue rather than both firing. `pnpm verify` green. Note: throttle/concurrency only takes real effect under live volume, which is TDRA-gated; ship behind the live-send feature flag (Part 10, NEXT).

### Task 5 (NEXT): Wrap each waterfall provider call in its own `step.run`. Effort: M

So a retry memoises matched providers instead of re-billing them. The waterfall (`enrichCompanyWaterfall`) is currently provider-agnostic and pure-ish; keep it pure and instead wrap the per-provider call at the Inngest call site (or thread an injected `runStep` callback into the waterfall so the engine binding stays in `inngest.ts`). Preferred shape: an optional `options.runStep?: (id: string, fn: () => Promise<T>) => Promise<T>` on `WaterfallOptions`, defaulting to direct invocation in tests and bound to `step.run` in the Inngest function. This keeps Inngest-shaped config out of `waterfall.ts` while making each `provider.enrichCompany` call individually memoised.

**Acceptance check:** existing `waterfall.test.ts` still passes with the default direct `runStep`; a new test asserts each provider call is invoked through the injected `runStep` with a stable per-provider id; `pnpm verify` green.

## Later (post-PMF, gated)

- **AgentKit-on-Inngest (`@inngest/agent-kit`).** Adopt ONLY when a concrete agentic task the current `step.run`/`step.ai.infer` composition genuinely cannot express is named at the time. It runs on the same Inngest backend, so adoption is a new function file, not a migration. The router stays code-based and the LLM stays constrained to drafts/classification (invariant). Mastra is the swap candidate behind the same trigger. Neither is built now.
- **An engine migration** (Trigger.dev, Temporal, Restate, DBOS, Hatchet). Only on a named trigger: per-execution billing pain on many long cadences, the sleep cap blocking genuinely multi-week cadences, or one durable engine needing to span the TS pipeline and the external Python NOVA service. Temporal in NOVA-Python only if its voice loop needs crash-safe cross-phase durability; never replacing Inngest in the TS pipeline.
- **`step.ai.infer` for a deliberately-uncosted call.** Only if a Claude call is intentionally excluded from the OTel/cost chokepoint (currently none), and only if Inngest's gateway can be pointed at our own `LlmClient` endpoint to preserve the span and cost record.

## Contracts / interfaces touched (exact names)

- New exported type: `SendApprovedPayload` (in `src/sequencing/inngest.ts`, re-exported via `src/sequencing/index.ts` and the root barrel).
- New event name owned by this package: `oie/send.approved` (alongside `oie/sequence.enrol`, `oie/sequence.stop`).
- Functions edited: `runEnrolment` (`src/sequencing/inngest.ts`) gains `step.waitForEvent("await-approval-step-${i}", ...)`, a `request-approval-step-${i}` `step.run`, and `resolvedApproval` feeding `sendParams.approval`. (NEXT) its `createFunction` config gains `throttle` and `concurrency`.
- Unchanged-but-reused: `evaluateSendGate`, `SendGateDecision`, `ApprovalState` (`src/send-gate.ts`); `executeSendStep`, `buildIdempotencyKey`, `SendStepParams` (`src/sequencing/send-step.ts`); `inngest`, `registerAdapters`, `sequencingFunctions`, `inngestFunctions`.
- (NEXT) New pure helper `clampToQuietHours` and new `WaterfallOptions.runStep` (`src/sequencing/state-machine.ts`, `src/waterfall.ts`); new `CHANNEL_CAPS` config object in `@oie/config`.
- New test files: `src/sequencing/durable-approval.test.ts` (NOW); quiet-hours and per-provider-step tests (NEXT).

## Verification (how each task is proven done)

- **Task 1:** `pnpm --filter @oie/orchestration test` includes `durable-approval.test.ts` and the suspend-approve-resume-with-DRY_RUN-on case returns `dry_run`/`allowSend:false` with zero adapter calls; the timeout case is fail-closed (`awaiting_approval`); `pnpm --filter @oie/orchestration typecheck`; manual `npx inngest-cli dev` run shows suspend at `await-approval-step-0` then resume on `oie/send.approved`.
- **Task 2:** an `AuditLog` row `message.awaiting_approval` with `entityId === buildIdempotencyKey(...)` is written before suspend; round-trip `actionId` matches.
- **Task 3:** `import { type SendApprovedPayload } from "@oie/orchestration"` typechecks; AGENTS.md/README list the three events.
- **Task 4 (NEXT):** `clampToQuietHours` unit test (02:00 -> 09:00; in-window unchanged); `throttle`/`concurrency` typecheck; `inngest-cli dev` shows same-mailbox enrolments queueing.
- **Task 5 (NEXT):** `waterfall.test.ts` green with default `runStep`; new test asserts per-provider memoisation via injected `runStep`.
- **Every task:** the repo gate `pnpm verify` (typecheck + lint + test + build) is green; the default-deny send-gate posture test in `send-gate.test.ts` and `sequencing.test.ts` still passes unchanged.

## Risks and do-not

- **DO NOT** memoise `evaluateSendGate` or the approval result inside a `step.run`. The gate must re-evaluate on every execution including resume; only persistence/IO is memoised. A memoised approval would let DRY_RUN be replayed away. This is the single most dangerous mistake on this path.
- **DO NOT** auto-approve on `waitForEvent` timeout. `approvalEvent === null` must map to NOT approved (fail-closed). Never default a missing event to `"approved"`.
- **DO NOT** flip DRY_RUN, write or read any disable-flag token (the content-based guard hook rejects it even in docs and tests; reword), or add any code path that sends without `decision.allowSend === true`.
- **DO NOT** use `step.ai.infer` for any traced/costed Claude call: it bypasses `LlmClient.complete()`, dropping the OTel span and `CostRecord` and splitting the chokepoint.
- **DO NOT** migrate engines or adopt an agent framework now; both are Later, trigger-gated.
- **DO NOT** put Inngest-shaped config outside `sequencing/inngest.ts` (throttle/concurrency/waitForEvent), so a future engine port rewrites one file. Quiet-hours math stays in the pure `state-machine.ts`.
- **Replay-determinism risk:** compute `actionId` from `buildIdempotencyKey(enrolmentId, i, channel)` (deterministic), not from any wall-clock or random value, so the `waitForEvent` `match`/`if` resolves identically across replays. Reconstruct Dates from ISO strings out of `step.run` (JSON-serialised), as the existing `advance-state-step` already does.
- **Volume/compliance risk:** throttle/concurrency only matters under live volume, which is TDRA-gated and on a separate clock per DATA-ACQUISITION.md. Ship it behind the live-send feature flag (Part 10) so it cannot enable at-scale sending before TDRA approval; warm 1:1 outreach (the only active outreach now) does not run through this engine at volume.
- **Inngest version note:** verified against `inngest@3.54.2`. Re-confirm the `step.waitForEvent` `match` vs `if` option semantics against the installed version's d.ts before merge (both are supported; `match` is the simple path-equality form, `if` is the expression form used here for the interpolated `actionId`).
