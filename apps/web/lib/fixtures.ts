/**
 * Fixture data for the OIE control plane.
 *
 * This module is the DATA SEAM — the place where prisma queries will slot in
 * once the DB is wired to the web layer. For now it returns a realistic UAE-SMB
 * seed set so that `next build` is green without a live database.
 *
 * Do NOT import prisma here. Pages that consume this remain static.
 */

import type { IcpProfile, ScoringSubject } from "@oie/core";
import { scoreLead } from "@oie/core";

// ── Seed ICP (mirrors packages/db/src/seed-data.ts — kept in-module so the
//    web layer never imports @oie/db at build time, which would pull in prisma)
export const SEED_ICP: IcpProfile = {
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

// ── Raw fixture leads (8 realistic UAE-SMB companies + contacts + signals) ────

export type CrmStatus = "new" | "contacted" | "replied" | "meeting_booked" | "won" | "lost";

export interface FixtureLead {
  id: string;
  crmStatus: CrmStatus;
  notes: string | null;
  company: {
    id: string;
    name: string;
    domain: string;
    industry: string;
    employeeCount: number;
    country: string;
    region: string;
    lat: number;
    lng: number;
    localCategory: string;
    techStack: string[];
    website: string;
  };
  contact: {
    id: string;
    fullName: string;
    title: string;
    seniority: "c_level" | "vp" | "director" | "manager" | "ic";
    department: string;
    email: string;
    emailStatus: "verified" | "risky" | "invalid" | "unknown";
    linkedinUrl: string;
  };
  signals: Array<{
    id: string;
    type: "hiring" | "funding" | "tech_adoption" | "job_change" | "news" | "web_change";
    strength: number;
    provider: string;
    sourceUrl: string;
    evidence: Record<string, unknown>;
    detectedAt: Date;
    expiresAt: Date;
  }>;
}

const NOW = new Date("2026-06-14T00:00:00Z");

export const FIXTURE_LEADS: FixtureLead[] = [
  {
    id: "lead-001",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-001",
      name: "Al Faris Jewellery LLC",
      domain: "alfaris.example",
      industry: "jewellery",
      employeeCount: 55,
      country: "AE",
      region: "Dubai",
      lat: 25.2048,
      lng: 55.2708,
      localCategory: "jewellery_store",
      techStack: ["Odoo", "Tally"],
      website: "https://alfaris.example",
    },
    contact: {
      id: "ct-001",
      fullName: "Khalid Al Faris",
      title: "Managing Director",
      seniority: "c_level",
      department: "operations",
      email: "khalid@alfaris.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/khalid-al-faris",
    },
    signals: [
      {
        id: "sig-001",
        type: "hiring",
        strength: 0.9,
        provider: "TheirStack",
        sourceUrl: "https://example.com/signals/job-12345",
        evidence: {
          role: "Sales Executive",
          location: "Dubai",
          posted: "2026-06-10",
        },
        detectedAt: new Date("2026-06-10T00:00:00Z"),
        expiresAt: new Date("2026-07-10T00:00:00Z"),
      },
      {
        id: "sig-002",
        type: "tech_adoption",
        strength: 0.75,
        provider: "TheirStack",
        sourceUrl: "https://example.com/signals/tech-odoo",
        evidence: { product: "Odoo 17", change: "upgrade" },
        detectedAt: new Date("2026-06-01T00:00:00Z"),
        expiresAt: new Date("2026-08-01T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-002",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-002",
      name: "Spice Garden Restaurant Group",
      domain: "spicegarden.example",
      industry: "food & beverage",
      employeeCount: 120,
      country: "AE",
      region: "Dubai",
      lat: 25.185,
      lng: 55.27,
      localCategory: "restaurant",
      techStack: ["Zoho", "QuickBooks"],
      website: "https://spicegarden.example",
    },
    contact: {
      id: "ct-002",
      fullName: "Priya Nambiar",
      title: "Head of Sales",
      seniority: "director",
      department: "sales",
      email: "priya@spicegarden.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/priya-nambiar",
    },
    signals: [
      {
        id: "sig-003",
        type: "news",
        strength: 0.8,
        provider: "PredictLeads",
        sourceUrl: "https://example.com/signals/event-56789",
        evidence: {
          headline: "Spice Garden opens third branch in Business Bay",
          date: "2026-06-05",
        },
        detectedAt: new Date("2026-06-05T00:00:00Z"),
        expiresAt: new Date("2026-07-05T00:00:00Z"),
      },
      {
        id: "sig-004",
        type: "hiring",
        strength: 0.7,
        provider: "TheirStack",
        sourceUrl: "https://example.com/signals/job-23456",
        evidence: { role: "Business Development Manager", location: "Dubai" },
        detectedAt: new Date("2026-06-08T00:00:00Z"),
        expiresAt: new Date("2026-07-08T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-003",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-003",
      name: "Gulf Wholesale Distribution Co.",
      domain: "gulfwholesale.example",
      industry: "wholesale/distribution",
      employeeCount: 85,
      country: "AE",
      region: "Sharjah",
      lat: 25.3573,
      lng: 55.3896,
      localCategory: "wholesaler",
      techStack: ["SAP Business One"],
      website: "https://gulfwholesale.example",
    },
    contact: {
      id: "ct-003",
      fullName: "Mohammed Al Rashidi",
      title: "Sales Manager",
      seniority: "manager",
      department: "sales",
      email: "m.rashidi@gulfwholesale.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/mohammed-rashidi",
    },
    signals: [
      {
        id: "sig-005",
        type: "funding",
        strength: 0.85,
        provider: "PredictLeads",
        sourceUrl: "https://example.com/signals/event-34567",
        evidence: { amount: "AED 5M", round: "Series A", date: "2026-05-20" },
        detectedAt: new Date("2026-05-20T00:00:00Z"),
        expiresAt: new Date("2026-08-20T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-004",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-004",
      name: "Premium Retail Holdings",
      domain: "premiumretail.example",
      industry: "retail",
      employeeCount: 45,
      country: "AE",
      region: "Abu Dhabi",
      lat: 24.4539,
      lng: 54.3773,
      localCategory: "retailer",
      techStack: ["Microsoft Dynamics"],
      website: "https://premiumretail.example",
    },
    contact: {
      id: "ct-004",
      fullName: "Fatima Al Mansoori",
      title: "Owner",
      seniority: "c_level",
      department: "commercial",
      email: "fatima@premiumretail.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/fatima-mansoori",
    },
    signals: [
      {
        id: "sig-006",
        type: "job_change",
        strength: 0.65,
        provider: "PredictLeads",
        sourceUrl: "https://example.com/signals/event-45678",
        evidence: {
          person: "New Commercial Director hired",
          role: "Commercial Manager",
        },
        detectedAt: new Date("2026-06-12T00:00:00Z"),
        expiresAt: new Date("2026-09-12T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-005",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-005",
      name: "Al Baraka Professional Services",
      domain: "albaraka.example",
      industry: "professional services",
      employeeCount: 30,
      country: "AE",
      region: "Dubai",
      lat: 25.23,
      lng: 55.29,
      localCategory: "retailer",
      techStack: ["Zoho"],
      website: "https://albaraka.example",
    },
    contact: {
      id: "ct-005",
      fullName: "Omar Hassan",
      title: "Founder",
      seniority: "c_level",
      department: "operations",
      email: "omar@albaraka.example",
      emailStatus: "risky",
      linkedinUrl: "https://example.com/people/omar-hassan-ae",
    },
    signals: [
      {
        id: "sig-007",
        type: "hiring",
        strength: 0.6,
        provider: "TheirStack",
        sourceUrl: "https://example.com/signals/job-56789",
        evidence: { role: "SDR", location: "Dubai" },
        detectedAt: new Date("2026-06-09T00:00:00Z"),
        expiresAt: new Date("2026-07-09T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-006",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-006",
      name: "Noor Electronics Trading",
      domain: "noorelectronics.example",
      industry: "retail",
      employeeCount: 18,
      country: "AE",
      region: "Dubai",
      lat: 25.265,
      lng: 55.32,
      localCategory: "retailer",
      techStack: ["Tally"],
      website: "https://noorelectronics.example",
    },
    contact: {
      id: "ct-006",
      fullName: "Sanjay Mehta",
      title: "Operations Manager",
      seniority: "manager",
      department: "operations",
      email: "sanjay@noorelectronics.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/sanjay-mehta-uae",
    },
    signals: [
      {
        id: "sig-008",
        type: "tech_adoption",
        strength: 0.55,
        provider: "TheirStack",
        sourceUrl: "https://example.com/signals/tech-tally",
        evidence: { product: "Tally Prime", change: "new_install" },
        detectedAt: new Date("2026-06-03T00:00:00Z"),
        expiresAt: new Date("2026-08-03T00:00:00Z"),
      },
    ],
  },
  {
    id: "lead-007",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-007",
      name: "Horizon Food Concepts",
      domain: "horizonfood.example",
      industry: "food & beverage",
      employeeCount: 200,
      country: "AE",
      region: "Dubai",
      lat: 25.19,
      lng: 55.26,
      localCategory: "restaurant",
      techStack: [],
      website: "https://horizonfood.example",
    },
    contact: {
      id: "ct-007",
      fullName: "Layla Al Shamsi",
      title: "Commercial Manager",
      seniority: "manager",
      department: "commercial",
      email: "layla@horizonfood.example",
      emailStatus: "unknown",
      linkedinUrl: "https://example.com/people/layla-shamsi",
    },
    signals: [],
  },
  {
    id: "lead-008",
    crmStatus: "new",
    notes: null,
    company: {
      id: "co-008",
      name: "Alpha Consultancy FZ",
      domain: "alphaconsultancy.example",
      industry: "professional services",
      employeeCount: 12,
      country: "AE",
      region: "Dubai",
      lat: 25.11,
      lng: 55.18,
      localCategory: "retailer",
      techStack: ["QuickBooks"],
      website: "https://alphaconsultancy.example",
    },
    contact: {
      id: "ct-008",
      fullName: "James Thornton",
      title: "Managing Director",
      seniority: "c_level",
      department: "sales",
      email: "james@alphaconsultancy.example",
      emailStatus: "verified",
      linkedinUrl: "https://example.com/people/james-thornton-ae",
    },
    signals: [
      {
        id: "sig-009",
        type: "news",
        strength: 0.5,
        provider: "Exa",
        sourceUrl: "https://example.com/signals/result-78901",
        evidence: { headline: "Alpha Consultancy awarded new government contract" },
        detectedAt: new Date("2026-06-11T00:00:00Z"),
        expiresAt: new Date("2026-07-11T00:00:00Z"),
      },
    ],
  },
];

// ── Scored and ranked fixture leads ──────────────────────────────────────────

export interface ScoredLead extends FixtureLead {
  score: ReturnType<typeof scoreLead>;
}

/**
 * Score all fixture leads against the given ICP and return them ranked by
 * composite score descending. Pure — `now` is explicit, no clock reads.
 */
export function scoreAndRankLeads(icp: IcpProfile, now: Date): ScoredLead[] {
  const scored: ScoredLead[] = FIXTURE_LEADS.map((lead) => {
    const subject: ScoringSubject = {
      company: {
        industry: lead.company.industry,
        employeeCount: lead.company.employeeCount,
        country: lead.company.country,
        region: lead.company.region,
        lat: lead.company.lat,
        lng: lead.company.lng,
        localCategory: lead.company.localCategory,
        techStack: lead.company.techStack,
      },
      contact: {
        title: lead.contact.title,
        seniority: lead.contact.seniority,
        department: lead.contact.department,
      },
      signals: lead.signals.map((s) => ({
        type: s.type,
        strength: s.strength,
        detectedAt: s.detectedAt,
        expiresAt: s.expiresAt,
        evidence: s.evidence,
      })),
    };

    return { ...lead, score: scoreLead(subject, icp, now) };
  });

  return scored.sort((a, b) => b.score.composite - a.score.composite);
}

export const SCORED_LEADS: ScoredLead[] = scoreAndRankLeads(SEED_ICP, NOW);

// ── Fixture approval queue items (messages awaiting_approval) ─────────────

export type ApprovalStatus = "awaiting_approval" | "approved" | "rejected";
export type MessageChannel = "email" | "linkedin" | "whatsapp";

export interface ApprovalItem {
  id: string;
  leadId: string;
  contactName: string;
  companyName: string;
  channel: MessageChannel;
  subject: string;
  body: string;
  sequenceName: string;
  step: number;
  queuedAt: Date;
  status: ApprovalStatus;
}

export const FIXTURE_APPROVALS: ApprovalItem[] = [
  {
    id: "msg-001",
    leadId: "lead-001",
    contactName: "Khalid Al Faris",
    companyName: "Al Faris Jewellery LLC",
    channel: "email",
    subject: "Supporting your SDR team growth at Al Faris Jewellery",
    body: `Hi Khalid,\n\nI noticed Al Faris Jewellery is currently hiring a Sales Executive — a clear signal you're investing in outbound growth. We help jewellery retailers in Dubai build sales pipelines that are fully integrated with Odoo, so your SDR team spends time selling, not updating spreadsheets.\n\nWould a 20-minute call this week make sense?\n\nBest,\nExample Labs`,
    sequenceName: "UAE SMB ERP — Sequence 1",
    step: 1,
    queuedAt: new Date("2026-06-14T09:00:00Z"),
    status: "awaiting_approval",
  },
  {
    id: "msg-002",
    leadId: "lead-002",
    contactName: "Priya Nambiar",
    companyName: "Spice Garden Restaurant Group",
    channel: "email",
    subject: "Congratulations on the Business Bay opening, Priya",
    body: `Hi Priya,\n\nCongratulations on Spice Garden's third location in Business Bay — impressive growth. Expanding to multiple sites is exactly when restaurant groups typically find that Zoho starts to creak.\n\nWe help food & beverage teams in Dubai consolidate their operations on a single system and hire smarter. Worth a quick conversation?\n\nBest,\nExample Labs`,
    sequenceName: "UAE SMB ERP — Sequence 1",
    step: 1,
    queuedAt: new Date("2026-06-14T09:15:00Z"),
    status: "awaiting_approval",
  },
  {
    id: "msg-003",
    leadId: "lead-003",
    contactName: "Mohammed Al Rashidi",
    companyName: "Gulf Wholesale Distribution Co.",
    channel: "email",
    subject: "Post-funding scale-up at Gulf Wholesale",
    body: `Hi Mohammed,\n\nWell done on the Series A raise — AED 5M is a strong vote of confidence in the team. Distribution companies that raise at this stage usually need to scale their sales operation quickly without losing control of margins.\n\nWe work with Sharjah wholesale businesses on exactly this. Could we connect for 15 minutes?\n\nBest,\nExample Labs`,
    sequenceName: "UAE SMB ERP — Sequence 1",
    step: 1,
    queuedAt: new Date("2026-06-14T09:30:00Z"),
    status: "awaiting_approval",
  },
  {
    id: "msg-004",
    leadId: "lead-004",
    contactName: "Fatima Al Mansoori",
    companyName: "Premium Retail Holdings",
    channel: "whatsapp",
    subject: "New commercial leadership at Premium Retail",
    body: `Hi Fatima, I saw Premium Retail recently brought on a new Commercial Manager. New commercial leadership usually means a fresh look at the sales stack. We help Abu Dhabi retailers align their Microsoft Dynamics setup with how their new team actually sells. Happy to share what we've seen work — would a brief call suit you?`,
    sequenceName: "UAE SMB ERP — Sequence 1",
    step: 1,
    queuedAt: new Date("2026-06-14T09:45:00Z"),
    status: "awaiting_approval",
  },
  {
    id: "msg-005",
    leadId: "lead-005",
    contactName: "Omar Hassan",
    companyName: "Al Baraka Professional Services",
    channel: "email",
    subject: "SDR hiring at Al Baraka — a thought",
    body: `Hi Omar,\n\nI see Al Baraka is hiring an SDR — great move for a professional services firm of your size. The biggest challenge we see at this stage is ensuring Zoho is set up to give new SDRs a clean pipeline view from day one.\n\nHappy to share a quick checklist. Worth connecting?\n\nBest,\nExample Labs`,
    sequenceName: "UAE SMB ERP — Sequence 1",
    step: 1,
    queuedAt: new Date("2026-06-14T10:00:00Z"),
    status: "awaiting_approval",
  },
];

// ── Fixture signals feed (most recent first) ──────────────────────────────

export interface SignalFeedItem {
  id: string;
  companyName: string;
  contactName: string;
  type: FixtureLead["signals"][number]["type"];
  strength: number;
  provider: string;
  sourceUrl: string;
  evidence: Record<string, unknown>;
  detectedAt: Date;
  expiresAt: Date;
}

export const FIXTURE_SIGNAL_FEED: SignalFeedItem[] = FIXTURE_LEADS.flatMap((lead) =>
  lead.signals.map((sig) => ({
    id: sig.id,
    companyName: lead.company.name,
    contactName: lead.contact.fullName,
    type: sig.type,
    strength: sig.strength,
    provider: sig.provider,
    sourceUrl: sig.sourceUrl,
    evidence: sig.evidence,
    detectedAt: sig.detectedAt,
    expiresAt: sig.expiresAt,
  })),
).sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());

// ── Analytics fixture numbers ──────────────────────────────────────────────

export interface AnalyticsTiles {
  totalLeads: number;
  byTier: Record<"A" | "B" | "C" | "D", number>;
  signalsThisWeek: number;
  pendingApprovals: number;
  estimatedCostUsd: number;
}

export function getAnalyticsTiles(): AnalyticsTiles {
  const byTier = { A: 0, B: 0, C: 0, D: 0 };
  for (const lead of SCORED_LEADS) {
    byTier[lead.score.tier]++;
  }
  const signalsThisWeek = FIXTURE_SIGNAL_FEED.filter((s) => {
    const cutoff = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    return s.detectedAt >= cutoff;
  }).length;
  const pendingApprovals = FIXTURE_APPROVALS.filter((a) => a.status === "awaiting_approval").length;
  return {
    totalLeads: SCORED_LEADS.length,
    byTier,
    signalsThisWeek,
    pendingApprovals,
    estimatedCostUsd: 4.32,
  };
}
