import type { IcpProfile } from "../icp";
import type { ScoringSubject } from "../subject";

/** A representative ICP for tests — mirrors the seed ICP (§13.2) shape. */
export const testIcp: IcpProfile = {
  id: "test-icp",
  name: "UAE SMB — Sales Teams Running ERP (test)",
  version: 1,
  active: true,
  firmographics: {
    industries: { values: ["retail", "jewellery", "food & beverage"], weight: 0.25 },
    employeeCount: { min: 10, max: 200, weight: 0.15 },
    revenueBand: { values: [], weight: 0 },
    geographies: {
      countries: ["AE"],
      regions: ["Dubai", "Abu Dhabi", "Sharjah"],
      radiusKm: { lat: 25.2048, lng: 55.2708, km: 100 },
      weight: 0.2,
    },
    localCategory: { values: ["jewellery_store", "restaurant", "retailer"], weight: 0.1 },
  },
  technographics: { uses: ["Odoo", "Zoho", "Tally"], avoids: ["Salesforce"], weight: 0.15 },
  people: {
    titles: ["Owner", "Managing Director", "Sales Manager"],
    seniority: ["c_level", "director", "manager"],
    departments: ["sales", "operations"],
    weight: 0.2,
  },
  signals: [
    {
      type: "hiring",
      config: { keywords: ["SDR", "Business Development"] },
      weight: 0.4,
    },
    { type: "tech_adoption", config: {}, weight: 0.25 },
    { type: "funding", config: {}, weight: 0.1 },
  ],
  keywords: { include: [], exclude: [], weight: 0 },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
};

export const NOW = new Date("2026-06-14T00:00:00Z");

/** A near-perfect fit with a strong, fresh hiring signal — expect tier A. */
export const perfectLead: ScoringSubject = {
  company: {
    industry: "jewellery",
    employeeCount: 45,
    region: "Dubai",
    lat: 25.2,
    lng: 55.27,
    localCategory: "jewellery_store",
    techStack: ["Odoo", "Tally"],
  },
  contact: { title: "Owner", seniority: "c_level", department: "sales" },
  signals: [
    {
      type: "hiring",
      strength: 0.9,
      detectedAt: new Date("2026-06-10T00:00:00Z"),
      expiresAt: new Date("2026-07-10T00:00:00Z"),
      evidence: { role: "SDR" },
    },
    {
      type: "tech_adoption",
      strength: 0.7,
      detectedAt: new Date("2026-06-01T00:00:00Z"),
      expiresAt: new Date("2026-08-01T00:00:00Z"),
    },
  ],
};

/** Good fit but no intent signals — fit carries it, intent drags composite down. */
export const noSignalLead: ScoringSubject = {
  company: {
    industry: "retail",
    employeeCount: 30,
    region: "Sharjah",
    localCategory: "retailer",
    techStack: ["Zoho"],
  },
  contact: { title: "Sales Manager", seniority: "manager", department: "sales" },
  signals: [],
};

/** Mostly unknown data — fit should be low (unknowns score 0 with weight retained). */
export const unknownLead: ScoringSubject = {
  company: {},
  contact: {},
  signals: [],
};

/** Wrong market + uses an avoided tool — should disqualify technographics and rank low. */
export const poorFitLead: ScoringSubject = {
  company: {
    industry: "aerospace",
    employeeCount: 5000,
    country: "US",
    techStack: ["Salesforce"],
  },
  contact: { title: "Intern", seniority: "ic", department: "engineering" },
  signals: [],
};

/** Strong fit but the only signal has fully expired — intent must be 0. */
export const expiredSignalLead: ScoringSubject = {
  company: {
    industry: "jewellery",
    employeeCount: 50,
    region: "Dubai",
    techStack: ["Odoo"],
  },
  contact: { title: "Managing Director", seniority: "director", department: "operations" },
  signals: [
    {
      type: "hiring",
      strength: 1,
      detectedAt: new Date("2026-01-01T00:00:00Z"),
      expiresAt: new Date("2026-02-01T00:00:00Z"), // long expired by NOW
      evidence: { role: "SDR" },
    },
  ],
};
