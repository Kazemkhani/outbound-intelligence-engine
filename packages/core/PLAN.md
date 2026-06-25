# packages/core Plan

> Keep the deterministic scoring engine pure and code-owned, and widen only its TYPE seam (SignalType enum + decay-window policy + the SignalFact boundary) so DLD/transaction intent signals can flow in without the LLM ever touching the number. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`@oie/core` is the crown-jewel deterministic scorer. It depends on nothing internal (only `zod`), ships as TS source (no JS emit; `build` is `tsc --noEmit`), and is consumed by `@oie/db`, `@oie/integrations`, `@oie/orchestration`, and `apps/web`.

Verified facts in the actual source:

- `src/scoring-engine.ts`: `scoreLead(subject: ScoringSubject, icp: IcpProfile, now: Date): ScoreResult` is pure and total. Fit is a `weightedScore` over per-dimension `FitComponent`s (industry, employeeCount, revenue, geography, localCategory, technographics, people, keywords); only `weight > 0` dimensions participate. Intent is a `weightedScore` over `IntentCriterionResult`s, one per ICP `signalCriterion`, each combining per-type signals with `combineDiminishing` after `signalDecayFactor`. `composite = compositeBlend.fit*fit + compositeBlend.intent*intent`; `assignTier` maps it to A/B/C/D. `SCORING_MODEL_VERSION = "scoring-v1"` is stamped on every result. The full `rationale` is returned (prose `detail` strings per component/criterion plus `coverage`).
- `src/scoring.ts`: pure primitives `clampScore`, `weightedScore`, `compositeScore`, `signalDecayFactor` (linear, monotonic to 0 at `expiresAt`, `1` when no expiry), `assignTier`.
- `src/types.ts`: `signalTypeValues = ["hiring","funding","tech_adoption","job_change","news","web_change"]` with `signalType = z.enum(...)` and `type SignalType`. Also `seniority`, `emailStatus`, `channel`, `tier` (A/B/C/D), `weight` (`z.number().min(0).max(1)`).
- `src/signal-windows.ts`: `DEFAULT_SIGNAL_TTL_DAYS: Record<SignalType, number>` (funding 90, tech_adoption 60, job_change 45, hiring 30, news 30, web_change 21) and `signalExpiry(type, detectedAt, ttlDays?)`. The `Record<SignalType, number>` typing means adding an enum value is a COMPILE ERROR until a TTL is added here: the type system already enforces the policy/enum coupling.
- `src/subject.ts`: `ScoringSubject = { company: CompanyFacts; contact: ContactFacts; signals: SignalFact[] }`. `SignalFact = { type: SignalType; strength: number /*0..1 pre-decay*/; detectedAt: Date; expiresAt?: Date|null; evidence?: Record<string,unknown> }`. Every field optional/nullable; missing = unknown, never guessed.
- `src/icp.ts`: `icpProfile` Zod schema; `signalCriterion = { type: signalType; config: z.record(z.unknown()); weight }`. `compositeBlend` refined to sum to 1; `tierThresholds` refined A>=B>=C.
- `src/match.ts`: `norm`, `fuzzyEquals`, `matchesAny`, `countMatches`, `haversineKm`, `combineDiminishing` (`1 - Π(1-sᵢ)`).
- `src/dedupe.ts` + tests, `src/__fixtures__/leads.ts` (`testIcp`, `NOW = 2026-06-14`, labelled leads), colocated `*.test.ts` (scoring-engine, scoring, signal-windows, dedupe).
- Barrel `src/index.ts` re-exports every module. `AGENTS.md` and `docs/adr/0008-deterministic-scoring-engine.md` are the anchor docs.

The seam OUT of core is `packages/orchestration/src/scoring-bridge.ts`: `signalFactFromNormalised(s: NormalisedSignal): SignalFact` maps `s.type` straight through. `NormalisedSignal.type: SignalType` lives in `packages/integrations/src/contracts/model.ts`. The PredictLeads mapper (`packages/integrations/src/predictleads/mapper.ts`) is the existing template for "vendor category -> SignalType + base strength" mapping done in the ADAPTER, not core.

