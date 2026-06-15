# @oie/core

The domain core: shared types, Zod schemas, deduplication, matching, and the deterministic ICP scoring engine. Pure, unit-tested, and dependency-free of any vendor or persistence concern.

## Purpose

Hold the business logic that is OIE's differentiation — above all the scoring engine. **Code computes the number, never the LLM** (see [ADR-0008](../../docs/adr/0008-deterministic-scoring-engine.md)). The package depends on nothing internal and is consumed by `db`, `integrations`, `orchestration` and `web`.

## What it owns

- **Domain enums and schemas** (`types.ts`) — `Seniority`, `SignalType`, `EmailStatus`, `Channel`, `Tier`, weights, and the Zod schemas validating them.
- **The scoring engine** (`scoring-engine.ts`, `scoring.ts`) — fit, intent-with-decay, composite blend, tiering, rationale.
- **Deduplication** (`dedupe.ts`) — domain/email/LinkedIn-URL normalisation and dedupe keys.
- **Matching** (`match.ts`) — fuzzy equality, haversine distance, diminishing-returns combine.
- **ICP and signal helpers** (`icp.ts`, `signal-windows.ts`, `subject.ts`).

## Key exports

| Export                                                                             | Purpose                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scoreLead(subject, icp, now)`                                                     | the deterministic score: fit, intent, composite, tier, rationale, coverage. `now` is injected — never reads the clock |
| `rankByComposite(items)`                                                           | deterministic ordering by composite score                                                                             |
| `SCORING_MODEL_VERSION`                                                            | the model version stamped onto every `Score`                                                                          |
| `compositeScore`, `signalDecayFactor`, `assignTier`, `weightedScore`, `clampScore` | scoring primitives                                                                                                    |
| `companyDedupeKey`, `contactDedupeKey`, `signalDedupeKey`                          | dedupe keys                                                                                                           |
| `normaliseDomain`, `normaliseEmail`, `normaliseLinkedinUrl`                        | normalisers                                                                                                           |
| `haversineKm`, `combineDiminishing`, `fuzzyEquals`, `matchesAny`, `countMatches`   | matching primitives                                                                                                   |

See the [`scoring-conventions`](../../.claude) skill for the canonical fit/intent/composite/tier conventions before changing the engine.

## How to test

```bash
pnpm --filter @oie/core test       # determinism, tier-A perfect lead, all-unknown fit=0,
                                   # expired-signal intent=0, decay-at-mid-window, ranking
pnpm --filter @oie/core typecheck
```

## How it fits

`core` is the brain. The orchestration layer feeds it normalised subjects (via the scoring bridge) and persists the resulting `Score`. Because scoring is pure and `now` is injected, editing the ICP triggers a recompute with no LLM cost and an instant live re-rank in the control plane.
