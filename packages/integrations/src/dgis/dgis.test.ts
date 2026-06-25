import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { DGISAdapter } from "./index";
import { dgisItemToCompany, type DgisItem } from "./mapper";
import fixture from "./fixtures/items.json";

const makeCtx = (): { ctx: AdapterContext; costs: CostRecord[] } => {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
};

describe("dgisItemToCompany", () => {
  it("extracts name, phone, website, domain, coords, category, country=AE", () => {
    const item = fixture.result.items[0] as DgisItem;
    const c = dgisItemToCompany(item);
    expect(c.name).toBe("Acme Real Estate Brokerage");
    expect(c.phone).toBe("+97141234567");
    expect(c.website).toBe("https://acme.ae");
    expect(c.domain).toBe("acme.ae");
    expect(c.country).toBe("AE");
    expect(c.localCategory).toBe("Real estate agency");
    expect(c.lat).toBeCloseTo(25.1853, 4);
    expect(c.lng).toBeCloseTo(55.2654, 4);
    expect(c.placeId).toBe("70000001006739226");
    expect(c.sources?.phone).toBe("2gis");
  });

  it("leaves phone null when none is listed (never fabricates)", () => {
    const item = fixture.result.items[1] as DgisItem;
    const c = dgisItemToCompany(item);
    expect(c.phone).toBeNull();
    expect(c.website).toBeNull();
    expect(c.domain).toBeNull();
  });
});

describe("DGISAdapter", () => {
  it("isConfigured reflects the API key", () => {
    expect(new DGISAdapter().isConfigured()).toBe(false);
    expect(new DGISAdapter({ apiKey: "   " }).isConfigured()).toBe(false);
    expect(new DGISAdapter({ apiKey: "k" }).isConfigured()).toBe(true);
  });

  it("returns [] when not configured (no live call)", async () => {
    const { ctx } = makeCtx();
    expect(await new DGISAdapter().discoverCompanies({ text: "x" }, ctx)).toEqual([]);
  });

  it("discoverCompanies maps the catalog response and records a quota unit", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new DGISAdapter({ apiKey: "k", transport });
    const { ctx, costs } = makeCtx();
    const companies = await adapter.discoverCompanies({ text: "real estate agency Dubai" }, ctx);
    expect(companies).toHaveLength(2);
    expect(companies[0]?.phone).toBe("+97141234567");
    expect(costs).toHaveLength(1);
    // The key must be sent as a query param to the catalog endpoint.
    expect(transport.calls[0]?.url).toContain("catalog.api.2gis.com/3.0/items");
    expect(transport.calls[0]?.url).toContain("key=k");
  });

  it("enrichCompany returns the first match with matched=true", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new DGISAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();
    const res = await adapter.enrichCompany({ name: "Acme Real Estate" }, ctx);
    expect(res.matched).toBe(true);
    expect(res.data?.phone).toBe("+97141234567");
  });

  it("enrichContact is a no-op (2GIS is a firm directory, not a person source)", async () => {
    const { ctx } = makeCtx();
    const res = await new DGISAdapter({ apiKey: "k" }).enrichContact({ fullName: "x" }, ctx);
    expect(res.matched).toBe(false);
    expect(res.data).toBeNull();
  });
});