What is NOT here today and per the research must NOT move here: any DLD/Dubai Pulse HTTP, OAuth token-refresh, CSV ingest, or vendor parsing (that is `packages/integrations` + a `step.run` in `packages/orchestration`). No `transaction_spike`/`off_plan_launch` enum values yet. No promptfoo wiring (the eval harness lives in `packages/integrations/src/llm/evals`, not here).

## Target architecture for this module (from the research)

The first invariant is non-negotiable and this module IS that invariant: "Deterministic scoring stays in code. The LLM never emits the number. The scoring engine in `packages/core` is untouched by every tool here" (TARGET-ARCHITECTURE Part on the four invariants, and §"What we deliberately do NOT adopt"). So for `packages/core` the architecture is mostly a NEGATIVE spec: keep it pure, keep it the leaf nothing leaks into, and resist the pull to put adapters, evals, or observability here.

The one POSITIVE change the roadmap assigns to this package is the type seam that feeds the DLD differentiator (Top bet #2, Part 5):

- "Add new SignalType enum values to `signalTypeValues` in `packages/core/src/types.ts` (`transaction_spike`, and `off_plan_launch` only once its source is settled per (a) or (b)) BEFORE mapping, and give them TTLs in `DEFAULT_SIGNAL_TTL_DAYS` in `signal-windows.ts`." (Part 5, Integration.)
- Sequencing: `transaction_spike` is REAL and FREE (Dubai Pulse `dld_transactions-open`), so its enum value + TTL are buildable now. `off_plan_launch` is gated: its SOURCE must first be settled (free first-registration-spike proxy from open data, or Oqood onboarding), and per the architecture its enum value lands "only once its source is settled." The 1-day DLD spike (in `packages/integrations`/docs, NOT core) gates all of it; the spike confirms data freshness, OAuth/token lifetime, limits, and commercial licensing.
- The decay window is a real product decision, not a copy-paste: a "transaction spike THIS WEEK" signal is only differentiating if it is short-lived. The TTL must reflect that the signal is a timing trigger, not a quarter-long fact.

What stays a SEAM vs a LEAF (the explicit answer the focus asks for):

- SEAM (stable, widened carefully, lives in core forever): the `SignalType` enum, the `DEFAULT_SIGNAL_TTL_DAYS` decay-window policy, the `SignalFact`/`ScoringSubject` shape, the `signalCriterion` ICP contract, and `SCORING_MODEL_VERSION`. Adapters normalise INTO these; the engine reads them. These are the anti-corruption boundary on the intent side.
- LEAF (must never enter core): the DLD HTTP client, OAuth token refresh, CSV rebuild, Dubai-Pulse field shapes, the "DLD category -> SignalType + base strength" mapping table, and per-field provenance. All of that is `packages/integrations` (adapter) plus a `step.run` in `packages/orchestration`. Core never imports a vendor type, never does I/O, never sets its own expiry window from a vendor.

The Next item for this module is the eval lens: promptfoo (Part 2, Top bet #3) evaluates the scoring RATIONALE PROSE only, via an `llm-rubric` judge, and NEVER the tier/number. The rationale strings `scoreLead` already emits are the eval target. The judge lives in the eval harness (`packages/integrations/src/llm/evals` -> promptfoo), not in core; core's only job is to keep emitting deterministic, explainable `detail` prose and to expose a stable export so promptfoo can snapshot real scored leads. Code still judges the number (promptfoo `javascript` asserts over `ScoreResult`); the LLM judge only grades whether the prose faithfully describes that number.

## Invariants this module must preserve

- LLM never emits or adjusts `fit`, `intent`, `composite`, or the tier. Code computes; the model only reasons over source text upstream. (AGENTS.md "NEVER", scoring-conventions, TARGET-ARCHITECTURE invariant 1.)
- Purity: the only non-pure input is `now: Date`, passed in. No `Date.now()`, `new Date()` without args, `Math.random()`, env reads, I/O, or input mutation in the scoring path. Same input + same `now` -> byte-identical output.
- Missing data = `unknown`: contributes 0, recorded `known: false`, never inferred. New signal types follow this: absence is not a fabricated `strength`.
- Scores on `[0,100]`; every externally derived number routes through `clampScore`. New `SignalFact.strength` values stay 0..1 pre-decay.
- Weight-0 semantics: a `signalCriterion` with `weight <= 0` is excluded entirely, not zero-scored. New signal types only contribute if an ICP actually configures a criterion for them.
- Decay monotonic to 0 at `expiresAt`; `DEFAULT_SIGNAL_TTL_DAYS` is the single source of window policy. Adapters NEVER invent their own expiry; they call `signalExpiry`.
- No vendor types, Prisma, network, or filesystem in this package. The DLD adapter and its shapes stay in `packages/integrations`.
- Bump `SCORING_MODEL_VERSION` whenever the computed number can change for the SAME input. (Adding an unused enum value alone does not change existing outputs; configuring a new criterion in an ICP does, but that is data, not code. See task notes.)
- No sends, dialing, secrets, or DRY_RUN handling here. This package ranks; it never acts.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

> Scope note: per the roadmap, the Now phase for the WHOLE repo is three pure-TS wins (durable send-gate, promptfoo, OTel span), none of which live in this package. The DLD differentiator is a NEXT item, but its core-side TYPE seam is cheap, low-risk, pure TS, and unblocks the DLD adapter, so the free `transaction_spike` half of the seam is pulled into Now. The gated `off_plan_launch` half stays blocked. Everything below is type/policy/test work in `packages/core`; no adapter, no I/O.

### Task 1 (Now): Add the `transaction_spike` SignalType to the enum seam. Effort: S

Spec. In `packages/core/src/types.ts`, extend `signalTypeValues`:

```ts
export const signalTypeValues = [
  "hiring",
  "funding",
  "tech_adoption",
  "job_change",
  "news",
  "web_change",
  "transaction_spike", // DLD/Dubai Pulse: registered-transaction volume spike (region-native intent)
] as const;
```

`signalType` (z.enum) and `type SignalType` derive automatically. Do NOT add `off_plan_launch` here yet: its source is unsettled (Task 4). This is a pure additive enum widening; it changes no existing scored output because no fixture ICP configures a `transaction_spike` criterion. Therefore do NOT bump `SCORING_MODEL_VERSION` for this task alone (existing inputs yield identical outputs); see the invariant note.

Acceptance check.
- `pnpm --filter @oie/core typecheck` FAILS until Task 2 adds the TTL (the `Record<SignalType, number>` exhaustiveness gap is the intended forcing function); after Task 2 it passes.
- A test asserting the enum membership: `expect(signalTypeValues).toContain("transaction_spike")` and `signalType.parse("transaction_spike")` does not throw.

### Task 2 (Now): Give `transaction_spike` a short, justified decay window. Effort: S

Spec. In `packages/core/src/signal-windows.ts`, add the TTL. A DLD transaction spike is a "call THIS WEEK" timing trigger (DATA-ACQUISITION §1, §3 Layer 2b: transaction volume is the intent signal; the differentiator is "Developer X shows a DLD transaction spike this week"). Set a SHORT window so it decays fast, distinct from quarter-long `funding`:

```ts
export const DEFAULT_SIGNAL_TTL_DAYS: Record<SignalType, number> = {
  funding: 90,
  tech_adoption: 60,
  job_change: 45,
  hiring: 30,
  news: 30,
  web_change: 21,
  transaction_spike: 14, // a "this week/fortnight" timing trigger; decays fast on purpose
};
```

(14 days is the proposed default; confirm against the DLD spike's freshness finding in Task 4. If open data lags, raise the TTL or re-ground the signal per Part 5's "if not fresh enough, the differentiator must be re-grounded.")

Acceptance check.
- `pnpm --filter @oie/core typecheck` now passes (the `Record<SignalType,...>` is exhaustive again).
- New test in `signal-windows.test.ts`: `signalExpiry("transaction_spike", new Date("2026-06-01T00:00:00Z"))` returns `2026-06-15T00:00:00Z` (detectedAt + 14d), and `signalDecayFactor(detectedAt, that, detectedAt+7d) ≈ 0.5` (linear mid-window).

### Task 3 (Now): Prove the engine scores a `transaction_spike` end to end with a fixture + decay test. Effort: S

Spec. The engine code needs NO change (it is generic over `SignalType`). Add coverage so the new signal is exercised through `scoreLead`, proving the seam works without any engine edit. In `packages/core/src/__fixtures__/leads.ts`, add a `transaction_spike` ICP criterion to a NEW fixture ICP (do not mutate `testIcp`, other tests depend on it) and a lead carrying the signal:

```ts
export const dldIcp: IcpProfile = {
  ...testIcp,
  id: "dld-icp",
  signals: [
    ...testIcp.signals,
    { type: "transaction_spike", config: {}, weight: 0.5 },
  ],
};

export const transactionSpikeLead: ScoringSubject = {
  company: { industry: "real estate", region: "Dubai", country: "AE" },
  contact: { title: "Managing Director", seniority: "director", department: "sales" },
  signals: [
    {
      type: "transaction_spike",
      strength: 0.9,
      detectedAt: new Date("2026-06-10T00:00:00Z"),
      expiresAt: signalExpiry("transaction_spike", new Date("2026-06-10T00:00:00Z")),
      evidence: { developer: "Developer X", txCount: 42, window: "7d", source: "dld_transactions-open" },
    },
  ],
};
```

In `scoring-engine.test.ts`, add tests that:
1. `scoreLead(transactionSpikeLead, dldIcp, NOW)` produces a non-zero `intent` and a `rationale.intent.criteria` entry with `type === "transaction_spike"`, `matched === true`, and a `detail` mentioning the count.
2. The SAME lead scored with the signal fully expired yields `intent` contribution 0 for that criterion (mirror the existing `expiredSignalLead` test).
3. Determinism: two calls with the same args are deep-equal.

Acceptance check. `pnpm --filter @oie/core test` green, including the three new assertions. `pnpm verify` passes.

### Task 4 (Now, BLOCKING for off_plan_launch): Record the DLD enum/TTL decisions and the spike dependency in core docs; do NOT add `off_plan_launch`. Effort: S

Spec. This package must not get ahead of the data reality. Update `packages/core/AGENTS.md` (the "Signal windows" / gotchas area) to document: (a) `transaction_spike` is a region-native DLD signal with a deliberately short TTL; (b) `off_plan_launch` is INTENTIONALLY NOT in the enum until its source is settled (free first-registration-spike proxy from `dld_transactions-open`/`dld-registration` open data per Part 5(a), or gated Oqood onboarding per Part 5(b)); (c) the 1-day DLD availability/licensing spike (owned by `packages/integrations`, tracked in PRODUCTION-CHECKLIST) gates any change to the `transaction_spike` TTL and the addition of `off_plan_launch`. Add a one-line pointer to ADR-0008 and to TARGET-ARCHITECTURE Part 5. Do not touch `types.ts`/`signal-windows.ts` for `off_plan_launch`.

Acceptance check. `AGENTS.md` states the seam-vs-leaf rule for DLD (enum+TTL in core; HTTP/OAuth/CSV/mapping in integrations) and the `off_plan_launch` block reason. No code change; `pnpm --filter @oie/core test` still green. (This is the in-repo record that satisfies the architecture's "BEFORE mapping" sequencing and the do-not-assume-Oqood-access rule.)

### Task 5 (Now, optional if time): Add the determinism guard test as a reusable helper. Effort: S

Spec. The architecture leans on "a regression test proves the invariant" throughout. Core already has an inline determinism test; promote it to an exported test helper so every new signal-type fixture reuses it. In a new `src/__fixtures__/assert.ts` (test-only, not exported from `index.ts`):

```ts
import { expect } from "vitest";
import { scoreLead } from "../scoring-engine";
import type { ScoringSubject } from "../subject";
import type { IcpProfile } from "../icp";

export function assertDeterministic(subject: ScoringSubject, icp: IcpProfile, now: Date): void {
  expect(scoreLead(subject, icp, now)).toEqual(scoreLead(subject, icp, now));
}
```

Acceptance check. `assertDeterministic(transactionSpikeLead, dldIcp, NOW)` used in Task 3's suite; `pnpm --filter @oie/core test` green. Do NOT add `vitest` to `package.json` `dependencies` (it is a dev/transpile-time tool already available to the suite); keep the runtime dep set at `zod` only.

## Next (1 to 3 months)

- promptfoo over the scoring RATIONALE prose (Part 2, Top bet #3). Core's contribution: keep `rationale.*.detail` strings deterministic and human-readable, and EXPOSE a stable, importable way for the promptfoo harness to score real leads. The harness lives in `packages/integrations/src/llm/evals` migrating to promptfoo, NOT in core. Core stays the snapshot SOURCE: promptfoo `javascript` asserts call `scoreLead(...)` and assert the NUMBER/tier (code judges the number); the `llm-rubric` judge grades ONLY whether the `detail` prose faithfully describes the deterministic computation (never the tier). Action in core if needed: add a tiny `src/__fixtures__/labelled.ts` of labelled `{ subject, icp, expectedTier }` rows reusable by both Vitest and promptfoo, so the eval dataset and the unit fixtures do not drift. No engine logic change.
- The DLD adapter + waterfall wiring is built (NEXT per Part 5/Part 6), but ALL of it is in `packages/integrations` (the `SignalProvider`/`EnrichmentProvider` adapter, OAuth token-refresh, CSV rebuild) and `packages/orchestration` (the `step.run`-wrapped call, the "DLD category -> SignalType" mapping mirroring `predictleads/mapper.ts`). This package only RECEIVES the normalised `transaction_spike` `SignalFact` through `scoring-bridge.ts`. Nothing new in core for this beyond Tasks 1-3.
- Settle `off_plan_launch` (Part 5(a)/(b)). ONLY when its source is confirmed: add the enum value (`types.ts`) + a TTL (`signal-windows.ts`, likely longer than `transaction_spike` since a launch is a multi-week window) + a fixture/test, exactly mirroring Tasks 1-3. Bump `SCORING_MODEL_VERSION` only if a default seed ICP starts configuring it (changes existing outputs).
- Re-baseline `tierThresholds` guidance if DLD intent materially shifts the intent distribution (a real region-native signal can lift intent for many real-estate leads). This is an ICP-DATA decision (`@oie/db` seed), not a core-code change, but document the re-baseline trigger in `AGENTS.md`.

## Later (post-PMF, gated)

- A non-linear decay curve for `transaction_spike` (e.g. exponential or step) if the linear default proves too blunt for a fast timing signal. Today `signalDecayFactor` is linear; any curve change is a `SCORING_MODEL_VERSION` bump plus updated decay tests. Gate on real live-run feedback, not speculation (per "prefer the simplest approach").
- A learned/calibrated weighting of fit vs intent or per-criterion weights. EXPLICITLY constrained by the invariant: any optimizer (Ax offline, Part 2 Later) may only propose ICP CONFIG (data in `@oie/db`), never emit or adjust the scored number in core. The scorer stays deterministic code; an optimizer tunes inputs, not outputs.
- pgvector / RAG, analytics marts, Langfuse: all out of scope for `packages/core` forever (Parts 3, 7, 8). They never read or feed the scorer (CDC lag/observability score must never reach the engine). Listed here only to record that they do NOT touch this package.

## Contracts / interfaces touched (exact names)

- `packages/core/src/types.ts`: `signalTypeValues` (add `"transaction_spike"`), `signalType` (z.enum, derived), `SignalType` (derived).
- `packages/core/src/signal-windows.ts`: `DEFAULT_SIGNAL_TTL_DAYS` (add `transaction_spike: 14`), `signalExpiry` (unchanged signature).
- `packages/core/src/__fixtures__/leads.ts`: new `dldIcp`, `transactionSpikeLead` exports.
- `packages/core/src/__fixtures__/assert.ts` (new, test-only): `assertDeterministic`.
- `packages/core/AGENTS.md`: DLD seam-vs-leaf + `off_plan_launch` block documentation.
- UNCHANGED but depended upon (the seam): `ScoringSubject`, `SignalFact` (`src/subject.ts`); `scoreLead`, `ScoreResult`, `IntentCriterionResult`, `SCORING_MODEL_VERSION` (`src/scoring-engine.ts`); `signalCriterion`, `icpProfile` (`src/icp.ts`); `clampScore`, `signalDecayFactor`, `combineDiminishing` (`src/scoring.ts`, `src/match.ts`).
- Downstream consumers of the widened enum (NOT edited in core, but must compile against it): `NormalisedSignal.type` in `packages/integrations/src/contracts/model.ts`; `signalFactFromNormalised` in `packages/orchestration/src/scoring-bridge.ts`; the DLD mapper to be added in `packages/integrations` mirroring `packages/integrations/src/predictleads/mapper.ts`.

## Verification (how each task is proven done)

- Typecheck: `pnpm --filter @oie/core typecheck` (also `pnpm typecheck` repo-wide to catch the enum widening landing cleanly in `@oie/integrations`/`@oie/orchestration`/`@oie/db`). The `Record<SignalType, number>` exhaustiveness is the gate: Task 1 alone red, Task 1+2 green.
- Lint: `pnpm --filter @oie/core lint`.
- Test: `pnpm --filter @oie/core test` (enum membership, TTL/expiry math, mid-window decay 0.5, expired-signal 0 intent, `transaction_spike` end-to-end through `scoreLead`, determinism via `assertDeterministic`). Single file while iterating: `pnpm --filter @oie/core test src/signal-windows.test.ts`.
- Build: `pnpm --filter @oie/core build` (`tsc --noEmit`; there is no `dist`, do not add a bundler).
- Full gate before claiming done: `pnpm verify` (typecheck + lint + test + build) from the repo root, so the enum change is proven across every consuming package.
- No curl/HTTP verification applies: this package does zero I/O. (The DLD endpoint verification belongs to the integrations spike, not here.)

## Risks and do-not

- DO NOT add `off_plan_launch` to the enum or TTL until its source is settled (free proxy from open data, or Oqood onboarding). Shipping it now would imply a data source that may not exist (Part 5: "Do not ship code that assumes Oqood access exists").
- DO NOT put any DLD HTTP, OAuth token refresh, CSV parsing, Dubai-Pulse field shape, or "vendor category -> SignalType" mapping in `packages/core`. That is vendor leakage across the anti-corruption boundary; it belongs in `packages/integrations` + a `step.run` in `packages/orchestration`.
- DO NOT let an LLM, an eval score, an `llm-rubric` rating, or any observability metric feed back into `fit`/`intent`/`composite`/`tier`. promptfoo's judge grades RATIONALE PROSE only; the number is code-owned (invariant 1, the whole point of this package).
- DO NOT change the linear decay, the `[0,100]` scale, the `[0,1]` weight range, or tier letters without bumping `SCORING_MODEL_VERSION` and updating the decay tests and `scoring-conventions`.
- DO NOT set the `transaction_spike` TTL from a vendor field or guess freshness from memory. It is policy, owned here, and must be confirmed against the 1-day DLD spike's freshness finding (CLAUDE.md: verify current API/limits/auth against official docs).
- DO NOT add runtime dependencies beyond `zod`. Keep the package lean and pure (disk is tight; the package is consumed as TS source).
- WATCH the `SCORING_MODEL_VERSION` decision: a bare enum addition with no seed-ICP criterion does not change existing outputs (no bump). The moment a SHIPPED ICP configures a `transaction_spike`/`off_plan_launch` criterion, existing leads recompute, so the version-and-recompute path (`@oie/db` persisted scores) must be exercised: coordinate that bump with the ICP/seed change, not the enum change.
- DO NOT mutate `testIcp` to add the new criterion; create `dldIcp`. Other suites assert exact numbers against `testIcp` and would break.
