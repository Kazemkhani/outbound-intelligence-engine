import { describe, it, expect } from "vitest";
import { SCENARIOS, findScenario } from "./scenarios";

describe("findScenario", () => {
  it("returns a scenario by id", () => {
    const s = findScenario("brokerage-owner-has-team");
    expect(s?.name).toBe("Brokerage owner who has a team");
  });

  it("returns undefined for an unknown id", () => {
    expect(findScenario("does-not-exist")).toBeUndefined();
  });
});

describe("SCENARIOS integrity", () => {
  it("has at least three scenarios with unique ids", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(3);
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scenario has the fields the dojo needs", () => {
    for (const s of SCENARIOS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.blurb).toBeTruthy();
      expect(s.opener).toBeTruthy();
      expect(s.persona.length).toBeGreaterThan(80); // a real persona, not a stub
      expect(["Warm", "Tough", "Brutal"]).toContain(s.difficulty);
      expect(s.tags.length).toBeGreaterThan(0);
    }
  });
});
