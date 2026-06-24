import { describe, it, expect } from "vitest";
import { affirmative, extractFindings, CANONICAL_FINDING_KEYS } from "./findings";

describe("affirmative", () => {
  it("accepts the known affirmative tokens, case- and space-insensitively", () => {
    for (const v of ["yes", "TRUE", " Confirmed ", "granted", "opted in", "opted-in", "opted_in", "agreed", "interested"]) {
      expect(affirmative(v)).toBe(true);
    }
  });

  it("rejects negatives, blanks, and anything ambiguous", () => {
    for (const v of ["no", "false", "maybe", "", "   ", "not interested", "yeah", "y"]) {
      expect(affirmative(v)).toBe(false);
    }
  });
});

describe("extractFindings", () => {
  it("reads an array of {key,value,confidence} and keeps only canonical keys", () => {
    const out = extractFindings({
      findings: [
        { key: "mobile", value: "+971501234567", confidence: 0.9 },
        { key: "demo_interest", value: true },
        { key: "not_a_real_key", value: "should be dropped", confidence: 0.99 },
      ],
    });
    expect(out).toEqual([
      { key: "mobile", value: "+971501234567", confidence: 0.9 },
      { key: "demo_interest", value: "yes", confidence: null },
    ]);
  });

  it("reads a plain key/value object", () => {
    const out = extractFindings({ findings: { tools: "Property Finder", monthly_volume: 120 } });
    expect(out).toContainEqual({ key: "tools", value: "Property Finder", confidence: null });
    expect(out).toContainEqual({ key: "monthly_volume", value: "120", confidence: null });
  });

  it("falls back to outcome.findings then data.findings then outcome itself", () => {
    expect(extractFindings({ outcome: { findings: [{ key: "tools", value: "Bayut" }] } })).toEqual([
      { key: "tools", value: "Bayut", confidence: null },
    ]);
    expect(extractFindings({ data: { findings: { mobile: "+971500000000" } } })).toEqual([
      { key: "mobile", value: "+971500000000", confidence: null },
    ]);
    // outcome as a bare key/value object (no nested .findings)
    expect(extractFindings({ outcome: { identity_confirmed: true } })).toEqual([
      { key: "identity_confirmed", value: "yes", confidence: null },
    ]);
  });

  it("normalises booleans to yes/no and drops empty or missing values", () => {
    const out = extractFindings({
      findings: [
        { key: "identity_confirmed", value: false },
        { key: "opt_in", value: "" },
        { key: "tools", value: null },
        { key: "demo_interest", value: undefined },
      ],
    });
    expect(out).toEqual([{ key: "identity_confirmed", value: "no", confidence: null }]);
  });

  it("only keeps a confidence within [0,1], else null", () => {
    const out = extractFindings({
      findings: [
        { key: "mobile", value: "a", confidence: 1.5 },
        { key: "tools", value: "b", confidence: -0.1 },
        { key: "monthly_volume", value: "c", confidence: 0.5 },
        { key: "demo_interest", value: "d", confidence: "high" },
      ],
    });
    expect(out.find((f) => f.key === "mobile")?.confidence).toBeNull();
    expect(out.find((f) => f.key === "tools")?.confidence).toBeNull();
    expect(out.find((f) => f.key === "monthly_volume")?.confidence).toBe(0.5);
    expect(out.find((f) => f.key === "demo_interest")?.confidence).toBeNull();
  });

  it("clamps long values to 500 characters", () => {
    const out = extractFindings({ findings: [{ key: "tools", value: "x".repeat(900) }] });
    expect(out[0]?.value.length).toBe(500);
  });

  it("returns an empty array for missing, empty, or junk payloads (never fabricates)", () => {
    expect(extractFindings({})).toEqual([]);
    expect(extractFindings({ findings: null })).toEqual([]);
    expect(extractFindings({ findings: "garbage" })).toEqual([]);
    expect(extractFindings({ unrelated: 123 })).toEqual([]);
  });

  it("exposes the canonical key set it enforces", () => {
    expect(CANONICAL_FINDING_KEYS).toContain("mobile");
    expect(CANONICAL_FINDING_KEYS).toContain("opt_in");
    expect(CANONICAL_FINDING_KEYS.length).toBe(7);
  });
});
