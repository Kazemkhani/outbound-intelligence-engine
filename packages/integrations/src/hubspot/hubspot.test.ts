import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { HubSpotAdapter } from "./index";
import {
  toHubspotCompanyProperties,
  fromHubspotCompanyObject,
  toHubspotContactProperties,
  fromHubspotContactObject,
} from "./mapper";
import companySearchFixture from "./fixtures/companySearch.json";
import companySearchEmptyFixture from "./fixtures/companySearchEmpty.json";
import companyCreateFixture from "./fixtures/companyCreate.json";
import companyUpdateFixture from "./fixtures/companyUpdate.json";
import contactSearchFixture from "./fixtures/contactSearch.json";
import contactSearchEmptyFixture from "./fixtures/contactSearchEmpty.json";
import contactCreateFixture from "./fixtures/contactCreate.json";
import contactUpdateFixture from "./fixtures/contactUpdate.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: false, recordCost: (c) => costs.push(c) }, costs };
}

// ── Configuration ──────────────────────────────────────────────────────────────

describe("HubSpotAdapter — configuration", () => {
  it("is not configured without an access token", () => {
    expect(new HubSpotAdapter().isConfigured()).toBe(false);
  });

  it("is configured when an access token is present", () => {
    expect(new HubSpotAdapter({ accessToken: "pat-eu1-abc" }).isConfigured()).toBe(true);
  });
});

// ── upsertCompany ──────────────────────────────────────────────────────────────

describe("HubSpotAdapter — upsertCompany", () => {
  it("creates a company when the domain search returns no results (created: true)", async () => {
    // Queue: search (empty) → create
    const transport = stubTransport([
      { body: companySearchEmptyFixture },
      { body: companyCreateFixture },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "tok", transport });
    const { ctx, costs } = ctxWithCosts();

    const ref = await adapter.upsertCompany(
      {
        name: "Sahara Logistics LLC",
        domain: "saharalogistics.ae",
        industry: "TRANSPORTATION_AND_STORAGE",
        employeeCount: 320,
        country: "United Arab Emirates",
        website: "https://www.saharalogistics.ae",
      },
      ctx,
    );

    expect(ref.provider).toBe("hubspot");
    expect(ref.objectType).toBe("company");
    expect(ref.externalId).toBe("9988776655");
    expect(ref.created).toBe(true);

    // Exactly two HTTP calls: search then create (no patch).
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]?.url).toContain("/companies/search");
    expect(transport.calls[0]?.method).toBe("POST");
    expect(transport.calls[1]?.url).toContain("/crm/v3/objects/companies");
    expect(transport.calls[1]?.method).toBe("POST");
    expect(transport.calls[1]?.url).not.toContain("/search");

    // Auth header present on both calls.
    expect(transport.calls[0]?.headers?.["Authorization"]).toBe("Bearer tok");
    expect(transport.calls[1]?.headers?.["Authorization"]).toBe("Bearer tok");

    // Search body filters on domain.
    const searchBody = JSON.parse(transport.calls[0]?.body ?? "{}") as {
      filterGroups: { filters: { propertyName: string; value: string }[] }[];
    };
    expect(searchBody.filterGroups[0]?.filters[0]?.propertyName).toBe("domain");
    expect(searchBody.filterGroups[0]?.filters[0]?.value).toBe("saharalogistics.ae");

    // Cost recorded for the create write.
    expect(costs).toHaveLength(1);
    expect(costs[0]?.task).toBe("companies/create");
    expect(costs[0]?.provider).toBe("hubspot");
  });

  it("updates a company when the domain search finds a match (created: false, no duplicate create)", async () => {
    // Queue: search (hit) → patch
    const transport = stubTransport([
      { body: companySearchFixture },
      { body: companyUpdateFixture },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "tok", transport });
    const { ctx, costs } = ctxWithCosts();

    const ref = await adapter.upsertCompany(
      {
        name: "Al Noor Trading FZE",
        domain: "alnoortrading.ae",
        industry: "WHOLESALE_DISTRIBUTION",
        employeeCount: 150,
        country: "United Arab Emirates",
        website: "https://www.alnoortrading.ae",
      },
      ctx,
    );

    expect(ref.externalId).toBe("7711223344");
    expect(ref.created).toBe(false);

    // Exactly two calls: search → patch. No third create call.
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]?.method).toBe("PATCH");
    expect(transport.calls[1]?.url).toContain("/companies/7711223344");

    // Cost recorded for the update write.
    expect(costs).toHaveLength(1);
    expect(costs[0]?.task).toBe("companies/update");
  });
});

// ── upsertContact ──────────────────────────────────────────────────────────────

