import type { PersonalisationInput } from "../personalise";

/**
 * Labelled eval cases for the LLM personalisation and extraction steps.
 *
 * Each case carries:
 * - `id`           — stable identifier for regression tracking
 * - `description`  — what the case is testing
 * - `input`        — the value passed to the function under test
 * - `assertions`   — array of named predicates the output must satisfy
 *
 * The LLM reasons; code checks the assertions. No scores are emitted by the
 * model; no assertions compare numbers returned by the model (brief scoring
 * conventions: "the LLM must NEVER emit a score").
 */

// ── Personalisation eval cases ───────────────────────────────────────────────

export interface PersonalisationAssertion {
  name: string;
  /** Returns true when the output satisfies the assertion. */
  check: (output: { opener: string; citedSignal: string }) => boolean;
}

export interface PersonalisationCase {
  id: string;
  description: string;
  input: PersonalisationInput;
  assertions: PersonalisationAssertion[];
}

const BANNED_GENERIC_PHRASES = [
  "i hope this finds you well",
  "hope you're doing well",
  "reaching out to connect",
  "i came across your profile",
  "touching base",
  "just wanted to reach out",
  "i wanted to connect",
  "my name is",
  "i am writing to",
  "i'm writing to",
  "pleased to meet you",
];

function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_GENERIC_PHRASES.some((p) => lower.includes(p));
}

function makeSdrHiringInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "acmecorp.ae",
      fullName: "Sarah Al-Mansouri",
      title: "Head of Sales",
      seniority: "director",
      department: "sales",
    },
    company: {
      domain: "acmecorp.ae",
      name: "Acme Corp",
      industry: "software",
      employeeCount: 120,
      country: "UAE",
    },
    signal: {
      type: "hiring",
      strength: 0.85,
      provider: "theirstack",
      detectedAt: new Date("2026-06-01"),
      evidence: {
        jobTitle: "SDR",
        postCount: 3,
        atsUrl: "https://acmecorp.ae/jobs/sdr",
      },
      sourceUrl: "https://theirstack.com/signals/acme-sdr",
    },
    maxChars: 300,
  };
}

function makeFundingInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "goldenretail.ae",
      fullName: "Mohammed Al-Rashid",
      title: "Managing Director",
      seniority: "c_level",
      department: "operations",
    },
    company: {
      domain: "goldenretail.ae",
      name: "Golden Retail LLC",
      industry: "retail",
      employeeCount: 45,
      country: "UAE",
      region: "Dubai",
    },
    signal: {
      type: "funding",
      strength: 0.9,
      provider: "predictleads",
      detectedAt: new Date("2026-05-20"),
      evidence: {
        round: "Series A",
        amountUsd: 5_000_000,
        announcement: "Golden Retail LLC closes $5M Series A to expand across GCC",
      },
      sourceUrl: "https://predictleads.com/events/golden-retail-series-a",
    },
    maxChars: 300,
  };
}

function makeTechAdoptionInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "menafoods.com",
      fullName: "Aisha Karimi",
      title: "Operations Manager",
      seniority: "manager",
      department: "operations",
    },
    company: {
      domain: "menafoods.com",
      name: "MENA Foods Distribution",
      industry: "food & beverage",
      employeeCount: 80,
      country: "UAE",
    },
    signal: {
      type: "tech_adoption",
      strength: 0.75,
      provider: "theirstack",
      detectedAt: new Date("2026-06-05"),
      evidence: {
        technology: "Odoo ERP",
        action: "newly deployed",
        jobPostingEvidence: "Seeking Odoo implementation consultant",
      },
      sourceUrl: "https://theirstack.com/signals/mena-foods-odoo",
    },
    maxChars: 300,
  };
}

function makeJobChangeInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "primelogistics.ae",
      fullName: "Khalid Hassan",
      title: "VP Sales",
      seniority: "vp",
      department: "sales",
    },
    company: {
      domain: "primelogistics.ae",
      name: "Prime Logistics",
      industry: "logistics",
      employeeCount: 200,
      country: "UAE",
    },
    signal: {
      type: "job_change",
      strength: 0.8,
      provider: "predictleads",
      detectedAt: new Date("2026-06-10"),
      evidence: {
        previousTitle: "Sales Director",
        previousCompany: "Gulf Freight Co",
        newTitle: "VP Sales",
        startedAt: "2026-06-01",
      },
      sourceUrl: "https://predictleads.com/events/khalid-hassan-vp-sales",
    },
    maxChars: 300,
  };
}

function makeNewsInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "naberjewellery.ae",
      fullName: "Fatima Al-Naber",
      title: "Owner",
      seniority: "c_level",
      department: "operations",
    },
    company: {
      domain: "naberjewellery.ae",
      name: "Naber Jewellery",
      industry: "jewellery",
      employeeCount: 15,
      country: "UAE",
      region: "Abu Dhabi",
    },
    signal: {
      type: "news",
      strength: 0.7,
      provider: "exa",
      detectedAt: new Date("2026-06-08"),
      evidence: {
        headline: "Naber Jewellery opens second branch in Abu Dhabi Mall",
        url: "https://gulfnews.com/naber-jewellery-second-branch",
      },
      sourceUrl: "https://gulfnews.com/naber-jewellery-second-branch",
    },
    maxChars: 300,
  };
}

function makeMinimalContactInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "techsolutions.ae",
      fullName: "Unknown Contact",
      title: null,
    },
    company: {
      domain: "techsolutions.ae",
      name: "Tech Solutions FZE",
      industry: null,
      employeeCount: null,
      country: "UAE",
    },
    signal: {
      type: "hiring",
      strength: 0.6,
      provider: "theirstack",
      detectedAt: new Date("2026-06-12"),
      evidence: {
        jobTitle: "Business Development Manager",
        postCount: 2,
      },
      sourceUrl: null,
    },
    maxChars: 300,
  };
}

function makeLongOpenerInput(): PersonalisationInput {
  return {
    ...makeSdrHiringInput(),
    maxChars: 150,
  };
}

function makeMultipleSdrPostingsInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "scaleup.io",
      fullName: "Omar Farouk",
      title: "Chief Revenue Officer",
      seniority: "c_level",
      department: "sales",
    },
    company: {
      domain: "scaleup.io",
      name: "ScaleUp Technologies",
      industry: "SaaS",
      employeeCount: 95,
      country: "UAE",
    },
    signal: {
      type: "hiring",
      strength: 0.95,
      provider: "theirstack",
      detectedAt: new Date("2026-06-13"),
      evidence: {
        jobTitle: "SDR",
        postCount: 5,
        roles: ["SDR", "Senior SDR", "SDR Team Lead"],
        atsUrl: "https://scaleup.io/careers",
      },
      sourceUrl: "https://theirstack.com/signals/scaleup-sdr",
    },
    maxChars: 300,
  };
}

function makeGccExpansionInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "horizonretail.sa",
      fullName: "Nour Al-Ahmad",
      title: "Commercial Director",
      seniority: "director",
      department: "commercial",
    },
    company: {
      domain: "horizonretail.sa",
      name: "Horizon Retail KSA",
      industry: "retail",
      employeeCount: 300,
      country: "Saudi Arabia",
      region: "Riyadh",
    },
    signal: {
      type: "news",
      strength: 0.78,
      provider: "exa",
      detectedAt: new Date("2026-06-09"),
      evidence: {
        headline: "Horizon Retail KSA announces expansion into UAE and Kuwait markets",
        url: "https://arabnews.com/horizon-retail-gcc-expansion",
      },
      sourceUrl: "https://arabnews.com/horizon-retail-gcc-expansion",
    },
    maxChars: 300,
  };
}

function makeErpMigrationInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "alphawholesale.ae",
      fullName: "Tariq Mahmoud",
      title: "CEO",
      seniority: "c_level",
      department: "operations",
    },
    company: {
      domain: "alphawholesale.ae",
      name: "Alpha Wholesale Trading",
      industry: "wholesale",
      employeeCount: 55,
      country: "UAE",
      region: "Sharjah",
    },
    signal: {
      type: "tech_adoption",
      strength: 0.82,
      provider: "theirstack",
      detectedAt: new Date("2026-06-11"),
      evidence: {
        technology: "SAP Business One",
        action: "migrating from QuickBooks",
        sourcePost: "Hiring SAP B1 consultant for QuickBooks migration project",
      },
      sourceUrl: "https://theirstack.com/signals/alpha-wholesale-sap",
    },
    maxChars: 300,
  };
}

function makeNewSalesLeaderInput(): PersonalisationInput {
  return {
    contact: {
      companyDomain: "deltalogix.com",
      fullName: "Lina Hadad",
      title: "Head of Sales MENA",
      seniority: "director",
      department: "sales",
    },
    company: {
      domain: "deltalogix.com",
      name: "DeltaLogix",
      industry: "logistics technology",
      employeeCount: 170,
      country: "UAE",
    },
    signal: {
      type: "job_change",
      strength: 0.85,
      provider: "predictleads",
      detectedAt: new Date("2026-06-14"),
      evidence: {
        previousTitle: "Senior Sales Manager",
        previousCompany: "LogiTech Gulf",
        newTitle: "Head of Sales MENA",
        startedAt: "2026-06-01",
        linkedinAnnouncement: "Excited to join DeltaLogix as Head of Sales MENA",
      },
      sourceUrl: "https://predictleads.com/events/lina-hadad-head-sales-mena",
    },
    maxChars: 300,
  };
}

// ── Exported personalisation cases ───────────────────────────────────────────

