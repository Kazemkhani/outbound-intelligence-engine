import { describe, it, expect } from "vitest";
import type { IcpProfile } from "@oie/core";
import { computeScore, engineReference, type ScoreProspectArgs } from "./tools";

/** A minimal-but-valid ICP mirroring the seed shape (fit 0.6 / intent 0.4). */
const ICP: IcpProfile = {
  id: "icp_test",
  name: "Test ICP",
  version: 1,
  active: true,
  firmographics: {
    industries: { values: ["Real Estate"], weight: 1 },
    employeeCount: { min: 10, max: 500, weight: 1 },
    revenueBand: { values: [], weight: 0 },
    geographies: { countries: ["AE"], regions: ["Dubai"], weight: 1 },
    localCategory: { values: [], weight: 0 },
  },
  technographics: { uses: [], avoids: [], weight: 0 },
  people: { titles: ["Head of Sales"], seniority: ["director"], departments: ["Sales"], weight: 1 },
  signals: [{ type: "funding", config: {}, weight: 1 }],
  keywords: { include: [], exclude: [], weight: 0 },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
};

const NOW = new Date("2026-06-25T00:00:00.000Z");

const baseArgs = (over: Partial<ScoreProspectArgs> = {}): ScoreProspectArgs => ({
  company: { industry: "Real Estate", employeeCount: 120, country: "AE", region: "Dubai" },
  contact: { title: "Head of Sales", seniority: "director", department: "Sales" },
  signals: [],
  icp: ICP,
  ...over,
});

describe("computeScore", () => {
  it("returns a deterministic 0-100 composite with a tier and rationale", () => {
    const r = computeScore(baseArgs(), NOW);
    expect(r.fit).toBeGreaterThanOrEqual(0);
    expect(r.fit).toBeLessThanOrEqual(100);
    expect(r.composite).toBeGreaterThanOrEqual(0);
    expect(r.composite).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D"]).toContain(r.tier);
    expect(r.rationale.fit.components.length).toBeGreaterThan(0);
  });

  it("is deterministic: same input + same now -> identical result", () => {
    const a = computeScore(baseArgs(), NOW);
    const b = computeScore(baseArgs(), NOW);
    expect(b).toEqual(a);
  });

  it("a fresh strong signal raises intent above an empty-signal baseline", () => {
    const baseline = computeScore(baseArgs(), NOW);
    const withSignal = computeScore(
      baseArgs({
        signals: [
          { type: "funding", strength: 1, detectedAt: new Date("2026-06-24T00:00:00.000Z") },
        ],
      }),
      NOW,
    );
    expect(withSignal.intent).toBeGreaterThan(baseline.intent);
  });
});

describe("engineReference", () => {
  it("reports the model version and the known signal types", () => {
    const ref = engineReference();
    expect(ref.modelVersion).toBe("scoring-v1");
    expect(ref.signalTypes).toContain("funding");
  });
});
