# @oie/core

The domain core: shared types, Zod schemas, deduplication, matching, and the deterministic ICP scoring
engine. Pure, unit-tested, and free of any vendor or persistence concern.

> AI agents: read [AGENTS.md](./AGENTS.md) before editing. It has the hard invariants and the safe-change
> checklist for this module.

## Purpose

Hold the business logic that is OIE's differentiation, above all the scoring engine. **Code computes the
number, never the LLM** (see [ADR-0008](../../docs/adr/0008-deterministic-scoring-engine.md)). The package
depends on nothing internal (only `zod`) and is consumed by `db`, `integrations`, `orchestration`, and `web`.

## What it owns

- **Domain enums and schemas** (`types.ts`): `Seniority`, `SignalType`, `EmailStatus`, `Channel`, `Tier`,
  weights, and the Zod schemas validating them.
- **The scoring engine** (`scoring-engine.ts`, `scoring.ts`): fit, intent-with-decay, composite blend,
  tiering, rationale.
- **Deduplication** (`dedupe.ts`): domain / email / LinkedIn-URL normalisation and dedupe keys.
- **Matching** (`match.ts`): fuzzy equality, haversine distance, diminishing-returns combine.
- **ICP and signal helpers** (`icp.ts`, `signal-windows.ts`, `subject.ts`).

## Key exports

| Export                                                                             | Purpose                                                                                                              |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `scoreLead(subject, icp, now)`                                                     | the deterministic score: fit, intent, composite, tier, rationale, coverage. `now` is injected, never read from clock |
| `rankByComposite(items)`                                                           | deterministic ordering by composite score                                                                            |
| `SCORING_MODEL_VERSION`                                                            | the model version stamped onto every `Score`                                                                         |
| `compositeScore`, `signalDecayFactor`, `assignTier`, `weightedScore`, `clampScore` | scoring primitives                                                                                                   |
| `icpProfile` and the schema family                                                 | Zod validation for the ICP config at the boundary                                                                    |
| `companyDedupeKey`, `contactDedupeKey`, `signalDedupeKey`                          | dedupe keys                                                                                                          |
| `normaliseDomain`, `normaliseEmail`, `normaliseLinkedinUrl`                        | identity normalisers                                                                                                 |
| `haversineKm`, `combineDiminishing`, `fuzzyEquals`, `matchesAny`, `countMatches`   | matching primitives                                                                                                  |
| `DEFAULT_SIGNAL_TTL_DAYS`, `signalExpiry`                                          | signal decay-window policy                                                                                           |

The canonical fit / intent / composite / tier conventions live in the `scoring-conventions` skill
(`.claude/skills/scoring-conventions`). Read it before changing the engine.

## Install / use

Internal workspace package, consumed as TS source (no build artifact):

```ts
import { scoreLead, icpProfile, type ScoringSubject } from "@oie/core";

const icp = icpProfile.parse(rawIcpConfig); // validate at the boundary
const result = scoreLead(subject, icp, new Date()); // caller owns `now`
// result: { fit, intent, composite, tier, modelVersion, rationale }
```

## Test

```bash
pnpm --filter @oie/core test       # determinism, tier-A perfect lead, all-unknown fit=0,
                                   # expired-signal intent=0, decay-at-mid-window, ranking
pnpm --filter @oie/core typecheck
```

`pnpm verify` (from the repo root) runs the full gate: typecheck + lint + test + build.

## How it fits

`core` is the brain. The orchestration layer feeds it normalised subjects and persists the resulting
`Score`. Because scoring is pure and `now` is injected, editing the ICP triggers a recompute with no LLM
cost and an instant live re-rank in the control plane (Outbound Intelligence Engine).
