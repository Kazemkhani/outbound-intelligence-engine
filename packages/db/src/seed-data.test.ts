import { describe, it, expect } from "vitest";
import { icpProfile } from "@oie/core";
import { seedIcp } from "./seed-data";

describe("seed ICP", () => {
  it("is valid against the canonical ICP schema", () => {
    expect(() => icpProfile.parse(seedIcp)).not.toThrow();
  });

  it("uses the committed composite blend and tiers (§13.2)", () => {
    const parsed = icpProfile.parse(seedIcp);
    expect(parsed.compositeBlend).toEqual({ fit: 0.6, intent: 0.4 });
    expect(parsed.tierThresholds).toEqual({ A: 80, B: 65, C: 50 });
  });

  it("targets the UAE SMB ERP market", () => {
    expect(seedIcp.firmographics.geographies.countries).toContain("AE");
    expect(seedIcp.technographics.uses).toContain("Odoo");
    expect(seedIcp.signals.some((s) => s.type === "hiring")).toBe(true);
  });
});
