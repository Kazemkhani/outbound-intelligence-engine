import { describe, it, expect } from "vitest";
import {
  clampScore,
  weightedScore,
  compositeScore,
  signalDecayFactor,
  assignTier,
} from "./scoring";

describe("clampScore", () => {
  it("clamps to [0,100] and maps NaN to 0", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(73)).toBe(73);
  });
});

describe("weightedScore", () => {
  it("computes a weighted average", () => {
    expect(
      weightedScore([
        { score: 100, weight: 1 },
        { score: 0, weight: 1 },
      ]),
    ).toBe(50);
    expect(
      weightedScore([
        { score: 80, weight: 3 },
        { score: 40, weight: 1 },
      ]),
    ).toBe(70);
  });
  it("returns 0 when total weight is 0", () => {
    expect(weightedScore([{ score: 90, weight: 0 }])).toBe(0);
    expect(weightedScore([])).toBe(0);
  });
  it("ignores negative weights", () => {
    expect(
      weightedScore([
        { score: 100, weight: 1 },
        { score: 0, weight: -5 },
      ]),
    ).toBe(100);
  });
});

describe("compositeScore", () => {
  it("blends fit and intent per the configured weights", () => {
    expect(compositeScore(80, 40, { fit: 0.6, intent: 0.4 })).toBeCloseTo(64);
  });
});

describe("signalDecayFactor", () => {
  const detected = new Date("2026-01-01T00:00:00Z");
  const expires = new Date("2026-01-11T00:00:00Z"); // 10-day window
  it("is 1 at detection and 0 at expiry", () => {
    expect(signalDecayFactor(detected, expires, detected)).toBe(1);
    expect(signalDecayFactor(detected, expires, expires)).toBe(0);
  });
  it("decays linearly across the window", () => {
    const mid = new Date("2026-01-06T00:00:00Z");
    expect(signalDecayFactor(detected, expires, mid)).toBeCloseTo(0.5);
  });
  it("does not decay signals with no expiry", () => {
    expect(signalDecayFactor(detected, null, new Date("2030-01-01T00:00:00Z"))).toBe(1);
  });
  it("clamps past-expiry to 0", () => {
    expect(signalDecayFactor(detected, expires, new Date("2027-01-01T00:00:00Z"))).toBe(0);
  });
});

describe("assignTier", () => {
  const thresholds = { A: 80, B: 65, C: 50 };
  it("assigns by threshold with D below C", () => {
    expect(assignTier(85, thresholds)).toBe("A");
    expect(assignTier(80, thresholds)).toBe("A");
    expect(assignTier(70, thresholds)).toBe("B");
    expect(assignTier(50, thresholds)).toBe("C");
    expect(assignTier(49, thresholds)).toBe("D");
  });
});
