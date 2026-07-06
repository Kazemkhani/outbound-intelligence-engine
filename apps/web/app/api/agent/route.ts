import { streamText, tool, zodSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { prisma, Seniority, EmailStatus } from "@oie/db";
import {
  apolloPeopleResponse,
  apolloOrganizationResponse,
  personToContact,
  organizationToCompany,
} from "@oie/integrations";
import { normaliseDomain } from "@oie/core";

/**
 * GenRiver Agent — natural language control layer for the platform.
 *
 * Uses streamText's fullStream (async iterable of all events) to build a
 * custom SSE stream that exposes tool-start, tool-result, text-delta, and
 * done events. The client reads these directly — no ai/react dependency.
 *
 * Tools: discoverLeads, findEventCompanies, getLeadStats, searchWeb.
 * Nothing sends. DRY_RUN gate is never touched here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APOLLO_PEOPLE_URL = "https://api.apollo.io/v1/mixed_people/search";
const APOLLO_ORG_URL = "https://api.apollo.io/v1/organizations/enrich";
const EXA_SEARCH_URL = "https://api.exa.ai/search";

function apolloHeaders(key: string) {
  return { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": key };
}

const SYSTEM = `You are the GenRiver Revenue OS Agent — a smart GTM assistant embedded in GenRiver's outbound intelligence platform.

GenRiver helps B2B companies book meetings through signal-first targeting, Clay-powered enrichment, and hyper-personalised multi-channel sequences.

You have four tools:
- discoverLeads: search Apollo for decision-makers matching a role/industry/location and import them
- findEventCompanies: use Exa to find companies organising upcoming events/conferences, then import their decision-makers
- getLeadStats: query the live lead pipeline for counts and tier breakdown
- searchWeb: run an Exa neural search to research companies, markets, or trends

Rules:
- Always use tools to do real work. Never fabricate lead data or company names.
- After importing leads, tell the user they can see them at /leads scored and ranked by ICP.
- Be concise. No em dashes. Use bullets.
- If a request is ambiguous, ask one clarifying question before calling tools.
- DRY_RUN is active: you can import and score leads but cannot send any messages.`;

const messagesSchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  }),
);

// ── Shared lead import logic ──────────────────────────────────────────────────

async function importFromApollo(params: {
  titles: string[];
  industries: string[];
  locations: string[];
  perPage: number;
  keywords?: string[];
}) {
  const apiKey = (process.env.APOLLO_API_KEY ?? "").trim();
  if (!apiKey) return { error: "APOLLO_API_KEY not configured." };

  const res = await fetch(APOLLO_PEOPLE_URL, {
    method: "POST",
    headers: apolloHeaders(apiKey),
    body: JSON.stringify({
      per_page: Math.min(params.perPage, 25),
      page: 1,
      person_titles: params.titles,
      person_seniorities: ["c_suite", "vp", "director", "owner"],
      q_organization_industries: params.industries,
      person_locations: params.locations,
      organization_num_employees_ranges: ["10,5000"],
      ...(params.keywords?.length ? { q_keywords: params.keywords.join(" ") } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { error: `Apollo ${res.status}: ${detail.slice(0, 200)}` };
  }

  const raw = await res.json();
  const { people } = apolloPeopleResponse.parse(raw);
  if (!people.length) return { imported: 0, total: 0, message: "Apollo returned 0 results." };

  let imported = 0;
  let skipped = 0;

  for (const person of people) {
    try {
      const contact = personToContact(person);
      if (!contact.email && !contact.linkedinUrl) { skipped++; continue; }

      const domain = contact.companyDomain ?? normaliseDomain(person.organization?.primary_domain);
      let companyId: string | null = null;

      if (domain) {
        const existing = await prisma.company.findUnique({ where: { domain } });
        if (existing) {
          companyId = existing.id;
        } else {
          let orgData = null;
          try {
            const orgRes = await fetch(`${APOLLO_ORG_URL}?domain=${encodeURIComponent(domain)}`, {
              method: "GET", headers: apolloHeaders(apiKey),
            });
            if (orgRes.ok) {
              const parsed = apolloOrganizationResponse.safeParse(await orgRes.json());
              if (parsed.success && parsed.data.organization) {
                orgData = organizationToCompany(parsed.data.organization);
              }
            }
          } catch { /* non-fatal */ }

          const company = await prisma.company.create({
            data: {
              domain,
              name: orgData?.name ?? domain,
              website: orgData?.website ?? null,
              industry: orgData?.industry ?? null,
              employeeCount: orgData?.employeeCount ?? null,
              sources: orgData?.sources ?? { domain: "apollo" },
            },
          });
          companyId = company.id;
        }
      }

      const seniority: Seniority | null =
        contact.seniority && Object.values(Seniority).includes(contact.seniority as Seniority)
          ? (contact.seniority as Seniority) : null;
      const emailStatus: EmailStatus =
        contact.emailStatus && Object.values(EmailStatus).includes(contact.emailStatus as EmailStatus)
          ? (contact.emailStatus as EmailStatus) : EmailStatus.unknown;

      const data = {
        companyId,
        fullName: contact.fullName,
        title: contact.title,
        seniority,
        department: contact.department,
        emailStatus,
        linkedinUrl: contact.linkedinUrl,
        sources: contact.sources ?? {},
      };

      if (contact.email) {
        await prisma.contact.upsert({
          where: { email: contact.email },
          create: { email: contact.email, ...data },
          update: { title: data.title, seniority: data.seniority },
        });
      } else if (contact.linkedinUrl) {
        await prisma.contact.upsert({
          where: { linkedinUrl: contact.linkedinUrl },
          create: data,
          update: { title: data.title, seniority: data.seniority },
        });
      }
      imported++;
    } catch { skipped++; }
  }

  return { imported, skipped, total: people.length };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY not configured.", { status: 503 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  const parsed = z.object({ messages: messagesSchema }).safeParse(body);
  if (!parsed.success) return new Response("Invalid messages.", { status: 400 });

  const anthropic = createAnthropic({ apiKey });

  // Define parameter schemas separately so execute() can use z.infer for type safety.
  const discoverLeadsParams = z.object({
    titles: z.array(z.string()).describe("Job titles, e.g. ['CEO', 'Head of Sales']"),
    industries: z.array(z.string()).describe("Industries to target"),
    locations: z.array(z.string()).optional().describe("Countries/cities to target"),
    perPage: z.number().optional().describe("Number of leads (max 25)"),
  });

  const findEventParams = z.object({
    query: z.string().describe("Event type, e.g. 'tech conference', 'sales summit'"),
    timeframe: z.string().describe("When, e.g. 'next 3 months', 'Q3 2026'"),
    location: z.string().optional(),
    roles: z.array(z.string()).optional().describe("Job titles to target at these companies"),
  });

  const searchWebParams = z.object({
    query: z.string(),
    numResults: z.number().optional(),
  });

  type DiscoverLeadsInput = z.infer<typeof discoverLeadsParams>;
  type FindEventInput = z.infer<typeof findEventParams>;
  type SearchWebInput = z.infer<typeof searchWebParams>;

  const result = streamText({
    model: anthropic("claude-opus-4-8"),
    system: SYSTEM,
    messages: parsed.data.messages,
    tools: {
      discoverLeads: tool({
        description: "Search Apollo for people matching specific job titles, industries, and locations, then import them as leads into the platform.",
        inputSchema: zodSchema(discoverLeadsParams),
        execute: async (args: DiscoverLeadsInput) =>
          importFromApollo({
            titles: args.titles,
            industries: args.industries,
            locations: args.locations ?? ["United Kingdom", "United States", "United Arab Emirates"],
            perPage: args.perPage ?? 15,
          }),
      }),

      findEventCompanies: tool({
        description: "Find companies organising upcoming events/conferences in a given timeframe, then import their decision-makers as leads.",
        inputSchema: zodSchema(findEventParams),
        execute: async (args: FindEventInput) => {
          const exaKey = (process.env.EXA_API_KEY ?? "").trim();
          if (!exaKey) return { error: "EXA_API_KEY not configured." };

          const exaRes = await fetch(EXA_SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": exaKey },
            body: JSON.stringify({
              query: `upcoming ${args.query} ${args.timeframe} ${args.location ?? ""} organiser company host 2026`,
              type: "neural",
              numResults: 8,
              contents: { text: { maxCharacters: 600 } },
            }),
          });

          if (!exaRes.ok) return { error: `Exa ${exaRes.status}` };
          const exaData = (await exaRes.json()) as { results: Array<{ title?: string; url?: string }> };
          const pages = exaData.results ?? [];

          const importResult = await importFromApollo({
            titles: args.roles ?? ["Founder", "CEO", "Events Director", "Managing Director"],
            industries: ["events services", "entertainment", "hospitality", "marketing and advertising"],
            locations: args.location ? [args.location] : ["United Kingdom", "United States", "United Arab Emirates"],
            perPage: 20,
            keywords: [args.query, "conference", "events"],
          });

          return {
            companiesFound: pages.length,
            sources: pages.slice(0, 5).map((p) => ({ title: p.title, url: p.url })),
            ...("imported" in importResult ? importResult : {}),
          };
        },
      }),

      getLeadStats: tool({
        description: "Get current lead pipeline stats: total count, tier breakdown, and recent leads.",
        inputSchema: zodSchema(z.object({})),
        execute: async () => {
          try {
            const [total, tierCounts, recent] = await Promise.all([
              prisma.contact.count(),
              prisma.score.groupBy({ by: ["tier"], _count: { id: true } }).catch(() => []),
              prisma.contact.findMany({
                take: 3,
                orderBy: { createdAt: "desc" },
                select: { fullName: true, title: true, company: { select: { name: true } } },
              }).catch(() => []),
            ]);
            const byTier: Record<string, number> = {};
            for (const t of tierCounts) byTier[t.tier] = t._count.id;
            return {
              total,
              byTier,
              recentLeads: recent.map((c) => ({ name: c.fullName, title: c.title, company: c.company?.name })),
            };
          } catch {
            return { total: 0, byTier: {}, recentLeads: [], note: "Database unavailable." };
          }
        },
      }),

      searchWeb: tool({
        description: "Run a neural Exa web search to research companies, markets, trends, or find specific information online.",
        inputSchema: zodSchema(searchWebParams),
        execute: async (args: SearchWebInput) => {
          const exaKey = (process.env.EXA_API_KEY ?? "").trim();
          if (!exaKey) return { error: "EXA_API_KEY not configured." };

          const res = await fetch(EXA_SEARCH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": exaKey },
            body: JSON.stringify({
              query: args.query,
              type: "neural",
              numResults: Math.min(args.numResults ?? 5, 10),
              contents: { text: { maxCharacters: 500 } },
            }),
          });

          if (!res.ok) return { error: `Exa ${res.status}` };
          const data = (await res.json()) as { results: Array<{ title?: string; url?: string; text?: string }> };
          return {
            results: (data.results ?? []).map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.text?.slice(0, 300),
            })),
          };
        },
      }),
    },
  });

  // Build a custom SSE stream from fullStream so the client can see tool calls
  // and text deltas without needing ai/react or toDataStreamResponse.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            // AI SDK v6: field is `text`, not `textDelta`
            emit({ type: "text", text: (part as unknown as { text: string }).text });
          } else if (part.type === "tool-call") {
            // AI SDK v6: field is `input`, not `args`
            const tc = part as unknown as { toolCallId: string; toolName: string; input: unknown };
            emit({ type: "tool_start", toolCallId: tc.toolCallId, toolName: tc.toolName, args: tc.input });
          } else if (part.type === "tool-result") {
            // AI SDK v6: field is `output`, not `result`
            const tr = part as unknown as { toolCallId: string; toolName: string; output: unknown };
            emit({ type: "tool_result", toolCallId: tr.toolCallId, toolName: tr.toolName, result: tr.output });
          }
        }
        emit({ type: "done" });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
