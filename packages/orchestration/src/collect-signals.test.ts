import { describe, it, expect } from "vitest";
import {
  AdapterError,
  type AdapterContext,
  type NormalisedSignal,
  type SignalProvider,
  type SignalQuery,
} from "@oie/integrations";
import { collectSignals } from "./collect-signals";

const ctx: AdapterContext = { dryRun: true };
const query: SignalQuery = { companyDomain: "acme.io" };

function fakeSignalProvider(
  name: string,
  opts: { configured?: boolean; signals?: NormalisedSignal[]; throws?: AdapterError },
): SignalProvider {
  return {
    name,
    isConfigured: () => opts.configured ?? true,
    async fetchSignals() {
      if (opts.throws) throw opts.throws;
      return opts.signals ?? [];
    },
  };
}

function hiringSignal(provider: string, strength: number, url: string): NormalisedSignal {
  return {
    companyDomain: "acme.io",
    type: "hiring",
    strength,
    provider,
    sourceUrl: url,
    detectedAt: new Date("2026-06-10T00:00:00Z"),
  };
}

describe("collectSignals", () => {
  it("fans in across providers and assigns decay windows centrally", async () => {
    const { signals, trace } = await collectSignals(
      [
        fakeSignalProvider("theirstack", {
          signals: [hiringSignal("theirstack", 0.8, "https://acme.io/a")],
        }),
        fakeSignalProvider("predictleads", {
          signals: [
            {
              companyDomain: "acme.io",
              type: "funding",
              strength: 0.9,
              provider: "predictleads",
              detectedAt: new Date("2026-06-09T00:00:00Z"),
            },
          ],
        }),
      ],
      query,
      ctx,
    );
    expect(signals).toHaveLength(2);
    // expiry assigned per type: hiring +30d, funding +90d.
    const hiring = signals.find((s) => s.type === "hiring")!;
    const funding = signals.find((s) => s.type === "funding")!;
    expect(hiring.expiresAt?.toISOString().slice(0, 10)).toBe("2026-07-10");
    expect(funding.expiresAt?.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(trace.every((t) => t.outcome === "ok")).toBe(true);
  });

  it("dedupes the same event across providers, keeping the stronger", async () => {
    const { signals } = await collectSignals(
      [
        fakeSignalProvider("theirstack", {
          signals: [hiringSignal("theirstack", 0.6, "https://acme.io/jobs/sdr")],
        }),
        fakeSignalProvider("exa", {
          signals: [hiringSignal("exa", 0.85, "https://acme.io/jobs/sdr?ref=x")],
        }),
      ],
      query,
      ctx,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.strength).toBe(0.85); // stronger one wins
  });

  it("skips unconfigured providers and continues past an erroring one", async () => {
    const { signals, trace } = await collectSignals(
      [
        fakeSignalProvider("exa", {
          configured: false,
          signals: [hiringSignal("exa", 0.9, "https://x/y")],
        }),
        fakeSignalProvider("predictleads", {
          throws: new AdapterError({
            kind: "provider_unavailable",
            provider: "predictleads",
            message: "503",
          }),
        }),
        fakeSignalProvider("theirstack", {
          signals: [hiringSignal("theirstack", 0.7, "https://acme.io/z")],
        }),
      ],
      query,
      ctx,
    );
    expect(signals).toHaveLength(1);
    expect(trace.map((t) => t.outcome)).toEqual(["skipped_unconfigured", "error", "ok"]);
  });
});
