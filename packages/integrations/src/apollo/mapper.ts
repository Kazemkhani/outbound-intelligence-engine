import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { EmailStatus, Seniority } from "@oie/core";
import type { NormalisedCompany, NormalisedContact } from "../contracts/model";

/**
 * Apollo.io response schemas — validated at the boundary so vendor payloads
 * never leak past this mapper (adapter-contract skill). Only the fields we map
 * are described; everything else on the wire is ignored by Zod.
 */

/** GET /v1/organizations/enrich → { organization: { ... } }. */
export const apolloOrganizationResponse = z.object({
  organization: z
    .object({
      name: z.string().optional(),
      website_url: z.string().optional(),
      primary_domain: z.string().optional(),
      industry: z.string().optional(),
      estimated_num_employees: z.number().optional(),
      linkedin_url: z.string().optional(),
    })
    .nullish(),
});

/** POST /v1/mixed_people/search → { people: [ ... ] }. */
export const apolloPeopleResponse = z.object({
  people: z
    .array(
      z.object({
        name: z.string().nullish(),
        title: z.string().nullish(),
        seniority: z.string().nullish(),
        email: z.string().nullish(),
        email_status: z.string().nullish(),
        linkedin_url: z.string().nullish(),
        departments: z.array(z.string()).nullish(),
        organization: z.object({ name: z.string().nullish(), primary_domain: z.string().nullish() }).nullish(),
      }),
    )
    .optional()
    .default([]),
});

export type ApolloOrganizationResponse = z.infer<typeof apolloOrganizationResponse>;
export type ApolloPeopleResponse = z.infer<typeof apolloPeopleResponse>;
export type ApolloOrganization = NonNullable<ApolloOrganizationResponse["organization"]>;
export type ApolloPerson = ApolloPeopleResponse["people"][number];

/**
 * Map Apollo's free-text seniority onto our closed Seniority enum. Apollo emits
 * values such as "owner"/"founder"/"partner"/"head"/"entry" beyond ours, so we
 * fold them into the nearest unified band; unrecognised values yield null.
 */
export function mapSeniority(raw: string | undefined): Seniority | null {
  switch ((raw ?? "").toLowerCase()) {
    case "c_suite":
    case "c-suite":
    case "owner":
    case "founder":
    case "partner":
      return "c_level";
    case "vp":
      return "vp";
    case "head":
    case "director":
      return "director";
    case "manager":
      return "manager";
    case "senior":
    case "entry":
    case "intern":
    case "individual_contributor":
      return "ic";
    default:
      return null;
  }
}

/**
 * Map Apollo's email_status onto our EmailStatus enum. Apollo uses
 * "verified"/"unverified"/"guessed"/"unavailable"; anything unrecognised (or
 * absent) becomes "unknown" — we never guess deliverability.
 */
export function mapEmailStatus(raw: string | undefined): EmailStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "verified":
      return "verified";
    case "guessed":
    case "unverified":
      return "risky";
    case "unavailable":
    case "bounced":
      return "invalid";
    default:
      return "unknown";
  }
}

/** Translate an Apollo organisation into the unified NormalisedCompany shape. */
export function organizationToCompany(org: ApolloOrganization): NormalisedCompany {
  const website = org.website_url ?? null;
  const company: NormalisedCompany = {
    domain: normaliseDomain(org.primary_domain ?? website),
    name: org.name ?? "unknown",
    website,
    industry: org.industry ?? null,
    employeeCount: org.estimated_num_employees ?? null,
  };
  // Record field provenance — every field Apollo supplied is attributed to it.
  const sources: Record<string, string> = {};
  for (const key of Object.keys(company) as (keyof NormalisedCompany)[]) {
    if (company[key] !== null && company[key] !== undefined) sources[key] = "apollo";
  }
  company.sources = sources;
  return company;
}

/** Translate an Apollo person into the unified NormalisedContact shape. */
export function personToContact(person: ApolloPerson): NormalisedContact {
  const contact: NormalisedContact = {
    companyDomain: normaliseDomain(person.organization?.primary_domain),
    fullName: person.name ?? "unknown",
    title: person.title ?? null,
    seniority: mapSeniority(person.seniority ?? undefined),
    department: person.departments?.[0] ?? null,
    email: person.email ?? null,
    emailStatus: mapEmailStatus(person.email_status ?? undefined),
    linkedinUrl: person.linkedin_url ?? null,
  };
  // Record field provenance — every field Apollo supplied is attributed to it.
  const sources: Record<string, string> = {};
  for (const key of Object.keys(contact) as (keyof NormalisedContact)[]) {
    if (contact[key] !== null && contact[key] !== undefined) sources[key] = "apollo";
  }
  contact.sources = sources;
  return contact;
}
