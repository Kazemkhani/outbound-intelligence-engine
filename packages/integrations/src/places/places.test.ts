import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { PlacesAdapter } from "./index";
import fixture from "./fixtures/searchText.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
}

describe("PlacesAdapter", () => {
  it("is not configured without an API key", () => {
    expect(new PlacesAdapter().isConfigured()).toBe(false);
    expect(new PlacesAdapter({ apiKey: "k" }).isConfigured()).toBe(true);
  });

  it("discovers and normalises local companies from a fixture", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new PlacesAdapter({ apiKey: "k", transport });
    const { ctx, costs } = ctxWithCosts();

    const companies = await adapter.discoverCompanies({ text: "jewellery stores in Dubai" }, ctx);

    expect(companies).toHaveLength(2);
    const first = companies[0]!;
    expect(first.name).toBe("Al Noor Jewellery LLC");
    expect(first.domain).toBe("alnoorjewellery.ae"); // normalised from websiteUri
    expect(first.placeId).toBe("ChIJ_seed_jeweller_dubai");
    expect(first.localCategory).toBe("jewelry_store");
    expect(first.country).toBe("United Arab Emirates");
    expect(first.lat).toBeCloseTo(25.2697);
    expect(first.sources?.placeId).toBe("places"); // provenance recorded
    expect(costs).toHaveLength(1);
    expect(costs[0]?.provider).toBe("places");

    // The request carried the correct field mask and query.
    expect(transport.calls[0]?.headers?.["X-Goog-FieldMask"]).toContain("places.id");
    expect(transport.calls[0]?.body).toContain("jewellery stores in Dubai");
  });

  it("enrichCompany returns the first match with a cost on the result", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new PlacesAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();
    const result = await adapter.enrichCompany({ name: "Al Noor Jewellery" }, ctx);
    expect(result.matched).toBe(true);
    expect(result.data?.placeId).toBe("ChIJ_seed_jeweller_dubai");
    expect(result.cost?.costUsd).toBeGreaterThan(0);
  });

  it("maps a 429 onto a retryable rate_limit error and retries", async () => {
    const transport = stubTransport([{ status: 429, body: { error: "quota" } }, { body: fixture }]);
    const adapter = new PlacesAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();
    const companies = await adapter.discoverCompanies({ text: "x" }, ctx);
    expect(companies).toHaveLength(2); // recovered on the retry
    expect(transport.calls.length).toBe(2);
  });

  it("enrichContact is a no-op (Places has no people data)", async () => {
    const adapter = new PlacesAdapter({ apiKey: "k", transport: stubTransport([]) });
    const { ctx } = ctxWithCosts();
    const r = await adapter.enrichContact({ fullName: "x" }, ctx);
    expect(r.matched).toBe(false);
    expect(r.data).toBeNull();
  });
});
