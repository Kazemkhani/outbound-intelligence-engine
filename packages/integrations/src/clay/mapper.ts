import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { Seniority } from "@oie/core";
import type { NormalisedCompany, NormalisedContact } from "../contracts/model";

/**
 * Clay enrichment is push-based: we POST a query row to a Clay table's webhook,
 * Clay runs its waterfall ASYNCHRONOUSLY, and the enriched row returns LATER via
 * an inbound webhook to us (brief §2.2 + addendum — Clay's MCP is read-only and
 * cannot trigger the waterfall). This mapper validates that inbound row at the
 * boundary with Zod and translates it INTO the unified model. Clay column names
 * are operator-configured, so we accept the common header variants we expect from
 * our own table template and emit `unknown`/null rather than guessing.
 */

/** Pick the first present, non-empty string from a set of candidate columns. */
function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Coerce a Clay numeric column (which may arrive as a string) to a number. */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Inbound Clay row schema. Clay sends a flat object keyed by the table's column
 * headers; we tolerate the common casings/aliases for each logical field and
 * passthrough() so unknown columns never fail validation (they are simply not
 * mapped). Type is `unknown` per key so we coerce deliberately in the mapper.
 */
export const clayWebhookRow = z
  .object({
    "Company Domain": z.unknown().optional(),
    company_domain: z.unknown().optional(),
    domain: z.unknown().optional(),
    "Company Name": z.unknown().optional(),
    company_name: z.unknown().optional(),
    company: z.unknown().optional(),
    Industry: z.unknown().optional(),
    industry: z.unknown().optional(),
    "Employee Count": z.unknown().optional(),
    employee_count: z.unknown().optional(),
    employees: z.unknown().optional(),
    "Person Name": z.unknown().optional(),
    person_name: z.unknown().optional(),
    full_name: z.unknown().optional(),
    "Job Title": z.unknown().optional(),
    job_title: z.unknown().optional(),
    title: z.unknown().optional(),
    Email: z.unknown().optional(),
    email: z.unknown().optional(),
    LinkedIn: z.unknown().optional(),
    linkedin: z.unknown().optional(),
    linkedin_url: z.unknown().optional(),
  })
  .passthrough();

export type ClayWebhookRow = z.infer<typeof clayWebhookRow>;

/** Best-effort seniority inference from a job title — emit null when unsure. */
function seniorityFromTitle(title: string | null): Seniority | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (/\b(ceo|cfo|coo|cto|cmo|chief|founder|owner|president)\b/.test(t)) return "c_level";
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return "vp";
  if (/\bdirector\b/.test(t)) return "director";
  if (/\b(manager|head of|lead)\b/.test(t)) return "manager";
  return "ic";
}

/** Attribute every populated field on an entity to Clay in its `sources` map. */
function attributeSources(entity: NormalisedCompany | NormalisedContact): void {
  const record = entity as unknown as Record<string, unknown>;
  const sources: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value !== null && value !== undefined && key !== "sources") sources[key] = "clay";
  }
  entity.sources = sources;
}

/** Map a validated Clay row to a NormalisedCompany, or null if no company data. */
export function rowToCompany(row: ClayWebhookRow): NormalisedCompany | null {
  const r = row as Record<string, unknown>;
  const website = firstString(r["Company Domain"], r["company_domain"], r["domain"]);
  const name = firstString(r["Company Name"], r["company_name"], r["company"]);
  const domain = normaliseDomain(website);
  if (domain === null && name === null) return null;

  const company: NormalisedCompany = {
    domain,
    name: name ?? "unknown",
    website,
    industry: firstString(r["Industry"], r["industry"]),
    employeeCount: asNumber(r["Employee Count"] ?? r["employee_count"] ?? r["employees"]),
  };
  attributeSources(company);
  return company;
}

/** Map a validated Clay row to a NormalisedContact, or null if no person data. */
export function rowToContact(row: ClayWebhookRow): NormalisedContact | null {
  const r = row as Record<string, unknown>;
  const fullName = firstString(r["Person Name"], r["person_name"], r["full_name"]);
  const email = firstString(r["Email"], r["email"]);
  const linkedinUrl = firstString(r["LinkedIn"], r["linkedin"], r["linkedin_url"]);
  if (fullName === null && email === null && linkedinUrl === null) return null;

  const website = firstString(r["Company Domain"], r["company_domain"], r["domain"]);
  const title = firstString(r["Job Title"], r["job_title"], r["title"]);
  const contact: NormalisedContact = {
    companyDomain: normaliseDomain(website),
    fullName: fullName ?? "unknown",
    title,
    seniority: seniorityFromTitle(title),
    email,
    linkedinUrl,
  };
  attributeSources(contact);
  return contact;
}

/**
 * Validate and map a single inbound Clay table row into the unified model.
 * This is the real value of the adapter: it is how enrichment results actually
 * come back from the asynchronous waterfall. Throws (via Zod) on a malformed
 * payload so the inbound-webhook handler can reject it rather than persist junk.
 */
export function parseClayWebhook(payload: unknown): {
  company?: NormalisedCompany;
  contact?: NormalisedContact;
} {
  const row = clayWebhookRow.parse(payload);
  const company = rowToCompany(row);
  const contact = rowToContact(row);
  const result: { company?: NormalisedCompany; contact?: NormalisedContact } = {};
  if (company) result.company = company;
  if (contact) result.contact = contact;
  return result;
}
