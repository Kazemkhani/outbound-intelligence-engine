import { describe, it, expect } from "vitest";
import {
  SCORED_LEADS,
  FIXTURE_APPROVALS,
  FIXTURE_SIGNAL_FEED,
  getAnalyticsTiles,
  scoreAndRankLeads,
  SEED_ICP,
} from "../fixtures";

const NOW = new Date("2026-06-14T00:00:00Z");

describe("fixture data", () => {
  it("produces 8 scored leads", () => {
    expect(SCORED_LEADS).toHaveLength(8);
  });

  it("ranks leads in composite-descending order", () => {
    for (let i = 1; i < SCORED_LEADS.length; i++) {
      const prev = SCORED_LEADS[i - 1];
      const curr = SCORED_LEADS[i];
      // noUncheckedIndexedAccess — both are defined because we iterate within bounds
      expect(prev!.score.composite).toBeGreaterThanOrEqual(curr!.score.composite);
    }
  });

  it("assigns valid tiers (A, B, C, or D) to every lead", () => {
    for (const lead of SCORED_LEADS) {
      expect(["A", "B", "C", "D"]).toContain(lead.score.tier);
    }
  });

  it("all composite scores are in 0..100", () => {
    for (const lead of SCORED_LEADS) {
      expect(lead.score.composite).toBeGreaterThanOrEqual(0);
      expect(lead.score.composite).toBeLessThanOrEqual(100);
    }
  });

  it("live re-rank with modified ICP changes ordering deterministically", () => {
    // Flip compositeBlend to weight intent at 0.9 — leads with signals should rise.
    const intentHeavyIcp = {
      ...SEED_ICP,
      compositeBlend: { fit: 0.1, intent: 0.9 },
    };
    const reranked = scoreAndRankLeads(intentHeavyIcp, NOW);
    // The top lead in the intent-heavy run must have signals.
    expect(reranked[0]!.signals.length).toBeGreaterThan(0);
  });

  it("approval queue has items with awaiting_approval status", () => {
    const pending = FIXTURE_APPROVALS.filter((a) => a.status === "awaiting_approval");
    expect(pending.length).toBeGreaterThan(0);
  });

  it("signal feed is sorted most-recent first", () => {
    for (let i = 1; i < FIXTURE_SIGNAL_FEED.length; i++) {
      expect(FIXTURE_SIGNAL_FEED[i - 1]!.detectedAt.getTime()).toBeGreaterThanOrEqual(
        FIXTURE_SIGNAL_FEED[i]!.detectedAt.getTime(),
      );
    }
  });

  it("analytics tiles sum byTier counts to totalLeads", () => {
    const tiles = getAnalyticsTiles();
    const sum = tiles.byTier.A + tiles.byTier.B + tiles.byTier.C + tiles.byTier.D;
    expect(sum).toBe(tiles.totalLeads);
  });
});