describe("HubSpotAdapter — upsertContact", () => {
  it("creates a contact when the email search returns no results (created: true)", async () => {
    // Queue: search (empty) → create
    const transport = stubTransport([
      { body: contactSearchEmptyFixture },
      { body: contactCreateFixture },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "tok", transport });
    const { ctx, costs } = ctxWithCosts();

    const ref = await adapter.upsertContact(
      {
        companyDomain: "saharalogistics.ae",
        fullName: "Hassan Al Rashidi",
        title: "Operations Director",
        email: "hassan@saharalogistics.ae",
        phone: "+971509876543",
        linkedinUrl: "https://www.linkedin.com/in/hassan-al-rashidi",
      },
      ctx,
    );

    expect(ref.provider).toBe("hubspot");
    expect(ref.objectType).toBe("contact");
    expect(ref.externalId).toBe("6677889900");
    expect(ref.created).toBe(true);

    // Exactly two calls: search then create.
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]?.url).toContain("/contacts/search");
    expect(transport.calls[1]?.url).not.toContain("/search");
    expect(transport.calls[1]?.method).toBe("POST");

    // Auth header present.
    expect(transport.calls[0]?.headers?.["Authorization"]).toBe("Bearer tok");

    // Search body filters on email.
    const searchBody = JSON.parse(transport.calls[0]?.body ?? "{}") as {
      filterGroups: { filters: { propertyName: string; value: string }[] }[];
    };
    expect(searchBody.filterGroups[0]?.filters[0]?.propertyName).toBe("email");
    expect(searchBody.filterGroups[0]?.filters[0]?.value).toBe("hassan@saharalogistics.ae");

    expect(costs).toHaveLength(1);
    expect(costs[0]?.task).toBe("contacts/create");
  });

  it("updates a contact when the email search finds a match (created: false, no duplicate create)", async () => {
    // Queue: search (hit) → patch
    const transport = stubTransport([
      { body: contactSearchFixture },
      { body: contactUpdateFixture },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "tok", transport });
    const { ctx, costs } = ctxWithCosts();

    const ref = await adapter.upsertContact(
      {
        companyDomain: "alnoortrading.ae",
        fullName: "Fatima Al Mansoori",
        title: "Chief Procurement Officer",
        email: "fatima@alnoortrading.ae",
        phone: "+971501234567",
        linkedinUrl: "https://www.linkedin.com/in/fatima-al-mansoori",
      },
      ctx,
    );

    expect(ref.externalId).toBe("1122334455");
    expect(ref.created).toBe(false);

    // Exactly two calls: search → patch. No third create call.
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]?.method).toBe("PATCH");
    expect(transport.calls[1]?.url).toContain("/contacts/1122334455");

    expect(costs).toHaveLength(1);
    expect(costs[0]?.task).toBe("contacts/update");
  });
});

// ── Field mapping round-trips ──────────────────────────────────────────────────

describe("mapper — company field mapping", () => {
  it("toHubspotCompanyProperties maps all unified fields to HubSpot property names", () => {
    const props = toHubspotCompanyProperties({
      name: "Al Noor Trading FZE",
      domain: "alnoortrading.ae",
      industry: "wholesale",
      employeeCount: 145,
      country: "United Arab Emirates",
      website: "https://www.alnoortrading.ae",
    });

    expect(props["name"]).toBe("Al Noor Trading FZE");
    expect(props["domain"]).toBe("alnoortrading.ae");
    expect(props["industry"]).toBe("wholesale");
    expect(props["numberofemployees"]).toBe("145"); // coerced to string
    expect(props["country"]).toBe("United Arab Emirates");
    expect(props["website"]).toBe("https://www.alnoortrading.ae");
  });

  it("fromHubspotCompanyObject maps HubSpot properties back to the unified model", () => {
    const company = fromHubspotCompanyObject({
      id: "7711223344",
      properties: {
        name: "Al Noor Trading FZE",
        domain: "alnoortrading.ae",
        industry: "WHOLESALE_DISTRIBUTION",
        numberofemployees: "145",
        country: "United Arab Emirates",
        website: "https://www.alnoortrading.ae",
      },
    });

    expect(company.name).toBe("Al Noor Trading FZE");
    expect(company.domain).toBe("alnoortrading.ae");
    expect(company.industry).toBe("WHOLESALE_DISTRIBUTION");
    expect(company.employeeCount).toBe(145); // parsed back to number
    expect(company.country).toBe("United Arab Emirates");
    expect(company.website).toBe("https://www.alnoortrading.ae");
    expect(company.sources?.name).toBe("hubspot"); // provenance
    expect(company.sources?.employeeCount).toBe("hubspot");
  });

  it("round-trips: toHubspot → fromHubspot preserves all fields", () => {
    const input = {
      name: "Test Corp",
      domain: "testcorp.io",
      industry: "TECHNOLOGY",
      employeeCount: 500,
      country: "Germany",
      website: "https://testcorp.io",
    };

    const props = toHubspotCompanyProperties(input);
    const roundTripped = fromHubspotCompanyObject({
      id: "123",
      properties: {
        name: props["name"],
        domain: props["domain"],
        industry: props["industry"],
        numberofemployees: props["numberofemployees"],
        country: props["country"],
        website: props["website"],
      },
    });

    expect(roundTripped.name).toBe(input.name);
    expect(roundTripped.domain).toBe(input.domain);
    expect(roundTripped.industry).toBe(input.industry);
    expect(roundTripped.employeeCount).toBe(input.employeeCount);
    expect(roundTripped.country).toBe(input.country);
    expect(roundTripped.website).toBe(input.website);
  });
});

