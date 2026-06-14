import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { EmailStatus, Seniority } from "@oie/core";
import type { NormalisedCompany, NormalisedContact } from "../contracts/model";

/**
 * Explorium REST response schemas — validated at the boundary (brief §2.4).
 * Explorium is a single-credit-pool aggregator with synchronous match→enrich
 * responses. Vendor payloads never leave this mapper; only NormalisedCompany /
 * NormalisedContact escape.
 */

// ── Business match → enrich ──────────────────────────────────────────────────

export const businessMatchResponse = z.object({
  matched_businesses: z
    .array(
      z.object({
        business_id: z.string(),
        domain: z.string().optional(),
        name: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type BusinessMatchResponse = z.infer<typeof businessMatchResponse>;

export const businessEnrichResponse = z.object({
  data: z.object({
    business_id: z.string().optional(),
    name: z.string().optional(),
    domain: z.string().optional(),
    industry: z.string().optional(),
    // Explorium returns a banded range; we accept an exact count too and
    // prefer the count when present.
    number_of_employees_range: z.string().optional(),
    employee_count: z.number().optional(),
    country: z.string().optional(),
    region: z.string().optional(),
    technologies: z.array(z.string()).optional().default([]),
  }),
});

export type BusinessEnrichResponse = z.infer<typeof businessEnrichResponse>;
export type BusinessFirmographics = BusinessEnrichResponse["data"];

/** Extract the first matched business id, or null when nothing matched. */
export function firstBusinessId(raw: BusinessMatchResponse): string | null {
  return raw.matched_businesses[0]?.business_id ?? null;
}

/** Lower bound of a headcount range string like "51-200" → 51 (null if unparseable). */
function lowerBoundOfRange(range: string | undefined): number | null {
  if (!range) return null;
  const match = range.match(/\d+/);
  return match ? Number(match[0]) : null;
}

/** Translate Explorium firmographics into the unified NormalisedCompany shape. */
export function businessToCompany(firmo: BusinessFirmographics): NormalisedCompany {
  const company: NormalisedCompany = {
    domain: normaliseDomain(firmo.domain ?? null),
    name: firmo.name ?? "unknown",
    website: firmo.domain ?? null,
    industry: firmo.industry ?? null,
    // Prefer an exact count; otherwise derive an approximate floor from the band.
    // The headcount band is NOT a revenue band — never mislabel it as revenue.
    employeeCount: firmo.employee_count ?? lowerBoundOfRange(firmo.number_of_employees_range),
    country: firmo.country ?? null,
    region: firmo.region ?? null,
    techStack: firmo.technologies.length > 0 ? firmo.technologies : undefined,
  };
  // Record field provenance — every field Explorium supplied is attributed to it.
  const sources: Record<string, string> = {};
  for (const key of Object.keys(company) as (keyof NormalisedCompany)[]) {
    const value = company[key];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    sources[key] = "explorium";
  }
  company.sources = sources;
  return company;
}

// ── Prospect match → enrich ──────────────────────────────────────────────────

export const prospectMatchResponse = z.object({
  matched_prospects: z
    .array(
      z.object({
        prospect_id: z.string(),
        full_name: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

export type ProspectMatchResponse = z.infer<typeof prospectMatchResponse>;

export const prospectEnrichResponse = z.object({
  data: z.object({
    prospect_id: z.string().optional(),
    full_name: z.string().optional(),
    job_title: z.string().optional(),
    seniority: z.string().optional(),
    department: z.string().optional(),
    email: z.string().optional(),
    email_status: z.string().optional(),
    linkedin: z.string().optional(),
  }),
});

export type ProspectEnrichResponse = z.infer<typeof prospectEnrichResponse>;
export type ProspectData = ProspectEnrichResponse["data"];

/** Extract the first matched prospect id, or null when nothing matched. */
export function firstProspectId(raw: ProspectMatchResponse): string | null {
  return raw.matched_prospects[0]?.prospect_id ?? null;
}

/** Map Explorium's seniority vocabulary onto our enum; emit unknown as a guard. */
export function mapSeniority(raw: string | undefined): Seniority | null {
  if (!raw) return null;
  switch (raw.trim().toLowerCase()) {
    case "c_level":
    case "c-level":
    case "cxo":
    case "owner":
    case "founder":
    case "partner":
      return "c_level";
    case "vp":
    case "vice president":
    case "vice_president":
      return "vp";
    case "director":
    case "head":
      return "director";
    case "manager":
      return "manager";
    case "ic":
    case "individual contributor":
    case "senior":
    case "entry":
      return "ic";
    default:
      return null;
  }
}

/** Map Explorium's email verification vocabulary onto our EmailStatus enum. */
export function mapEmailStatus(raw: string | undefined): EmailStatus {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "valid":
    case "verified":
    case "deliverable":
      return "verified";
    case "risky":
    case "accept_all":
    case "catch_all":
    case "unknown_deliverability":
      return "risky";
    case "invalid":
    case "undeliverable":
    case "bounced":
      return "invalid";
    default:
      return "unknown";
  }
}

/** Translate an Explorium prospect into the unified NormalisedContact shape. */
export function prospectToContact(
  prospect: ProspectData,
  companyDomain: string | null,
): NormalisedContact {
  const contact: NormalisedContact = {
    companyDomain,
    fullName: prospect.full_name ?? "unknown",
    title: prospect.job_title ?? null,
    seniority: mapSeniority(prospect.seniority),
    department: prospect.department ?? null,
    email: prospect.email ?? null,
    emailStatus: mapEmailStatus(prospect.email_status),
    linkedinUrl: prospect.linkedin ?? null,
  };
  const sources: Record<string, string> = {};
  for (const key of Object.keys(contact) as (keyof NormalisedContact)[]) {
    const value = contact[key];
    if (value === null || value === undefined) continue;
    sources[key] = "explorium";
  }
  contact.sources = sources;
  return contact;
}
