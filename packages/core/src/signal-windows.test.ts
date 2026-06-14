import { describe, it, expect } from "vitest";
import { DEFAULT_SIGNAL_TTL_DAYS, signalExpiry } from "./signal-windows";
import { signalDecayFactor } from "./scoring";

describe("signal windows", () => {
  it("assigns expiry from type TTL", () => {
    const detectedAt = new Date("2026-06-01T00:00:00Z");
    const exp = signalExpiry("hiring", detectedAt);
    expect(exp.toISOString().slice(0, 10)).toBe("2026-07-01"); // +30 days
    expect(signalExpiry("funding", detectedAt).toISOString().slice(0, 10)).toBe("2026-08-30"); // +90
  });

  it("honours a TTL override", () => {
    const detectedAt = new Date("2026-06-01T00:00:00Z");
    expect(signalExpiry("hiring", detectedAt, { hiring: 10 }).toISOString().slice(0, 10)).toBe(
      "2026-06-11",
    );
  });

  it("a freshly-assigned window has full strength at detection, zero past expiry", () => {
    const detectedAt = new Date("2026-06-01T00:00:00Z");
    const exp = signalExpiry("hiring", detectedAt);
    expect(signalDecayFactor(detectedAt, exp, detectedAt)).toBe(1);
    expect(signalDecayFactor(detectedAt, exp, new Date("2026-08-01T00:00:00Z"))).toBe(0);
  });

  it("covers every signal type", () => {
    const types = Object.keys(DEFAULT_SIGNAL_TTL_DAYS);
    expect(types).toEqual(
      expect.arrayContaining([
        "hiring",
        "funding",
        "tech_adoption",
        "job_change",
        "news",
        "web_change",
      ]),
    );
  });
});
