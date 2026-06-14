import { describe, it, expect } from "vitest";
import { type IcpProfile, companyDedupeKey, scoreLead, rankByComposite } from "@oie/core";
import {
  PlacesAdapter,
  stubTransport,
  type AdapterContext,
  type EnrichmentProvider,
  type EnrichmentResult,
  type NormalisedCompany,
  type NormalisedSignal,
} from "@oie/integrations";
import { enrichCompanyWaterfall } from "./waterfall";
import { toScoringSubject } from "./scoring-bridge";

/** Minimal valid ICP for the integration test (mirrors the seed shape). */
const icp: IcpProfile = {
  id: "pipeline-icp",
  name: "pipeline",
  version: 1,
  active: true,
  firmographics: {
    industries: { values: ["jewellery", "retail"], weight: 0.25 },
    employeeCount: { min: 10, max: 200, weight: 0.15 },
    revenueBand: { values: [], weight: 0 },
    geographies: { countries: ["United Arab Emirates"], regions: ["Dubai"], weight: 0.2 },
    localCategory: { values: ["jewelry_store", "restaurant"], weight: 0.1 },
  },
  technographics: { uses: ["Odoo"], avoids: [], weight: 0.15 },
  people: { titles: ["Owner"], seniority: ["c_level"], departments: ["sales"], weight: 0.15 },
  signals: [{ type: "hiring", config: {}, weight: 0.4 }],
  keywords: { include: [], exclude: [], weight: 0 },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
};

const PLACES_BODY = {
  places: [
    {
      id: "ChIJ_jeweller",
      displayName: { text: "Al Noor Jewellery LLC" },
      formattedAddress: "Gold Souk, Deira, Dubai, United Arab Emirates",
      location: { latitude: 25.2697, longitude: 55.2972 },
      types: ["jewelry_store"],
      websiteUri: "https://alnoorjewellery.ae",
    },
    {
      id: "ChIJ_restaurant",
      displayName: { text: "Bait Al Mandi" },
      formattedAddress: "Al Karama, Dubai, United Arab Emirates",
      location: { latitude: 25.2456, longitude: 55.3047 },
      types: ["restaurant"],
      websiteUri: "https://baitalmandi.ae",
    },
  ],
};

/** A fake Apollo-style provider that fills firmographics for the jewellery shop. */
const fakeApollo: EnrichmentProvider = {
  name: "apollo",
  isConfigured: () => true,
  async enrichCompany(query): Promise<EnrichmentResult<NormalisedCompany>> {
    if (query.domain !== "alnoorjewellery.ae")
      return { provider: "apollo", matched: false, data: null };
    return {
      provider: "apollo",
      matched: true,
      data: {
        domain: "alnoorjewellery.ae",
        name: "Al Noor Jewellery LLC",
        industry: "jewellery",
        employeeCount: 45,
        techStack: ["Odoo"],
      },
      cost: { provider: "apollo", task: "enrich", units: 1, costUsd: 0.02, at: new Date(0) },
    };
  },
  async enrichContact() {
    return { provider: "apollo", matched: false, data: null };
  },
};

describe("Stream A pipeline: discover → dedupe → enrich → score → rank", () => {
  const ctx: AdapterContext = { dryRun: true };

  it("runs a fixture-backed ICP pass with provider attribution and no duplicates", async () => {
    const places = new PlacesAdapter({
      apiKey: "k",
      transport: stubTransport([{ body: PLACES_BODY }]),
    });

    // 1. Discover local companies.
    const discovered = await places.discoverCompanies(
      { text: "jewellery and restaurants in Dubai" },
      ctx,
    );
    expect(discovered).toHaveLength(2);

    // 2. Dedupe on the unified identity key.
    const keys = new Set(discovered.map((c) => companyDedupeKey(c)));
    expect(keys.size).toBe(2); // distinct domains → no duplicates
    expect(keys.has("domain:alnoorjewellery.ae")).toBe(true);

    // 3. Enrich the jewellery shop through the waterfall (Places seed → Apollo fill).
    const seedProvider: EnrichmentProvider = {
      name: "places",
      isConfigured: () => true,
      enrichCompany: async () => ({ provider: "places", matched: true, data: discovered[0]! }),
      enrichContact: async () => ({ provider: "places", matched: false, data: null }),
    };
    const wf = await enrichCompanyWaterfall(
      { domain: "alnoorjewellery.ae", name: "Al Noor Jewellery LLC" },
      [seedProvider, fakeApollo],
      ctx,
    );
    expect(wf.company?.placeId).toBe("ChIJ_jeweller"); // from Places
    expect(wf.company?.industry).toBe("jewellery"); // from Apollo
    expect(wf.company?.sources?.placeId).toBe("places");
    expect(wf.company?.sources?.industry).toBe("apollo"); // provider attribution
    expect(wf.matchedBy).toEqual(["places", "apollo"]);

    // 4. Score against the ICP with a fresh hiring signal.
    const now = new Date("2026-06-14T00:00:00Z");
    const signals: NormalisedSignal[] = [
      {
        type: "hiring",
        strength: 0.9,
        provider: "theirstack",
        detectedAt: new Date("2026-06-12T00:00:00Z"),
        expiresAt: new Date("2026-07-12T00:00:00Z"),
        evidence: { role: "Sales Executive" },
      },
    ];
    const contact = {
      companyDomain: "alnoorjewellery.ae",
      fullName: "Aisha",
      title: "Owner",
      seniority: "c_level" as const,
      department: "sales",
    };
    const subject = toScoringSubject(wf.company!, contact, signals);
    const score = scoreLead(subject, icp, now);

    expect(score.fit).toBeGreaterThanOrEqual(90);
    expect(score.intent).toBeGreaterThan(70);
    expect(score.tier).toBe("A");

    // 5. Rank: the enriched jewellery shop outranks the bare restaurant.
    const restaurantSubject = toScoringSubject(discovered[1]!, null, []);
    const ranked = rankByComposite([
      { id: "restaurant", score: scoreLead(restaurantSubject, icp, now) },
      { id: "jeweller", score },
    ]);
    expect(ranked[0]!.id).toBe("jeweller");
  });
});
