# ADR-0008 — Deterministic scoring engine (code computes the number)

**Status:** Accepted

## Context

The ICP score decides which leads get worked and in what order — it is the brain's core judgement and OIE's differentiation. If an LLM produced the number, the score would be non-deterministic, unexplainable, hard to unit-test, and would drift with model changes. Scores must be reproducible (the same inputs always yield the same output), explainable (an operator can see why), and stable under ICP edits (recompute, do not re-prompt).

## Decision

Build a **deterministic scoring engine** in `packages/core` where **code computes the number, never the LLM**. `scoreLead(subject, icp, now)` computes:

- **Fit** from firmographics, technographics, people and keywords (industry, employee count, geography with haversine distance, local category, revenue, tech stack, people, keywords).
- **Intent** from signals with linear time decay and a diminishing-returns combine, with `now` injected — the engine never reads the clock.
- A **composite** blend of fit and intent, an **A/B/C/D tier** from configured thresholds, and an explainable **rationale** plus coverage.

`rankByComposite` orders leads deterministically. The LLM's role is upstream (extracting structured facts) and downstream (writing the opener) — never the score itself. The rule is enforced socially in CLAUDE.md and structurally by keeping the LLM client out of `packages/core`.

## Consequences

- **Easier:** scores are reproducible, unit-testable (determinism, tier-A perfect lead, all-unknown fit = 0, expired-signal intent = 0, decay halves at mid-window), and explainable to operators.
- **Easier:** editing the ICP triggers a recompute with no LLM cost and instant live re-rank in the control plane.
- **Harder:** the engine must encode scoring logic explicitly rather than delegating nuance to a model.
- **Risk:** an overly rigid model misses signal nuance; mitigated by the LLM supplying richer structured facts upstream, which the deterministic engine then scores.
