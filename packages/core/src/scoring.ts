import type { Tier } from "./types";
import type { IcpProfile } from "./icp";

/**
 * Scoring primitives. The full deterministic engine lands in Phase 2; these are
 * the pure building blocks it composes, kept here so they can be unit-tested in
 * isolation. The governing rule (brief §1, §8): CODE computes the number.
 */

/** Clamp a value into [0, 100]. Scores are always on a 0..100 scale. */
export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** A weighted average of components, each a 0..100 score with a non-negative weight. */
export function weightedScore(components: { score: number; weight: number }[]): number {
  const totalWeight = components.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (totalWeight === 0) return 0;
  const weighted = components.reduce(
    (sum, c) => sum + clampScore(c.score) * Math.max(0, c.weight),
    0,
  );
  return clampScore(weighted / totalWeight);
}

/**
 * Blend a fit score and an intent score into a composite using the ICP blend.
 * The blend weights are validated to sum to 1 at the schema boundary.
 */
export function compositeScore(
  fit: number,
  intent: number,
  blend: IcpProfile["compositeBlend"],
): number {
  return clampScore(clampScore(fit) * blend.fit + clampScore(intent) * blend.intent);
}

/**
 * Time-decay multiplier for a signal's strength. Linear decay from 1 at
 * detection to 0 at expiry; clamped to [0, 1]. Signals with no expiry do not decay.
 */
export function signalDecayFactor(detectedAt: Date, expiresAt: Date | null, now: Date): number {
  if (!expiresAt) return 1;
  const span = expiresAt.getTime() - detectedAt.getTime();
  if (span <= 0) return 0;
  const elapsed = now.getTime() - detectedAt.getTime();
  const remaining = 1 - elapsed / span;
  return Math.max(0, Math.min(1, remaining));
}

/** Assign a tier from a composite score and the ICP thresholds. Below C is tier D. */
export function assignTier(composite: number, thresholds: IcpProfile["tierThresholds"]): Tier {
  const s = clampScore(composite);
  if (s >= thresholds.A) return "A";
  if (s >= thresholds.B) return "B";
  if (s >= thresholds.C) return "C";
  return "D";
}
