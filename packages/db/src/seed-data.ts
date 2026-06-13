import type { IcpProfile } from "@oie/core";

/**
 * Seed ICP (brief §13.2) — "UAE SMB — Sales Teams Running ERP (seed)".
 * A concrete first target for a Gulf SMB / WhatsApp-led selling motion. Fully
 * editable; the architecture is generic. Component weights are independent
 * (the scoring engine normalises them); the composite blend must sum to 1.
 */
export const seedIcp: IcpProfile = {
  id: "seed-uae-smb-erp",
  name: "UAE SMB — Sales Teams Running ERP (seed)",
  version: 1,
  active: true,
  firmographics: {
    industries: {
      values: [
        "retail",
        "food & beverage",
        "jewellery",
        "wholesale/distribution",
        "professional services",
      ],
      weight: 0.25,
    },
    employeeCount: { min: 10, max: 200, weight: 0.15 },
    revenueBand: { values: [], weight: 0 },
    geographies: {
      countries: ["AE"],
      regions: ["Dubai", "Abu Dhabi", "Sharjah"],
      radiusKm: { lat: 25.2048, lng: 55.2708, km: 100 },
      weight: 0.2,
    },
    localCategory: {
      values: ["restaurant", "jewellery_store", "retailer", "wholesaler"],
      weight: 0.1,
    },
  },
  technographics: {
    uses: ["Odoo", "Zoho", "QuickBooks", "SAP Business One", "Tally", "Microsoft Dynamics"],
    avoids: [],
    weight: 0.15,
  },
  people: {
    titles: [
      "Owner",
      "Founder",
      "Managing Director",
      "Sales Manager",
      "Head of Sales",
      "Operations Manager",
      "Commercial Manager",
    ],
    seniority: ["c_level", "director", "manager"],
    departments: ["sales", "operations", "commercial"],
    weight: 0.2,
  },
  signals: [
    {
      type: "hiring",
      config: {
        keywords: [
          "BDR",
          "SDR",
          "Sales Executive",
          "Sales Manager",
          "Tele-sales",
          "Business Development",
        ],
      },
      weight: 0.4,
    },
    { type: "tech_adoption", config: { category: "erp", change: "new_or_expanded" }, weight: 0.25 },
    { type: "news", config: { keywords: ["new branch", "expansion"] }, weight: 0.15 },
    { type: "funding", config: {}, weight: 0.1 },
    { type: "job_change", config: { roles: ["commercial leadership"] }, weight: 0.1 },
  ],
  keywords: { include: [], exclude: [], weight: 0 },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
};
