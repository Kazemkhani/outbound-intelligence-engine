import { describe, it, expect } from "vitest";
import { computeRoiMath, type RoiInput } from "./roi-math";

describe("computeRoiMath", () => {
  it("computes the canonical example end to end", () => {
    const input: RoiInput = {
      leadsPerMonth: 100,
      pctUnanswered: 40,
      avgCommissionAed: 30_000,
      closeRatePct: 20,
    };
    expect(computeRoiMath(input)).toEqual({
      recoveredLeadsPerMonth: 40, // 100 * 40%
      recoveredDealsPerMonth: 8, // 40 * 20%
      recoveredAedPerMonth: 240_000, // 8 * 30,000
      recoveredAedPerYear: 2_880_000, // 240,000 * 12
    });
  });

  it("returns all zeros when nothing is unanswered", () => {
    expect(
      computeRoiMath({ leadsPerMonth: 250, pctUnanswered: 0, avgCommissionAed: 50_000, closeRatePct: 30 }),
    ).toEqual({
      recoveredLeadsPerMonth: 0,
      recoveredDealsPerMonth: 0,
      recoveredAedPerMonth: 0,
      recoveredAedPerYear: 0,
    });
  });

  it("recovers every lead when 100% are unanswered and close at 100%", () => {
    const m = computeRoiMath({
      leadsPerMonth: 80,
      pctUnanswered: 100,
      avgCommissionAed: 20_000,
      closeRatePct: 100,
    });
    expect(m.recoveredLeadsPerMonth).toBe(80);
    expect(m.recoveredDealsPerMonth).toBe(80);
    expect(m.recoveredAedPerMonth).toBe(1_600_000);
  });

  it("handles fractional percentages without rounding (rounding is a display concern)", () => {
    const m = computeRoiMath({
      leadsPerMonth: 50,
      pctUnanswered: 33,
      avgCommissionAed: 25_000,
      closeRatePct: 10,
    });
    expect(m.recoveredLeadsPerMonth).toBeCloseTo(16.5, 10);
    expect(m.recoveredDealsPerMonth).toBeCloseTo(1.65, 10);
    expect(m.recoveredAedPerMonth).toBeCloseTo(41_250, 10);
    expect(m.recoveredAedPerYear).toBeCloseTo(495_000, 10);
  });

  it("keeps the yearly figure exactly 12x the monthly (the buyer-checkable invariant)", () => {
    const m = computeRoiMath({
      leadsPerMonth: 137,
      pctUnanswered: 41,
      avgCommissionAed: 28_500,
      closeRatePct: 17,
    });
    expect(m.recoveredAedPerYear).toBeCloseTo(m.recoveredAedPerMonth * 12, 6);
  });

  it("is deterministic: identical input yields identical output", () => {
    const input: RoiInput = {
      leadsPerMonth: 64,
      pctUnanswered: 55,
      avgCommissionAed: 42_000,
      closeRatePct: 12,
    };
    expect(computeRoiMath(input)).toEqual(computeRoiMath(input));
  });
});
