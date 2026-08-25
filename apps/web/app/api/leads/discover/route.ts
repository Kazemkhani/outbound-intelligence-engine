import { z } from "zod";
import { prisma, Seniority, EmailStatus } from "@oie/db";
import { normaliseDomain } from "@oie/core";
import {
  apolloPeopleResponse,
  apolloOrganizationResponse,
  personToContact,
  organizationToCompany,
} from "@oie/integrations";

/**
 * Lead discovery endpoint. Searches Apollo for people matching the active ICP,
 * enriches their companies, and upserts everything to the DB. The leads page
 * reads from DB so they appear immediately after the call completes.
 *
 * POST /api/leads/discover
 * Body (all optional): { page?, perPage?, titles?, industries?, locations? }
 * Returns: { imported, skipped, errors }
 *
 * Cost: ~$0.04 per person returned. Keep perPage ≤ 25 for an exploratory run.
 * DRY_RUN does NOT gate discovery — fetching data is not sending.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APOLLO_PEOPLE_URL = "https://api.apollo.io/v1/mixed_people/api_search";
const APOLLO_BULK_MATCH_URL = "https://api.apollo.io/v1/people/bulk_match";
const APOLLO_ORG_URL = "https://api.apollo.io/v1/organizations/enrich";

const DEFAULT_TITLES = [
  "Head of Sales",
  "VP of Sales",
  "VP Sales",
  "Director of Sales",
  "Director of Business Development",
  "Chief Revenue Officer",
  "CRO",
  "Founder",
  "Co-Founder",
  "CEO",
  "Chief Executive Officer",
  "Managing Director",
  "Sales Director",
];

const DEFAULT_INDUSTRIES = [
  "computer software",
  "information technology and services",
  "staffing and recruiting",
  "professional services",
  "financial services",
  "internet",
  "management consulting",
];

const DEFAULT_LOCATIONS = [
  "United Kingdom",
  "United States",
  "United Arab Emirates",
  "Saudi Arabia",
];

const bodySchema = z.object({
  page: z.number().int().min(1).max(10).optional().default(1),
  perPage: z.number().int().min(1).max(25).optional().default(15),
  titles: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
});

function apolloHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": apiKey,
  };
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = (process.env.APOLLO_API_KEY ?? "").trim();
  if (!apiKey) {
    return Response.json(
      { error: "APOLLO_API_KEY is not set. Add it to .env and restart." },
      { status: 503 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await req.json().catch(() => ({}));
    body = bodySchema.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // 1. Search Apollo for people IDs matching the ICP (no credits consumed).
  let searchIds: string[] = [];
  try {
    const res = await fetch(APOLLO_PEOPLE_URL, {
      method: "POST",
      headers: apolloHeaders(apiKey),
      body: JSON.stringify({
        per_page: body.perPage,
        page: body.page,
        person_titles: body.titles ?? DEFAULT_TITLES,
        person_seniorities: ["c_suite", "vp", "director", "owner"],
        q_organization_industries: body.industries ?? DEFAULT_INDUSTRIES,
        person_locations: body.locations ?? DEFAULT_LOCATIONS,
        organization_num_employees_ranges: ["10,5000"],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: `Apollo search failed (${res.status}): ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as { people?: Array<{ id?: string }> };
    searchIds = (raw.people ?? []).map((p) => p.id).filter((id): id is string => Boolean(id));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Apollo request failed: ${detail}` }, { status: 502 });
  }

  if (searchIds.length === 0) {
    return Response.json({
      imported: 0,
      skipped: 0,
      errors: 0,
      message: "Apollo returned 0 results. Try broader filters.",
    });
  }

  // 2. Bulk-reveal IDs in batches of 10 (Apollo limit) to get full contact details.
  const BATCH_SIZE = 10;
  const allMatches: unknown[] = [];
  for (let i = 0; i < searchIds.length; i += BATCH_SIZE) {
    const batch = searchIds.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(APOLLO_BULK_MATCH_URL, {
        method: "POST",
        headers: apolloHeaders(apiKey),
        body: JSON.stringify({
          details: batch.map((id) => ({ id })),
          reveal_personal_emails: true,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return Response.json(
          { error: `Apollo bulk reveal failed (${res.status}): ${detail.slice(0, 200)}` },
          { status: 502 },
        );
      }
      const raw = (await res.json()) as { matches?: unknown[] };
      allMatches.push(...(raw.matches ?? []));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Apollo bulk reveal failed: ${detail}` }, { status: 502 });
    }
  }
  const peopleRaw = { people: allMatches };

  const { people } = apolloPeopleResponse.parse(peopleRaw);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const importedContactIds: string[] = [];

  // 2. For each person: ensure their company exists, then upsert the contact.
  for (const person of people) {
    try {
      const contact = personToContact(person);
      const domain = contact.companyDomain ?? normaliseDomain(person.organization?.primary_domain);

      // Skip if we have no way to identify this contact.
      if (!contact.email && !contact.linkedinUrl) {
        skipped++;
        continue;
      }

      // 2a. Ensure company row exists (upsert on domain if we have one, else by name).
      const orgName = person.organization?.name ?? null;
      let companyId: string | null = null;
      if (domain) {
        // Try to find existing row first.
        const existing = await prisma.company.findUnique({ where: { domain } });
        if (existing) {
          companyId = existing.id;
        } else {
          // Enrich via Apollo org endpoint, fall back to stub if it fails.
          let orgData = null;
          try {
            const orgRes = await fetch(`${APOLLO_ORG_URL}?domain=${encodeURIComponent(domain)}`, {
              method: "GET",
              headers: apolloHeaders(apiKey),
            });
            if (orgRes.ok) {
              const orgRaw = await orgRes.json();
              const parsed = apolloOrganizationResponse.safeParse(orgRaw);
              if (parsed.success && parsed.data.organization) {
                orgData = organizationToCompany(parsed.data.organization);
              }
            }
          } catch {
            // Non-fatal: create a stub company from person data.
          }

          const company = await prisma.company.create({
            data: {
              domain,
              name: orgData?.name ?? orgName ?? domain,
              website: orgData?.website ?? null,
              industry: orgData?.industry ?? null,
              employeeCount: orgData?.employeeCount ?? null,
              country: null,
              region: null,
              sources: orgData?.sources ?? { domain: "apollo" },
            },
          });
          companyId = company.id;
        }
      } else if (orgName) {
        // No domain but we have a name — find or create a domain-less company stub.
        const existing = await prisma.company.findFirst({ where: { name: orgName, domain: null } });
        if (existing) {
          companyId = existing.id;
        } else {
          const company = await prisma.company.create({
            data: { domain: null, name: orgName, sources: { name: "apollo" } },
          });
          companyId = company.id;
        }
      }

      // 2b. Upsert contact (unique on email, then linkedinUrl).
      // Map our core Seniority type to the Prisma enum (they share values).
      const seniority: Seniority | null =
        contact.seniority && Object.values(Seniority).includes(contact.seniority as Seniority)
          ? (contact.seniority as Seniority)
          : null;

      const emailStatus: EmailStatus =
        contact.emailStatus &&
        Object.values(EmailStatus).includes(contact.emailStatus as EmailStatus)
          ? (contact.emailStatus as EmailStatus)
          : EmailStatus.unknown;

      const contactData = {
        companyId,
        fullName: contact.fullName,
        title: contact.title,
        seniority,
        department: contact.department,
        emailStatus,
        linkedinUrl: contact.linkedinUrl,
        sources: contact.sources ?? {},
      };

      let row: { id: string } | undefined;
      if (contact.email) {
        row = await prisma.contact.upsert({
          where: { email: contact.email },
          create: { email: contact.email, ...contactData },
          update: { title: contactData.title, seniority: contactData.seniority },
          select: { id: true },
        });
      } else if (contact.linkedinUrl) {
        row = await prisma.contact.upsert({
          where: { linkedinUrl: contact.linkedinUrl },
          create: { ...contactData },
          update: { title: contactData.title, seniority: contactData.seniority },
          select: { id: true },
        });
      }
      if (row) importedContactIds.push(row.id);
      imported++;
    } catch (err) {
      // Log but don't abort — partial import is better than none.
      console.error(
        "[discover] Failed to upsert contact:",
        err instanceof Error ? err.message : err,
      );
      errors++;
    }
  }

  // Create a named segment so these leads appear grouped in the Leads tab.
  let segmentId: string | undefined;
  if (importedContactIds.length > 0) {
    try {
      const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const seg = await prisma.segment.create({
        data: { name: `Discover · Page ${body.page} · ${dateStr}` },
        select: { id: true },
      });
      await prisma.contactSegment.createMany({
        data: importedContactIds.map((contactId) => ({ contactId, segmentId: seg.id })),
        skipDuplicates: true,
      });
      segmentId = seg.id;
    } catch {
      /* non-fatal */
    }
  }

  return Response.json({ imported, skipped, errors, total: people.length, segmentId });
}
