import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { SearchApiAdapter } from "./index";
import fixture from "./fixtures/googleMaps.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
}

describe("SearchApiAdapter", () => {
  it("is not configured without an API key", () => {
    expect(new SearchApiAdapter().isConfigured()).toBe(false);
    expect(new SearchApiAdapter({ apiKey: "k" }).isConfigured()).toBe(true);
  });

  it("discovers and normalises local companies from a fixture", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new SearchApiAdapter({ apiKey: "k", transport });
    const { ctx, costs } = ctxWithCosts();

    const companies = await adapter.discoverCompanies(
      { text: "real estate developers in Dubai" },
      ctx,
    );

    expect(companies).toHaveLength(2);
    const first = companies[0]!;
    expect(first.name).toBe("Al Noor Real Estate Developers");
    expect(first.domain).toBe("alnoordev.ae"); // normalised from website
    expect(first.placeId).toBe("ChIJ_searchapi_dev_dubai");
    expect(first.localCategory).toBe("Real estate developer");
    expect(first.country).toBe("United Arab Emirates");
    expect(first.lat).toBeCloseTo(25.1867);
    // The Google Maps switchboard phone is preserved in socials (no person PII).
    expect((first.socials as Record<string, unknown> | null)?.phone).toBe("800 4573");
    expect(first.sources?.placeId).toBe("searchapi"); // provenance recorded
    expect(costs).toHaveLength(1);
    expect(costs[0]?.provider).toBe("searchapi");

    // The request hit the google_maps engine with the query + Bearer auth.
    expect(transport.calls[0]?.url).toContain("engine=google_maps");
    expect(transport.calls[0]?.url).toContain("real%20estate%20developers%20in%20Dubai");
    expect(transport.calls[0]?.headers?.["Authorization"]).toContain("Bearer");
  });

  it("enrichCompany returns the first match with a cost on the result", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new SearchApiAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();
    const result = await adapter.enrichCompany({ name: "Al Noor Real Estate" }, ctx);
    expect(result.matched).toBe(true);
    expect(result.data?.placeId).toBe("ChIJ_searchapi_dev_dubai");
    expect(result.cost?.costUsd).toBeGreaterThan(0);
  });

  it("maps a 429 onto a retryable rate_limit error and retries", async () => {
    const transport = stubTransport([{ status: 429, body: { error: "quota" } }, { body: fixture }]);
    const adapter = new SearchApiAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();
    const companies = await adapter.discoverCompanies({ text: "x" }, ctx);
    expect(companies).toHaveLength(2); // recovered on the retry
    expect(transport.calls.length).toBe(2);
  });

  it("enrichContact is a no-op (SearchApi Maps has no people data)", async () => {
    const adapter = new SearchApiAdapter({ apiKey: "k", transport: stubTransport([]) });
    const { ctx } = ctxWithCosts();
    const r = await adapter.enrichContact({ fullName: "x" }, ctx);
    expect(r.matched).toBe(false);
    expect(r.data).toBeNull();
  });
});
