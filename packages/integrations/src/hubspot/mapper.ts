import { z } from "zod";
import type { NormalisedCompany, NormalisedContact } from "../contracts/model";

/**
 * HubSpot CRM v3 response schemas — validated at the boundary so vendor
 * payloads never leak past this mapper (adapter-contract skill §Mapping rule).
 * Only the properties we map are declared; unknown keys are stripped by Zod.
 *
 * API reference (verified June 2025):
 *   https://developers.hubspot.com/docs/api/crm/companies
 *   https://developers.hubspot.com/docs/api/crm/contacts
 */

// ── Zod schemas ────────────────────────────────────────────────────────────────

/** A single HubSpot object as returned by search, create, and PATCH endpoints. */
export const hubspotCompanyObject = z.object({
  id: z.string(),
  properties: z.object({
    name: z.string().optional().nullable(),
    domain: z.string().optional().nullable(),
    industry: z.string().optional().nullable(),
    /** HubSpot stores employee count as a string on the wire. */
    numberofemployees: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
  }),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const hubspotContactObject = z.object({
  id: z.string(),
  properties: z.object({
    firstname: z.string().optional().nullable(),
    lastname: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    jobtitle: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    hs_linkedin_url: z.string().optional().nullable(),
  }),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** POST /crm/v3/objects/{type}/search response. */
export const hubspotSearchResponse = <T extends z.ZodTypeAny>(objectSchema: T) =>
  z.object({
    total: z.number(),
    results: z.array(objectSchema),
  });

export const hubspotCompanySearchResponse = hubspotSearchResponse(hubspotCompanyObject);
export const hubspotContactSearchResponse = hubspotSearchResponse(hubspotContactObject);

export type HubSpotCompanyObject = z.infer<typeof hubspotCompanyObject>;
export type HubSpotContactObject = z.infer<typeof hubspotContactObject>;
export type HubSpotCompanySearchResponse = z.infer<typeof hubspotCompanySearchResponse>;
export type HubSpotContactSearchResponse = z.infer<typeof hubspotContactSearchResponse>;

// ── Field mapping tables ───────────────────────────────────────────────────────

/**
 * Unified → HubSpot company property mapping
 *
 * | Unified field    | HubSpot property      | Notes                            |
 * |------------------|-----------------------|----------------------------------|
 * | name             | name                  | Direct                           |
 * | domain           | domain                | Direct                           |
 * | industry         | industry              | Direct (HubSpot uses its own     |
 * |                  |                       | enumeration; we pass through)    |
 * | employeeCount    | numberofemployees     | Number → string on write;        |
 * |                  |                       | string → number on read          |
 * | country          | country               | Direct                           |
 * | website          | website               | Direct                           |
 */

/**
 * Unified → HubSpot contact property mapping
 *
 * | Unified field    | HubSpot property      | Notes                            |
 * |------------------|-----------------------|----------------------------------|
 * | fullName         | firstname + lastname  | Split on first space; remainder  |
 * |                  |                       | to lastname; no last name → ""   |
 * | email            | email                 | Direct                           |
 * | title            | jobtitle              | Direct                           |
 * | phone            | phone                 | Direct                           |
 * | linkedinUrl      | hs_linkedin_url       | HubSpot internal property        |
 */

// ── Company mapping ────────────────────────────────────────────────────────────

/** Translate a NormalisedCompany into the HubSpot properties payload for create/patch. */
export function toHubspotCompanyProperties(
  company: NormalisedCompany,
): Record<string, string | undefined> {
  const props: Record<string, string | undefined> = {};
  if (company.name) props["name"] = company.name;
  if (company.domain) props["domain"] = company.domain;
  if (company.industry != null) props["industry"] = company.industry;
  if (company.employeeCount != null) props["numberofemployees"] = String(company.employeeCount);
  if (company.country != null) props["country"] = company.country;
  if (company.website != null) props["website"] = company.website;
  return props;
}

/** Translate a validated HubSpot company object into the unified NormalisedCompany shape. */
export function fromHubspotCompanyObject(obj: HubSpotCompanyObject): NormalisedCompany {
  const p = obj.properties;
  const employeeRaw = p.numberofemployees;
  const employeeCount =
    employeeRaw != null && employeeRaw !== "" ? parseInt(employeeRaw, 10) : null;

  const company: NormalisedCompany = {
    domain: p.domain ?? null,
    name: p.name ?? "unknown",
    industry: p.industry ?? null,
    employeeCount: Number.isNaN(employeeCount) ? null : employeeCount,
    country: p.country ?? null,
    website: p.website ?? null,
  };

  const sources: Record<string, string> = {};
  for (const key of Object.keys(company) as (keyof NormalisedCompany)[]) {
    const val = company[key];
    if (val !== null && val !== undefined) sources[key] = "hubspot";
  }
  company.sources = sources;
  return company;
}

// ── Contact mapping ────────────────────────────────────────────────────────────

/** Split a full name into { firstname, lastname }. */
function splitFullName(fullName: string): { firstname: string; lastname: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstname: trimmed, lastname: "" };
  return {
    firstname: trimmed.slice(0, spaceIndex),
    lastname: trimmed.slice(spaceIndex + 1),
  };
}

/** Reassemble firstname + lastname into fullName. */
function joinName(
  firstname: string | null | undefined,
  lastname: string | null | undefined,
): string {
  const parts = [firstname, lastname].filter((p): p is string => Boolean(p));
  return parts.join(" ") || "unknown";
}

/** Translate a NormalisedContact into the HubSpot properties payload for create/patch. */
export function toHubspotContactProperties(
  contact: NormalisedContact,
): Record<string, string | undefined> {
  const { firstname, lastname } = splitFullName(contact.fullName);
  const props: Record<string, string | undefined> = {
    firstname,
    lastname,
  };
  if (contact.email != null) props["email"] = contact.email;
  if (contact.title != null) props["jobtitle"] = contact.title;
  if (contact.phone != null) props["phone"] = contact.phone;
  if (contact.linkedinUrl != null) props["hs_linkedin_url"] = contact.linkedinUrl;
  return props;
}

/** Translate a validated HubSpot contact object into the unified NormalisedContact shape. */
export function fromHubspotContactObject(obj: HubSpotContactObject): NormalisedContact {
  const p = obj.properties;

  const contact: NormalisedContact = {
    companyDomain: null, // HubSpot contact search does not return company domain inline
    fullName: joinName(p.firstname, p.lastname),
    email: p.email ?? null,
    title: p.jobtitle ?? null,
    phone: p.phone ?? null,
    linkedinUrl: p.hs_linkedin_url ?? null,
  };

  const sources: Record<string, string> = {};
  for (const key of Object.keys(contact) as (keyof NormalisedContact)[]) {
    const val = contact[key];
    if (val !== null && val !== undefined) sources[key] = "hubspot";
  }
  contact.sources = sources;
  return contact;
}
