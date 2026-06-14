import { describe, it, expect } from "vitest";
import { icpProfile } from "./icp";
import { scoreLead, rankByComposite, SCORING_MODEL_VERSION } from "./scoring-engine";
import {
  testIcp,
  NOW,
  perfectLead,
  noSignalLead,
  unknownLead,
  poorFitLead,
  expiredSignalLead,
} from "./__fixtures__/leads";

describe("scoring engine", () => {
  it("uses a valid ICP fixture", () => {
    expect(() => icpProfile.parse(testIcp)).not.toThrow();
  });

  it("is deterministic — same input yields identical output", () => {
    const a = scoreLead(perfectLead, testIcp, NOW);
    const b = scoreLead(perfectLead, testIcp, NOW);
    expect(a).toEqual(b);
    expect(a.modelVersion).toBe(SCORING_MODEL_VERSION);
  });

  it("scores a near-perfect lead with fresh strong intent as tier A", () => {
    const r = scoreLead(perfectLead, testIcp, NOW);
    expect(r.fit).toBeGreaterThanOrEqual(90);
    // Strong fresh hiring + tech_adoption; the unfired funding criterion holds intent ~60.
    expect(r.intent).toBeGreaterThan(55);
    expect(r.composite).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe("A");
  });

  it("drops composite when there is no intent signal", () => {
    const r = scoreLead(noSignalLead, testIcp, NOW);
    expect(r.intent).toBe(0);
    // Good fit, zero intent → composite = fit * 0.6.
    expect(r.composite).toBeCloseTo(r.fit * 0.6, 5);
    expect(["B", "C", "D"]).toContain(r.tier);
  });

  it("scores an all-unknown lead at zero fit", () => {
    const r = scoreLead(unknownLead, testIcp, NOW);
    expect(r.fit).toBe(0);
    expect(r.composite).toBe(0);
    expect(r.tier).toBe("D");
    expect(r.rationale.fit.coverage).toBe(0);
  });

  it("disqualifies technographics when an avoided tool is present", () => {
    const r = scoreLead(poorFitLead, testIcp, NOW);
    const tech = r.rationale.fit.components.find((c) => c.key === "technographics");
    expect(tech?.score).toBe(0);
    expect(r.tier).toBe("D");
  });

  it("contributes zero intent for a fully expired signal", () => {
    const r = scoreLead(expiredSignalLead, testIcp, NOW);
    expect(r.intent).toBe(0);
    const hiring = r.rationale.intent.criteria.find((c) => c.type === "hiring");
    expect(hiring?.matched).toBe(false);
  });

  it("applies linear time-decay to intent across the signal window", () => {
    const detectedAt = new Date("2026-06-01T00:00:00Z");
    const expiresAt = new Date("2026-06-11T00:00:00Z"); // 10-day window
    const mid = new Date("2026-06-06T00:00:00Z");
    const subject = {
      company: perfectLead.company,
      contact: perfectLead.contact,
      signals: [
        { type: "hiring" as const, strength: 1, detectedAt, expiresAt, evidence: { role: "SDR" } },
      ],
    };
    const atStart = scoreLead(subject, testIcp, detectedAt);
    const atMid = scoreLead(subject, testIcp, mid);
    const hiringStart = atStart.rationale.intent.criteria.find((c) => c.type === "hiring")!;
    const hiringMid = atMid.rationale.intent.criteria.find((c) => c.type === "hiring")!;
    expect(hiringStart.score).toBeCloseTo(100, 0);
    expect(hiringMid.score).toBeCloseTo(50, 0);
  });

  it("ranks leads deterministically by composite descending", () => {
    const scored = [unknownLead, perfectLead, noSignalLead, poorFitLead].map((s) => ({
      subject: s,
      score: scoreLead(s, testIcp, NOW),
    }));
    const ranked = rankByComposite(scored);
    expect(ranked[0]!.subject).toBe(perfectLead);
    const composites = ranked.map((r) => r.score.composite);
    expect(composites).toEqual([...composites].sort((a, b) => b - a));
  });

  it("records weight-0 dimensions are excluded and coverage reflects known fields", () => {
    const r = scoreLead(noSignalLead, testIcp, NOW);
    // revenueBand and keywords have weight 0 → excluded from components entirely.
    const keys = r.rationale.fit.components.map((c) => c.key);
    expect(keys).not.toContain("revenueBand");
    expect(keys).not.toContain("keywords");
    expect(r.rationale.fit.coverage).toBeGreaterThan(0);
    expect(r.rationale.fit.coverage).toBeLessThanOrEqual(1);
  });
});
