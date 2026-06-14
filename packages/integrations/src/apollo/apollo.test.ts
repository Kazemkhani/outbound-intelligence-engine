import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { ApolloAdapter } from "./index";
import orgFixture from "./fixtures/organizationEnrich.json";
import peopleFixture from "./fixtures/peopleSearch.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
}

describe("ApolloAdapter", () => {
  it("is not configured without an API key", () => {
    expect(new ApolloAdapter().isConfigured()).toBe(false);
    expect(new ApolloAdapter({ apiKey: "k" }).isConfigured()).toBe(true);
  });

  it("enrichCompany maps organisation fields and carries cost on the result", async () => {
    const transport = stubTransport([{ body: orgFixture }]);
    const adapter = new ApolloAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany({ domain: "alnoortrading.ae" }, ctx);

    expect(result.matched).toBe(true);
    expect(result.data?.name).toBe("Al Noor Trading FZE");
    expect(result.data?.domain).toBe("alnoortrading.ae"); // normalised
    expect(result.data?.website).toBe("https://www.alnoortrading.ae");
    expect(result.data?.industry).toBe("wholesale");
    expect(result.data?.employeeCount).toBe(145); // from estimated_num_employees
    expect(result.data?.sources?.employeeCount).toBe("apollo"); // provenance
    expect(result.cost?.provider).toBe("apollo");
    expect(result.cost?.costUsd).toBeGreaterThan(0);

    // Auth header and domain query carried correctly.
    expect(transport.calls[0]?.headers?.["X-Api-Key"]).toBe("k");
    expect(transport.calls[0]?.url).toContain("domain=alnoortrading.ae");
  });

  it("enrichContact maps the first person incl. seniority + emailStatus normalisation", async () => {
    const transport = stubTransport([{ body: peopleFixture }]);
    const adapter = new ApolloAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichContact(
      { companyDomain: "alnoortrading.ae", titles: ["VP of Procurement"] },
      ctx,
    );

    expect(result.matched).toBe(true);
    expect(result.data?.fullName).toBe("Fatima Al Mansoori");
    expect(result.data?.companyDomain).toBe("alnoortrading.ae");
    expect(result.data?.title).toBe("VP of Procurement");
    expect(result.data?.seniority).toBe("vp"); // mapped to our enum
    expect(result.data?.department).toBe("operations");
    expect(result.data?.email).toBe("fatima@alnoortrading.ae");
    expect(result.data?.emailStatus).toBe("verified"); // mapped to our enum
    expect(result.data?.linkedinUrl).toContain("linkedin.com/in/fatima");
    expect(result.cost?.provider).toBe("apollo");
    expect(result.cost?.costUsd).toBeGreaterThan(0);

    // Auth header and search body carried correctly.
    expect(transport.calls[0]?.headers?.["X-Api-Key"]).toBe("k");
    expect(transport.calls[0]?.body).toContain("alnoortrading.ae");
    expect(transport.calls[0]?.body).toContain("VP of Procurement");
  });

  it("retries a 429 and recovers", async () => {
    const transport = stubTransport([
      { status: 429, body: { error: "rate limited" } },
      { body: orgFixture },
    ]);
    const adapter = new ApolloAdapter({ apiKey: "k", transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany({ domain: "alnoortrading.ae" }, ctx);

    expect(result.matched).toBe(true); // recovered on the retry
    expect(transport.calls.length).toBe(2);
  });

  it("returns unmatched when the query lacks the required key", async () => {
    const adapter = new ApolloAdapter({ apiKey: "k", transport: stubTransport([]) });
    const { ctx } = ctxWithCosts();

    const company = await adapter.enrichCompany({ name: "no domain" }, ctx);
    expect(company.matched).toBe(false);
    expect(company.data).toBeNull();

    const contact = await adapter.enrichContact({ fullName: "no domain" }, ctx);
    expect(contact.matched).toBe(false);
    expect(contact.data).toBeNull();
  });
});
