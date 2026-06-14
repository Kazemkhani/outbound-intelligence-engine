import { describe, it, expect } from "vitest";
import {
  AdapterError,
  type AdapterContext,
  type CompanyQuery,
  type ContactQuery,
  type EnrichmentProvider,
  type EnrichmentResult,
  type NormalisedCompany,
} from "@oie/integrations";
import { enrichCompanyWaterfall, mergeCompany } from "./waterfall";

const ctx: AdapterContext = { dryRun: true };

/** Build a fake EnrichmentProvider returning a canned company result. */
function fakeProvider(
  name: string,
  opts: {
    configured?: boolean;
    company?: Partial<NormalisedCompany> | null;
    throws?: AdapterError;
    costUsd?: number;
  },
): EnrichmentProvider {
  return {
    name,
    isConfigured: () => opts.configured ?? true,
    async enrichCompany(): Promise<EnrichmentResult<NormalisedCompany>> {
      if (opts.throws) throw opts.throws;
      const matched = opts.company != null;
      return {
        provider: name,
        matched,
        data: matched ? ({ domain: null, name, ...opts.company } as NormalisedCompany) : null,
        cost: opts.costUsd
          ? {
              provider: name,
              task: "enrichCompany",
              units: 1,
              costUsd: opts.costUsd,
              at: new Date(0),
            }
          : undefined,
      };
    },
    async enrichContact(_q: ContactQuery) {
      return { provider: name, matched: false, data: null };
    },
  };
}

const query: CompanyQuery = { domain: "acme.io" };

describe("mergeCompany", () => {
  it("fills only missing fields and records provider attribution", () => {
    const a = mergeCompany(null, { domain: "acme.io", name: "Acme", industry: "retail" }, "p1");
    const b = mergeCompany(
      a,
      { domain: "acme.io", name: "Acme", industry: "IGNORED", employeeCount: 50 },
      "p2",
    );
    expect(b.industry).toBe("retail"); // first writer wins
    expect(b.employeeCount).toBe(50); // filled by p2
    expect(b.sources).toMatchObject({ industry: "p1", employeeCount: "p2" });
  });
});

describe("enrichCompanyWaterfall", () => {
  it("calls providers in priority order and merges fill-missing", async () => {
    const r = await enrichCompanyWaterfall(
      query,
      [
        fakeProvider("places", { company: { domain: "acme.io", name: "Acme", region: "Dubai" } }),
        fakeProvider("apollo", {
          company: { domain: "acme.io", name: "Acme", industry: "retail", employeeCount: 40 },
        }),
      ],
      ctx,
    );
    expect(r.company?.region).toBe("Dubai");
    expect(r.company?.industry).toBe("retail");
    expect(r.matchedBy).toEqual(["places", "apollo"]);
  });

  it("stops early once the record is complete enough", async () => {
    let secondCalled = false;
    const second = fakeProvider("apollo", { company: { employeeCount: 1 } });
    const wrapped: EnrichmentProvider = {
      ...second,
      async enrichCompany(q, c) {
        secondCalled = true;
        return second.enrichCompany(q, c);
      },
    };
    await enrichCompanyWaterfall(
      query,
      [
        fakeProvider("clay", {
          company: { domain: "acme.io", name: "Acme", industry: "retail", employeeCount: 40 },
        }),
        wrapped,
      ],
      ctx,
    );
    expect(secondCalled).toBe(false); // first provider already completed the record
  });

  it("falls through to the next provider on error", async () => {
    const r = await enrichCompanyWaterfall(
      query,
      [
        fakeProvider("clay", {
          throws: new AdapterError({ kind: "rate_limit", provider: "clay", message: "429" }),
        }),
        fakeProvider("apollo", {
          company: { domain: "acme.io", name: "Acme", industry: "retail", employeeCount: 40 },
        }),
      ],
      ctx,
    );
    expect(r.company?.industry).toBe("retail");
    expect(r.trace[0]).toMatchObject({ provider: "clay", outcome: "error" });
    expect(r.matchedBy).toEqual(["apollo"]);
  });

  it("skips unconfigured providers and records the trace", async () => {
    const r = await enrichCompanyWaterfall(
      query,
      [
        fakeProvider("explorium", { configured: false, company: { industry: "x" } }),
        fakeProvider("apollo", {
          company: { domain: "acme.io", name: "Acme", industry: "retail" },
          costUsd: 0.02,
        }),
      ],
      ctx,
    );
    expect(r.trace[0]).toMatchObject({ provider: "explorium", outcome: "skipped_unconfigured" });
    expect(r.costs).toHaveLength(1);
    expect(r.costs[0]?.costUsd).toBeCloseTo(0.02);
  });
});
