import { describe, expect, it } from "vitest";
import { grounding } from "@/lib/canon";

const HEADER = "# GROUNDING CANON";
const CARDINAL = "Answer only from the supplied methodology and evidence";

describe("grounding", () => {
  it("returns an empty string when no keys are given", () => {
    expect(grounding([])).toBe("");
  });

  it("returns an empty string when no key matches", () => {
    expect(grounding(["does-not-exist", "nope"])).toBe("");
  });

  it("prepends the non-invention rule", () => {
    const out = grounding(["frameworks"]);
    expect(out.startsWith(HEADER)).toBe(true);
    expect(out).toContain(CARDINAL);
    expect(out).toContain("<CONFIRM>");
    expect(out).toContain("# SALES FRAMEWORKS");
  });

  it("resolves keys case-insensitively", () => {
    expect(grounding(["FRAMEWORKS"])).toBe(grounding(["frameworks"]));
  });

  it("includes multiple distinct blocks", () => {
    const out = grounding(["frameworks", "product", "objections"]);
    expect(out).toContain("# SALES FRAMEWORKS");
    expect(out).toContain("# CONFIGURED PRODUCT FACTS");
    expect(out).toContain("# OBJECTION HANDLING");
  });

  it("deduplicates aliases", () => {
    const out = grounding(["frameworks", "FRAMEWORKS"]);
    expect(out.split("# SALES FRAMEWORKS").length - 1).toBe(1);
  });

  it("skips unknown keys while keeping known blocks", () => {
    const out = grounding(["nope", "product", "also-bad"]);
    expect(out).toContain("# CONFIGURED PRODUCT FACTS");
    expect(out.startsWith(HEADER)).toBe(true);
  });
});
