import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { ExploriumAdapter } from "./index";
import businessMatch from "./fixtures/businessMatch.json";
import businessEnrich from "./fixtures/businessEnrich.json";
import businessMatchEmpty from "./fixtures/businessMatchEmpty.json";
import prospectMatch from "./fixtures/prospectMatch.json";
import prospectEnrich from "./fixtures/prospectEnrich.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
}

describe("ExploriumAdapter", () => {
  it("is not configured without an API key", () => {
    expect(new ExploriumAdapter().isConfigured()).toBe(false);
    expect(new ExploriumAdapter({ apiKey: "k" }).isConfigured()).toBe(true);
  });

  it("enrichCompany does match→enrich and maps firmographics incl. techStack", async () => {
    const transport = stubTransport([{ body: businessMatch }, { body: businessEnrich }]);
    const adapter = new ExploriumAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany({ domain: "alnoorjewellery.ae" }, ctx);

    expect(result.matched).toBe(true);
    expect(transport.calls.length).toBe(2); // match then enrich
    const company = result.data!;
    expect(company.name).toBe("Al Noor Jewellery LLC");
    expect(company.domain).toBe("alnoorjewellery.ae"); // normalised from raw URL
    expect(company.industry).toBe("Luxury Goods & Jewelry");
    expect(company.country).toBe("United Arab Emirates");
    expect(company.region).toBe("Dubai");
    expect(company.techStack).toEqual(["Shopify", "Cloudflare", "Google Analytics", "Klaviyo"]);
    expect(company.sources?.techStack).toBe("explorium"); // provenance recorded

    // Cost is carried on the result (NOT recorded via ctx), mirroring Places.
    expect(result.cost?.costUsd).toBeGreaterThan(0);
    expect(result.cost?.provider).toBe("explorium");

    // Step 1 matched by domain; step 2 enriched by the returned business_id.
    expect(transport.calls[0]?.url).toContain("/businesses/match");
    expect(transport.calls[0]?.body).toContain("alnoorjewellery.ae");
    expect(transport.calls[1]?.url).toContain("/businesses/enrich");
    expect(transport.calls[1]?.body).toContain("expl_biz_alnoor_001");
  });

  it("sends a Bearer Authorization header", async () => {
    const transport = stubTransport([{ body: businessMatch }, { body: businessEnrich }]);
    const adapter = new ExploriumAdapter({ apiKey: "secret-key", transport });
    const { ctx } = ctxWithCosts();
    await adapter.enrichCompany({ domain: "alnoorjewellery.ae" }, ctx);
    expect(transport.calls[0]?.headers?.["Authorization"]).toBe("Bearer secret-key");
  });

  it("short-circuits when the match returns no business_id (no enrich call)", async () => {
    const transport = stubTransport([{ body: businessMatchEmpty }]);
    const adapter = new ExploriumAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany({ domain: "nope.example" }, ctx);

    expect(result.matched).toBe(false);
    expect(result.data).toBeNull();
    expect(transport.calls.length).toBe(1); // ONLY the match call was made
  });

  it("returns matched:false without any call when no domain is supplied", async () => {
    const transport = stubTransport([]);
    const adapter = new ExploriumAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();
    const result = await adapter.enrichCompany({ name: "no domain here" }, ctx);
    expect(result.matched).toBe(false);
    expect(transport.calls.length).toBe(0);
  });

  it("retries a 429 on the enrich step and recovers", async () => {
    const transport = stubTransport([
      { body: businessMatch },
      { status: 429, body: { error: "rate limited" } },
      { body: businessEnrich },
    ]);
    const adapter = new ExploriumAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany({ domain: "alnoorjewellery.ae" }, ctx);

    expect(result.matched).toBe(true);
    expect(result.data?.name).toBe("Al Noor Jewellery LLC");
    expect(transport.calls.length).toBe(3); // match + failed enrich + retried enrich
  });

  it("enrichContact does match→enrich and maps seniority + emailStatus enums", async () => {
    const transport = stubTransport([{ body: prospectMatch }, { body: prospectEnrich }]);
    const adapter = new ExploriumAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichContact(
      { email: "fatima@alnoorjewellery.ae", companyDomain: "alnoorjewellery.ae" },
      ctx,
    );

    expect(result.matched).toBe(true);
    expect(transport.calls.length).toBe(2);
    const contact = result.data!;
    expect(contact.fullName).toBe("Fatima Al Mansoori");
    expect(contact.title).toBe("VP of Retail Operations");
    expect(contact.seniority).toBe("vp"); // mapped onto our enum
    expect(contact.emailStatus).toBe("verified"); // "valid" -> verified
    expect(contact.companyDomain).toBe("alnoorjewellery.ae");
    expect(contact.linkedinUrl).toContain("linkedin.com");
    expect(result.cost?.costUsd).toBeGreaterThan(0);
  });
});
