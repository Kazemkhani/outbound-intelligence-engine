# AGENTS.md: `@oie/core`

Operating guide for an AI agent changing code in `packages/core`. Read this fully before editing. The
scoring engine here is the crown jewel of OIE (Outbound Intelligence Engine, the lead-intelligence layer
of Huscribe Revenue OS): it is pure, deterministic, explainable, and unit-tested. **The LLM never computes
a score. Code does, deterministically.** Violating that is a product-level failure, not a style nit.

## Purpose

`@oie/core` holds the vendor-free, persistence-free business logic that is OIE's differentiation:

- Domain enums and Zod schemas shared across the monorepo.
- The deterministic ICP scoring engine: fit, intent-with-decay, composite blend, tiering, and a full
  explainable rationale per lead.
- Pure dedupe and matching primitives reused by every adapter and the normalisation layer.

It depends on nothing internal (only `zod`). It is consumed by `@oie/db`, `@oie/integrations`,
`@oie/orchestration`, and `apps/web`. Internal packages are consumed as TS source (no JS emit); Vitest and
`tsx` transpile.

## Key files & where things live

| File                     | What lives here                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`           | Domain enums + Zod: `seniority`, `signalType`, `emailStatus`, `channel`, `tier` (A/B/C/D), `weight` (`[0,1]`)  |
| `src/icp.ts`             | `icpProfile` Zod schema + `IcpProfile`, `Firmographics`, `SignalCriterion` types. The scoring config contract |
| `src/subject.ts`         | `ScoringSubject` = `CompanyFacts` + `ContactFacts` + `SignalFact[]`. The vendor-agnostic input to the engine  |
| `src/scoring.ts`         | Pure primitives: `clampScore`, `weightedScore`, `compositeScore`, `signalDecayFactor`, `assignTier`           |
| `src/scoring-engine.ts`  | **The engine.** `scoreLead(subject, icp, now)`, `rankByComposite`, `SCORING_MODEL_VERSION`, fit/intent logic  |
| `src/match.ts`           | `norm`, `fuzzyEquals`, `matchesAny`, `countMatches`, `haversineKm`, `combineDiminishing`                       |
| `src/dedupe.ts`          | Identity normalisers + dedupe keys for company / contact / signal                                              |
| `src/signal-windows.ts`  | `DEFAULT_SIGNAL_TTL_DAYS` per signal type + `signalExpiry`. Single source of decay-window policy              |
| `src/index.ts`           | Barrel: re-exports everything. New public symbols must be reachable through here                               |
| `src/__fixtures__/leads.ts` | `testIcp`, `NOW`, and the labelled lead fixtures used across tests                                          |
| `*.test.ts`              | Vitest suites colocated next to each module                                                                    |

Anchor docs: ADR `docs/adr/0008-deterministic-scoring-engine.md` and the `scoring-conventions` skill
(`.claude/skills/scoring-conventions`). Read the skill before changing fit/intent/composite/tier logic.

## Public contracts / exports

Everything is re-exported from `src/index.ts`. Primary surface:

- `scoreLead(subject: ScoringSubject, icp: IcpProfile, now: Date): ScoreResult`, the deterministic score.
  Returns `{ fit, intent, composite, tier, modelVersion, rationale }` where `rationale.fit` carries
  `{ score, coverage, components }` and `rationale.intent` carries `{ score, criteria }`.
- `rankByComposite(items)`, stable ordering by `composite` descending.
- `SCORING_MODEL_VERSION` (currently `"scoring-v1"`), stamped onto every score; bump on any computation change.
- Schemas: `icpProfile`, `firmographics`, `technographics`, `peopleCriteria`, `signalCriterion`,
  `keywordsCriteria`, `compositeBlend`, `tierThresholds`, plus the enum schemas in `types.ts`.
- Primitives: `clampScore`, `weightedScore`, `compositeScore`, `signalDecayFactor`, `assignTier`.
- Dedupe: `normaliseDomain`, `normaliseEmail`, `normaliseLinkedinUrl`, `companyDedupeKey`,
  `contactDedupeKey`, `signalDedupeKey`.
- Matching: `haversineKm`, `combineDiminishing`, `fuzzyEquals`, `matchesAny`, `countMatches`, `norm`.
- Signal windows: `DEFAULT_SIGNAL_TTL_DAYS`, `signalExpiry`.

## Invariants (YOU MUST / NEVER)

- **NEVER** let an LLM compute, adjust, or emit any number in `fit`, `intent`, `composite`, or a tier.
  Models extract and reason over source text; this package turns facts into the number. No exceptions.
- **YOU MUST** keep the engine pure. The only non-pure input is `now: Date`, passed by the caller.
  **NEVER** call `Date.now()`, `new Date()` (without args), `Math.random()`, read env, do I/O, or mutate
  inputs anywhere in the scoring path. Same input plus same `now` must yield byte-identical output.
- **YOU MUST** treat missing data as `unknown`: it contributes zero and is recorded with `known: false`.
  **NEVER** infer, default, or guess a missing field. Absence lowers `coverage`, it does not invent a value.
- **YOU MUST** keep scores on the `[0,100]` scale and route every externally derived number through
  `clampScore`. Tiers are A/B/C/D where D is the implicit "below C" bucket.
- **YOU MUST** honour weight-0 semantics: a dimension or signal criterion with `weight <= 0` is excluded
  from the computation entirely (it is not a zero-scored component). See `scoreLead`'s `c.weight > 0` filter.
- **YOU MUST** compute `composite` as `compositeBlend.fit * fit + compositeBlend.intent * intent`; the blend
  is schema-validated to sum to 1. **NEVER** hardcode 0.6/0.4 (that is only the seed default).
- **YOU MUST** combine multiple signals of one type with diminishing returns (`combineDiminishing`, a
  probabilistic OR). **NEVER** sum them, and never let many weak/stale signals outscore one strong fresh one.
- **YOU MUST** keep signal decay monotonic to zero at `expiresAt` (linear today; `signalDecayFactor`). An
  expired signal contributes exactly zero. No-expiry signals do not decay.
- **YOU MUST** keep this package free of vendor types, Prisma, network, and filesystem. Adapters normalise
  into `CompanyFacts` / `ContactFacts` / `SignalFact`; the engine never sees a vendor field.
- **YOU MUST** validate external/LLM-shaped input with the Zod schemas at the boundary before scoring.
  TS strict, no `any` without a one-line reason.
- **YOU MUST** bump `SCORING_MODEL_VERSION` whenever the computed number can change for the same input.
  Persisted scores carry it so the control plane can detect stale scores and recompute.
- **NEVER** add channel sends, dialing, secrets, or DRY_RUN handling here. That is `@oie/orchestration` and
  `@oie/integrations`. This package only ranks; it never acts.

## How to make a change safely

1. Read the target file plus the `scoring-conventions` skill and ADR-0008. Identify the invariants above
   that your change touches.
2. Make the smallest change. New public symbol? Export it from its module and confirm it flows through
   `src/index.ts`.
3. Changing fit/intent/composite/tier math? First decide whether the output number can change for an
   existing input. If yes, **bump `SCORING_MODEL_VERSION`** in `scoring-engine.ts` in the same change.
4. Add or update colocated `*.test.ts`. Use `src/__fixtures__/leads.ts` (`testIcp`, `NOW`, the labelled
   leads). Cover the edge cases the conventions require: empty signals, all-unknown fields, boundary
   thresholds, expired signals, decay at mid-window, and a determinism assertion (`a` equals `b`).
5. Run, from the repo root:
   - `pnpm --filter @oie/core test`
   - `pnpm --filter @oie/core typecheck`
   - Single file while iterating: `pnpm --filter @oie/core test <path>`
6. Before claiming done, run the full gate: `pnpm verify` (typecheck + lint + test + build).
7. If your change alters the schema in `icp.ts`, coordinate with `@oie/db` (the persisted ICP) and the
   seed; a schema change without a migration/seed update will break downstream packages.

## Do / Don't

- DO inject `now` and thread it through every time-dependent call. DON'T read the clock inside the engine.
- DO add a new fit dimension as its own `*Component(facts, icp)` returning a `FitComponent`, then wire it
  into the `candidates` array in `scoreLead`. DON'T inline scoring logic into the weighted sum.
- DO write a human-readable `detail` for every component/criterion so the rationale stays explainable.
  DON'T return a bare number with no provenance.
- DO use `matchesAny` / `fuzzyEquals` for string comparison (case-insensitive, bidirectional substring).
  DON'T do raw `===` on user/vendor strings.
- DO keep new helpers pure and unit-test them in isolation. DON'T reach for dates, randomness, or I/O.
- DON'T change tier letters, the `[0,100]` scale, or the weight `[0,1]` range; downstream code and the
  schema depend on them.
- DON'T introduce a dependency beyond `zod` without a strong reason; this package is intentionally lean.

## Worked examples

### 1. Trace a tier-A lead

`scoreLead(perfectLead, testIcp, NOW)` (fixtures). Flow:

- Fit: each configured dimension (`weight > 0`) becomes a `FitComponent`. `perfectLead` hits industry
  (`jewellery`), employee count (45 within 10..200), geography (Dubai region), local category, two target
  tools (`Odoo`, `Tally` → full technographics credit), and the persona (title `Owner` + c_level + sales).
  `weightedScore` over those lands fit at or above 90. `coverage` reflects the share of `known` components.
- Intent: signals are grouped per ICP criterion. The fresh `hiring` (strength 0.9, mid-window) decays
  slightly, `tech_adoption` (0.7) contributes, and the unfired `funding` criterion holds intent near 60.
  `combineDiminishing` prevents stacking. `weightedScore` over criteria → intent above 55.
- Composite: `0.6 * fit + 0.4 * intent` clears 80 → `assignTier` returns `A` (threshold A = 80).
- The test asserts exactly this (`scoring-engine.test.ts`, "scores a near-perfect lead ... as tier A").

### 2. Add a new fit dimension (sketch)

To add, say, a `fundingStage` firmographic dimension:

1. Extend `firmographics` in `icp.ts` with `fundingStage: z.object({ values: z.array(z.string()), weight })`.
2. Add `fundingStageComponent(c: CompanyFacts, icp): FitComponent` in `scoring-engine.ts`, mirroring
   `revenueComponent`: set `known` from presence, `score` 100 on `matchesAny`, write a `detail`.
3. Push it into the `candidates` array in `scoreLead`. The `weight > 0` filter handles disabled configs;
   `weightedScore` re-normalises automatically (no manual weight bookkeeping).
4. Add a `CompanyFacts.fundingStage` field in `subject.ts` (optional, may be null = unknown).
5. Bump `SCORING_MODEL_VERSION` (numbers change for existing inputs that have this fact).
6. Add fixtures + tests, then `pnpm verify`. Coordinate the schema change with `@oie/db` and the seed ICP.

## Gotchas

- `weightedScore` re-normalises by total weight, so fit stays on a stable 0..100 scale no matter how many
  dimensions are configured. Adding a dimension does not silently deflate every other score's contribution
  the way a fixed-denominator sum would, but it does change relative weighting; re-baseline thresholds if
  needed.
- Weight 0 means "not configured" (excluded), not "scored zero". `testIcp` sets `revenueBand` and
  `keywords` to weight 0, so they never appear in `rationale.fit.components`. Don't confuse this with an
  `unknown` (weight kept, `known: false`, score 0, counts against `coverage`).
- `signalDecayFactor` returns 1 (no decay) when `expiresAt` is null. Decay only happens for signals with an
  expiry. Use `signalExpiry` / `DEFAULT_SIGNAL_TTL_DAYS` to set expiries consistently at ingestion; adapters
  must not invent their own windows.
- Intent criterion matching: `signalMatchesCriterion` requires `signal.type === criterion.type`, and if the
  criterion `config.keywords` is a non-empty array, the keywords must appear in the signal's stringified
  `evidence`. An empty/absent `keywords` matches all signals of that type.
- Technographics is disqualifying: any `avoids` hit forces the component to 0 regardless of `uses` matches.
  Keywords is similar: any `exclude` hit forces 0.
- `combineDiminishing` is `1 - Π(1 - sᵢ)` over `[0,1]` strengths. It is order-independent and saturating;
  don't replace it with a sum or an average without updating the conventions and the decay test.
- `clampScore(NaN) === 0`. Division-by-zero guards already exist (`weightedScore` returns 0 on zero total
  weight); preserve them.
- This is TS source consumed directly (no build artifact). `pnpm --filter @oie/core build` runs `tsc
  --noEmit`; there is no `dist` to ship. Don't add a bundling step.