describe("mapper — contact field mapping", () => {
  it("toHubspotContactProperties splits fullName and maps all fields", () => {
    const props = toHubspotContactProperties({
      companyDomain: "alnoortrading.ae",
      fullName: "Fatima Al Mansoori",
      title: "VP of Procurement",
      email: "fatima@alnoortrading.ae",
      phone: "+971501234567",
      linkedinUrl: "https://www.linkedin.com/in/fatima-al-mansoori",
    });

    expect(props["firstname"]).toBe("Fatima");
    expect(props["lastname"]).toBe("Al Mansoori");
    expect(props["email"]).toBe("fatima@alnoortrading.ae");
    expect(props["jobtitle"]).toBe("VP of Procurement"); // title → jobtitle
    expect(props["phone"]).toBe("+971501234567");
    expect(props["hs_linkedin_url"]).toBe("https://www.linkedin.com/in/fatima-al-mansoori");
  });

  it("toHubspotContactProperties handles a single-word name gracefully", () => {
    const props = toHubspotContactProperties({
      companyDomain: null,
      fullName: "Cher",
    });
    expect(props["firstname"]).toBe("Cher");
    expect(props["lastname"]).toBe("");
  });

  it("fromHubspotContactObject reassembles fullName and maps all fields", () => {
    const contact = fromHubspotContactObject({
      id: "1122334455",
      properties: {
        firstname: "Fatima",
        lastname: "Al Mansoori",
        email: "fatima@alnoortrading.ae",
        jobtitle: "VP of Procurement",
        phone: "+971501234567",
        hs_linkedin_url: "https://www.linkedin.com/in/fatima-al-mansoori",
      },
    });

    expect(contact.fullName).toBe("Fatima Al Mansoori");
    expect(contact.email).toBe("fatima@alnoortrading.ae");
    expect(contact.title).toBe("VP of Procurement");
    expect(contact.phone).toBe("+971501234567");
    expect(contact.linkedinUrl).toBe("https://www.linkedin.com/in/fatima-al-mansoori");
    expect(contact.sources?.fullName).toBe("hubspot");
    expect(contact.sources?.email).toBe("hubspot");
  });

  it("round-trips: toHubspot → fromHubspot preserves all contact fields", () => {
    const input = {
      companyDomain: "testcorp.io",
      fullName: "John Doe",
      title: "Head of Sales",
      email: "john@testcorp.io",
      phone: "+4915112345678",
      linkedinUrl: "https://www.linkedin.com/in/johndoe",
    };

    const props = toHubspotContactProperties(input);
    const roundTripped = fromHubspotContactObject({
      id: "456",
      properties: {
        firstname: props["firstname"],
        lastname: props["lastname"],
        email: props["email"],
        jobtitle: props["jobtitle"],
        phone: props["phone"],
        hs_linkedin_url: props["hs_linkedin_url"],
      },
    });

    expect(roundTripped.fullName).toBe(input.fullName);
    expect(roundTripped.email).toBe(input.email);
    expect(roundTripped.title).toBe(input.title);
    expect(roundTripped.phone).toBe(input.phone);
    expect(roundTripped.linkedinUrl).toBe(input.linkedinUrl);
  });
});

// ── Retry on 429 ───────────────────────────────────────────────────────────────

describe("HubSpotAdapter — retry", () => {
  it("retries a 429 on upsertCompany search and recovers", async () => {
    // Queue: 429 → search (empty) → create
    const transport = stubTransport([
      { status: 429, body: { status: "error", message: "You have reached your secondly limit." } },
      { body: companySearchEmptyFixture },
      { body: companyCreateFixture },
    ]);
    const adapter = new HubSpotAdapter({
      accessToken: "tok",
      transport,
    });
    const { ctx } = ctxWithCosts();

    const ref = await adapter.upsertCompany(
      { name: "Sahara Logistics LLC", domain: "saharalogistics.ae" },
      ctx,
    );

    expect(ref.created).toBe(true);
    // Three calls: 429 attempt, retry search, create.
    expect(transport.calls).toHaveLength(3);
  });

  it("retries a 429 on upsertContact search and recovers", async () => {
    // Queue: 429 → search (empty) → create
    const transport = stubTransport([
      { status: 429, body: { status: "error", message: "You have reached your secondly limit." } },
      { body: contactSearchEmptyFixture },
      { body: contactCreateFixture },
    ]);
    const adapter = new HubSpotAdapter({ accessToken: "tok", transport });
    const { ctx } = ctxWithCosts();

    const ref = await adapter.upsertContact(
      {
        companyDomain: "saharalogistics.ae",
        fullName: "Hassan Al Rashidi",
        email: "hassan@saharalogistics.ae",
      },
      ctx,
    );

    expect(ref.created).toBe(true);
    expect(transport.calls).toHaveLength(3);
  });
});