export const personalisationCases: PersonalisationCase[] = [
  {
    id: "pc-01-sdr-hiring-keyword",
    description: "Opener must reference SDR hiring when signal evidences SDR job posts",
    input: makeSdrHiringInput(),
    assertions: [
      {
        name: "opener references SDR",
        check: ({ opener }) => /sdr/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "citedSignal is non-empty",
        check: ({ citedSignal }) => citedSignal.trim().length > 0,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-02-funding-series-a",
    description: "Opener must reference Series A funding announcement",
    input: makeFundingInput(),
    assertions: [
      {
        name: "opener references funding or Series A",
        check: ({ opener }) => /series a|funding|raised|\$5m|\$5 million/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not contain fabricated dollar amount if not in evidence",
        // The evidence explicitly states $5M so if it appears it must be correct
        check: ({ opener }) => {
          const match = opener.match(/\$[\d,]+\s*m(?:illion)?/i);
          if (!match) return true; // No amount mentioned is acceptable
          return /\$5/i.test(match[0]); // If mentioned, must be the evidenced $5M
        },
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-03-tech-adoption-odoo",
    description: "Opener must reference Odoo ERP adoption signal",
    input: makeTechAdoptionInput(),
    assertions: [
      {
        name: "opener references Odoo or ERP",
        check: ({ opener }) => /odoo|erp/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-04-job-change-new-vp",
    description: "Opener must acknowledge the contact's recent job change",
    input: makeJobChangeInput(),
    assertions: [
      {
        name: "opener references new role or VP or joining",
        check: ({ opener }) =>
          /new role|vp sales|joining|just joined|recently joined|congratulations|congrats/i.test(
            opener,
          ),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-05-news-new-branch",
    description: "Opener must reference the new branch opening news",
    input: makeNewsInput(),
    assertions: [
      {
        name: "opener references new branch or expansion or Abu Dhabi",
        check: ({ opener }) => /new branch|second branch|expansion|abu dhabi|opening/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-06-minimal-contact-still-cites-signal",
    description: "Even with sparse contact data the opener must still cite the signal",
    input: makeMinimalContactInput(),
    assertions: [
      {
        name: "opener references Business Development hiring signal",
        check: ({ opener }) => /business development|bdm|hiring/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "citedSignal is non-empty",
        check: ({ citedSignal }) => citedSignal.trim().length > 0,
      },
    ],
  },
  {
    id: "pc-07-strict-char-limit",
    description: "Opener must respect a tight 150-character limit",
    input: makeLongOpenerInput(),
    assertions: [
      {
        name: "opener is under 150 characters",
        check: ({ opener }) => opener.length <= 150,
      },
      {
        name: "opener references SDR even when short",
        check: ({ opener }) => /sdr|sales/i.test(opener),
      },
    ],
  },
  {
    id: "pc-08-multiple-sdr-postings",
    description: "Opener should reflect the volume of SDR postings (5 roles) when evidenced",
    input: makeMultipleSdrPostingsInput(),
    assertions: [
      {
        name: "opener references SDR",
        check: ({ opener }) => /sdr/i.test(opener),
      },
      {
        name: "citedSignal references the evidence",
        check: ({ citedSignal }) => citedSignal.trim().length > 0,
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-09-gcc-expansion",
    description: "Opener must reference GCC market expansion, not a generic greeting",
    input: makeGccExpansionInput(),
    assertions: [
      {
        name: "opener references expansion or UAE or Kuwait or GCC",
        check: ({ opener }) => /expan|uae|kuwait|gcc|new market/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-10-erp-migration",
    description: "Opener must reference SAP B1 migration signal",
    input: makeErpMigrationInput(),
    assertions: [
      {
        name: "opener references SAP or migration or ERP",
        check: ({ opener }) => /sap|migration|erp/i.test(opener),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
    ],
  },
  {
    id: "pc-11-new-sales-leader-first-90-days",
    description: "Opener for a job-change signal must reference the new appointment",
    input: makeNewSalesLeaderInput(),
    assertions: [
      {
        name: "opener references new role or Head of Sales or joining",
        check: ({ opener }) =>
          /head of sales|new role|joining|just joined|recently joined|congratulations|congrats/i.test(
            opener,
          ),
      },
      {
        name: "opener is under maxChars",
        check: ({ opener }) => opener.length <= 300,
      },
      {
        name: "opener does not use banned generic phrases",
        check: ({ opener }) => !containsBannedPhrase(opener),
      },
      {
        name: "citedSignal references the LinkedIn announcement or title change",
        check: ({ citedSignal }) => citedSignal.trim().length > 0,
      },
    ],
  },
];

// ── Extraction eval cases ────────────────────────────────────────────────────

export interface ExtractionAssertion {
  name: string;
  check: (output: {
    name: string | null;
    domain: string | null;
    industry: string | null;
    employeeCount: number | null;
    country: string | null;
    region: string | null;
    techStack: string[];
    fundingRound: string | null;
    fundingAmountUsd: number | null;
    provenance: Record<string, string>;
  }) => boolean;
}

export interface ExtractionCase {
  id: string;
  description: string;
  sourceText: string;
  assertions: ExtractionAssertion[];
}

export const extractionCases: ExtractionCase[] = [
  {
    id: "ec-01-full-crunchbase-blurb",
    description: "Extracts all fields from a rich company description",
    sourceText: `Acme Corp (acmecorp.com) is a B2B SaaS company headquartered in Dubai, UAE.
The company employs approximately 120 people and recently closed a $8M Series B round.
Their tech stack includes Salesforce and HubSpot.`,
    assertions: [
      {
        name: "extracts domain correctly",
        check: (o) => o.domain === "acmecorp.com",
      },
      {
        name: "extracts employee count",
        check: (o) => o.employeeCount === 120,
      },
      {
        name: "extracts country",
        check: (o) => o.country?.toLowerCase().includes("uae") ?? false,
      },
      {
        name: "extracts funding round",
        check: (o) => o.fundingRound?.toLowerCase().includes("series b") ?? false,
      },
      {
        name: "extracts tech stack items",
        check: (o) =>
          o.techStack.some((t) => /salesforce/i.test(t)) &&
          o.techStack.some((t) => /hubspot/i.test(t)),
      },
      {
        name: "provenance has entry for domain",
        check: (o) => typeof o.provenance["domain"] === "string",
      },
    ],
  },
  {
    id: "ec-02-missing-fields-emit-null",
    description: "Emits null for fields not present in the source",
    sourceText: `Zenith Trading LLC is a wholesale distributor based in Sharjah.`,
    assertions: [
      {
        name: "employeeCount is null",
        check: (o) => o.employeeCount === null,
      },
      {
        name: "fundingRound is null",
        check: (o) => o.fundingRound === null,
      },
      {
        name: "fundingAmountUsd is null",
        check: (o) => o.fundingAmountUsd === null,
      },
      {
        name: "techStack is empty",
        check: (o) => o.techStack.length === 0,
      },
      {
        name: "region contains Sharjah",
        check: (o) => o.region?.toLowerCase().includes("sharjah") ?? false,
      },
    ],
  },
  {
    id: "ec-03-range-employee-count-lower-bound",
    description: "Converts an employee range to the lower bound integer",
    sourceText: `FinEdge Solutions employs between 50 and 100 staff across its Abu Dhabi and Dubai offices.`,
    assertions: [
      {
        name: "employeeCount equals lower bound 50",
        check: (o) => o.employeeCount === 50,
      },
    ],
  },
  {
    id: "ec-04-domain-stripping",
    description: "Strips protocol and trailing slash from domain",
    sourceText: `Visit us at https://www.example.ae/ — your trusted partner in retail.`,
    assertions: [
      {
        name: "domain has no protocol or trailing slash",
        check: (o) => {
          if (!o.domain) return false;
          return !o.domain.startsWith("http") && !o.domain.endsWith("/");
        },
      },
    ],
  },
  {
    id: "ec-05-empty-source-returns-all-null",
    description: "Empty source text results in all-null facts",
    sourceText: "",
    assertions: [
      { name: "name is null", check: (o) => o.name === null },
      { name: "domain is null", check: (o) => o.domain === null },
      { name: "techStack is empty", check: (o) => o.techStack.length === 0 },
    ],
  },
  {
    id: "ec-06-provenance-for-non-null-fields",
    description: "Every non-null field must have a provenance entry",
    sourceText: `Nova Labs (novalabs.ae) is a Dubai-based AI startup with 30 employees.`,
    assertions: [
      {
        name: "provenance.domain is populated",
        check: (o) => (o.domain !== null ? typeof o.provenance["domain"] === "string" : true),
      },
      {
        name: "provenance.employeeCount is populated",
        check: (o) =>
          o.employeeCount !== null ? typeof o.provenance["employeeCount"] === "string" : true,
      },
    ],
  },
  {
    id: "ec-07-no-fabricated-funding",
    description: "Does not invent a funding amount when none is mentioned",
    sourceText: `GrowthBase is a Series A company based in Riyadh.`,
    assertions: [
      {
        name: "fundingAmountUsd is null (no amount stated)",
        check: (o) => o.fundingAmountUsd === null,
      },
      {
        name: "fundingRound contains Series A",
        check: (o) => o.fundingRound?.toLowerCase().includes("series a") ?? false,
      },
    ],
  },
  {
    id: "ec-08-multiple-tech-items",
    description: "Extracts multiple technology items from a list",
    sourceText: `The company's infrastructure runs on AWS, uses Odoo for ERP, Slack for comms, and recently adopted Snowflake for data.`,
    assertions: [
      {
        name: "techStack has at least 3 items",
        check: (o) => o.techStack.length >= 3,
      },
      {
        name: "techStack includes Odoo",
        check: (o) => o.techStack.some((t) => /odoo/i.test(t)),
      },
    ],
  },
];
