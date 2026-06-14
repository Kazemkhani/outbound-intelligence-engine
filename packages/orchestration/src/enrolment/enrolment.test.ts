import { describe, it, expect } from "vitest";
import { qualifiesForEnrolment, type EnrolmentPolicy } from "./auto-enrol";
import { costCapStatus, assertWithinCaps, CostCapExceededError } from "./cost-caps";

const NOW = new Date("2026-06-14T00:00:00Z");
const policy: EnrolmentPolicy = { minTier: "B", qualifyingTypes: ["hiring", "funding"] };

describe("qualifiesForEnrolment", () => {
  it("enrols a fresh qualifying signal on an at-or-above-bar lead", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: new Date("2026-07-12T00:00:00Z"), tier: "A" },
      policy,
      NOW,
    );
    expect(d.enrol).toBe(true);
  });

  it("does not enrol on an expired signal", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: new Date("2026-06-01T00:00:00Z"), tier: "A" },
      policy,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("expired");
  });

  it("does not enrol a below-bar tier", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: null, tier: "C" },
      policy,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("below");
  });

  it("does not enrol a non-qualifying signal type", () => {
    const d = qualifiesForEnrolment(
      { signalType: "news", signalExpiresAt: null, tier: "A" },
      policy,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("not a qualifying");
  });
});

describe("costCapStatus", () => {
  const caps = { dailyLlmUsd: 25, dailyProviderUsd: 50 };
  it("is within caps below the thresholds", () => {
    expect(costCapStatus({ llmUsd: 10, providerUsd: 20 }, caps).halt).toBe(false);
  });
  it("halts when the LLM cap is hit", () => {
    const s = costCapStatus({ llmUsd: 25, providerUsd: 0 }, caps);
    expect(s.halt).toBe(true);
    expect(s.llmExceeded).toBe(true);
  });
  it("halts when the provider cap is hit", () => {
    expect(costCapStatus({ llmUsd: 0, providerUsd: 60 }, caps).halt).toBe(true);
  });
  it("assertWithinCaps throws when exceeded", () => {
    expect(() => assertWithinCaps({ llmUsd: 99, providerUsd: 0 }, caps)).toThrow(
      CostCapExceededError,
    );
    expect(() => assertWithinCaps({ llmUsd: 1, providerUsd: 1 }, caps)).not.toThrow();
  });
});
