/**
 * Deterministic ROI arithmetic for the Close Room. Pure and dependency-free so it
 * is unit-tested and the buyer can reproduce every step on their own numbers. The
 * LLM never computes these figures; it only frames the output of this function
 * (see computeRoi in actions.ts). Kept out of the "use server" module so it can be
 * imported directly by tests.
 */

export interface RoiInput {
  leadsPerMonth: number;
  pctUnanswered: number;
  avgCommissionAed: number;
  closeRatePct: number;
}

export interface RoiMath {
  recoveredLeadsPerMonth: number;
  recoveredDealsPerMonth: number;
  recoveredAedPerMonth: number;
  recoveredAedPerYear: number;
}

/** Pure, checkable arithmetic. The buyer must be able to reproduce every step. */
export function computeRoiMath(input: RoiInput): RoiMath {
  const recoveredLeadsPerMonth = (input.leadsPerMonth * input.pctUnanswered) / 100;
  const recoveredDealsPerMonth = (recoveredLeadsPerMonth * input.closeRatePct) / 100;
  const recoveredAedPerMonth = recoveredDealsPerMonth * input.avgCommissionAed;
  const recoveredAedPerYear = recoveredAedPerMonth * 12;
  return {
    recoveredLeadsPerMonth,
    recoveredDealsPerMonth,
    recoveredAedPerMonth,
    recoveredAedPerYear,
  };
}
