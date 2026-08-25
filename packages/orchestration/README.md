# @oie/orchestration

The orchestration brain: the enrichment waterfall, signal collection, the scoring bridge, the sequencing state machine, the durable Inngest functions, signal-triggered enrolment, cost caps, and the **send gate**, the code-level rail that nothing sends without.

> Working in this package with an AI agent? Read [AGENTS.md](./AGENTS.md) first. It documents the invariants (DRY_RUN defaults true, mandatory approval, gate-first send path), the public contracts, and how to change things safely.

## Purpose

Own the cascade and the control that sit between the bought rails and the data model. The waterfall and provider-fallback logic live here, not inside any vendor. Depends on `@oie/core`, `@oie/db` and `@oie/integrations`.

## What it owns

- **The send gate** (`send-gate.ts`), `evaluateSendGate` requires `DRY_RUN` off **and** explicit human approval for a real send; LinkedIn/WhatsApp need a third channel-enabled gate. Pure and total. See [ADR-0009](../../docs/adr/0009-send-gate-and-dry-run.md).
- **The enrichment waterfall** (`waterfall.ts`), `enrichCompanyWaterfall`: priority order, fill-missing with per-field attribution, early-stop on completeness (cost ceiling), fall-through on error, skip unconfigured.
- **Signal collection** (`collect-signals.ts`), `collectSignals`: cross-provider and re-pull dedup (keep-stronger), central decay-window assignment, continue past errors.
- **The scoring bridge** (`scoring-bridge.ts`), maps normalised DTOs to a `ScoringSubject` for `@oie/core`.
- **Sequencing** (`sequencing/`), the state machine (`advance`, `nextDueAt`, `shouldStop`, `applyBranch`), `executeSendStep` (routes every send through the gate, checks suppression first, builds idempotency keys), and the durable Inngest functions.
- **Enrolment** (`enrolment/`), `qualifiesForEnrolment` (fresh + at-bar + qualifying type, through the gate) and the cost caps (`costCapStatus`, `assertWithinCaps`).

## Key exports

| Export                                                                                | Purpose                    |
| ------------------------------------------------------------------------------------- | -------------------------- |
| `evaluateSendGate`, `isRealSendAllowed`, `SendBlockedError`                           | the send gate              |
| `enrichCompanyWaterfall`, `mergeCompany`                                              | the enrichment cascade     |
| `collectSignals`                                                                      | the signal fan-in          |
| `toScoringSubject` and the `*FromNormalised` mappers                                  | the scoring bridge         |
| `executeSendStep`, `buildIdempotencyKey`                                              | the gated send step        |
| `advance`, `nextDueAt`, `shouldStop`, `applyBranch`                                   | the sequence state machine |
| `inngest`, `sequencingFunctions`, `runEnrolment`, `stopEnrolment`, `registerAdapters` | the durable runtime        |
| `qualifiesForEnrolment`, `costCapStatus`, `assertWithinCaps`                          | enrolment and cost caps    |

## How to test

```bash
pnpm --filter @oie/orchestration test    # send-gate, waterfall, collect-signals,
                                         # sequencing, enrolment, e2e pipeline
pnpm --filter @oie/orchestration typecheck
```

Sequencing and send tests prove a multi-step cadence runs in dry-run, respects idempotency, and that nothing sends without approval.

## How it fits

This package is OIE's conductor: it calls `@oie/integrations` adapters in priority order, maps validated facts into the deterministic engine in `@oie/core`, persists through `@oie/db`, and exposes durable Inngest functions. The send gate is wired first on every send path; never weaken it. See [AGENTS.md](./AGENTS.md) for the full operating contract.
