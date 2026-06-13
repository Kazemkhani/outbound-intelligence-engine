---
name: scoring-conventions
description: Canonical conventions for OIE's deterministic ICP scoring engine — fit, intent-with-decay, composite, tiering, rationale. Use when writing or reviewing anything in packages/core scoring.
---

# Scoring conventions

The scoring engine is the crown jewel. It is pure, deterministic, explainable, and unit-tested. **The LLM extracts and reasons over source text; code computes the number.** A model must never emit a score, and the engine must never fabricate a data point.

## Determinism
- Same input → same output, always. The only injected non-pure input is `now` (for decay) — pass it in; never read the clock inside the engine.
- Missing data contributes zero and is recorded as `unknown` — never inferred or guessed. Absence lowers confidence, it does not invent a value.

## Fit score (0–100)
- Weighted sum over firmographics (industries, employee count, revenue band, geography/radius, local category), technographics (`uses` rewarded, `avoids` penalised), people (titles, seniority, departments), and keywords (include/exclude).
- Weights come from the active `ICPProfile`; each dimension carries a `Weight` in 0..1. Normalise the weighted contributions so fit lands on a stable 0–100 scale regardless of how many dimensions are configured.
- Geography radius uses the `radiusKm` centre/radius; inside → full geo credit, outside → zero, with no partial fudge unless a documented distance falloff is specified.

## Intent score (0–100) with decay
- Driven by `Signal` records. Each signal has a base `strength` by type (e.g. funding, hiring, tech_adoption, job_change, news, web_change) and an `expiresAt`.
- Apply time-decay between `detectedAt` and `now` (a monotonic falloff to zero at/after `expiresAt`). A stale signal contributes less; an expired signal contributes nothing.
- Combine multiple signals with diminishing returns (do not let ten weak signals outscore one strong fresh one). Document the combination rule and test it.

## Composite and tiers
- `composite = compositeBlend.fit * fit + compositeBlend.intent * intent` (blend sums to 1; seed ICP is fit 0.6 / intent 0.4).
- Tier from `tierThresholds`: A ≥ threshold.A, B ≥ threshold.B, C ≥ threshold.C, else untiered. Seed: A ≥ 80, B ≥ 65, C ≥ 50.

## Rationale
- Every `Score` carries a human-readable rationale citing which factors contributed and by how much, so an operator can see why a lead ranks where it does. The rationale describes the deterministic computation; it is not an LLM free-write of the number.

## Recompute
- Scores recompute when the ICP changes (new version) or when signals change/decay. Store `modelVersion` and `computedAt`.

## Testing
- Unit tests with fixtures for fit, intent decay, composite blend, tiering, and edge cases (empty signals, all-unknown fields, boundary thresholds, expired signals). Plus an eval set of labelled leads + ICP for regression.
