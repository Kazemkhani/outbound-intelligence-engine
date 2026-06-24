import { describe, it, expect } from "vitest";
import { grounding } from "@/lib/canon";

// The grounding() helper injects the sales canon + the cardinal rule into every AI
// prompt (Close, Knowledge, Voice Dojo). These tests pin its contract so a silent
// regression cannot strip the canon or the "answer only from this / <CONFIRM>" rule.

const HEADER = "# GROUNDING CANON";
const CARDINAL = "Answer ONLY from the methodology below";

describe("grounding", () => {
  it("returns an empty string when no keys are given", () => {
    expect(grounding([])).toBe("");
  });

  it("returns an empty string when no key matches a canon block", () => {
    expect(grounding(["does-not-exist", "nope"])).toBe("");
  });

  it("prepends the grounding header and the cardinal rule when a block matches", () => {
    const out = grounding(["frameworks"]);
    expect(out.startsWith(HEADER)).toBe(true);
    expect(out).toContain(CARDINAL);
    expect(out).toContain("<CONFIRM>");
    expect(out).toContain("# SALES FRAMEWORKS");
  });

  it("is case-insensitive on keys (UPPER and lower resolve to the same block)", () => {
    expect(grounding(["FRAMEWORKS"])).toBe(grounding(["frameworks"]));
  });

  it("includes multiple distinct blocks when asked", () => {
    const out = grounding(["frameworks", "huscribe", "objections"]);
    expect(out).toContain("# SALES FRAMEWORKS");
    expect(out).toContain("# HUSCRIBE PRODUCT AND COMPETITIVE CANON");
    expect(out).toContain("# OBJECTION HANDLING");
  });

  it("deduplicates a block requested twice (via aliases) so it appears once", () => {
    const out = grounding(["frameworks", "FRAMEWORKS"]);
    const occurrences = out.split("# SALES FRAMEWORKS").length - 1;
    expect(occurrences).toBe(1);
  });

  it("ignores unknown keys but still includes the known ones", () => {
    const out = grounding(["nope", "huscribe", "also-bad"]);
    expect(out).toContain("# HUSCRIBE PRODUCT AND COMPETITIVE CANON");
    expect(out.startsWith(HEADER)).toBe(true);
  });
});
