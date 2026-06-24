/**
 * LIVE phone-first discovery → real leads in the control plane (DRY_RUN).
 *
 * Runs the real pipeline against LIVE providers and persists to Neon:
 *   SearchApi.discoverCompanies → Apollo.enrichCompany (free: company-level) →
 *   TheirStack signals → deterministic score (@oie/core; the LLM NEVER scores) →
 *   Claude opener (tier A/B w/ a real signal) → awaiting_approval Message + the
 *   business phone on the Contact. Nothing sends — messages land in the queue.
 *
 * Apollo person-search needs a paid plan, so each lead carries an explicitly
 * SYNTHETIC "primary line" contact (no fabricated person): a generic label, a
 * non-deliverable @unknown.invalid email, and the company switchboard phone.
 * Paid Apollo later layers a real named contact on top.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/discover-live.ts "real estate developers in Dubai" [limit]
 */
import {
  SearchApiAdapter,
  PlacesAdapter,
  ApolloAdapter,
  TheirStackAdapter,
  LlmClient,
  personaliseOpener,
  personaliseColdOpener,
  type AdapterContext,
  type CostRecord,
  type EnrichmentProvider,
  type NormalisedCompany,
  type NormalisedContact,
} from "../packages/integrations/src/index";
import { collectSignals, toScoringSubject } from "../packages/orchestration/src/index";
import { icpProfile, scoreLead, SCORING_MODEL_VERSION, type IcpProfile } from "../packages/core/src/index";
import { prisma, Prisma } from "../packages/db/src/index";

/* eslint-disable no-console -- operator discovery script */
const NOW = new Date();
const query = process.argv[2] ?? "real estate developers in Dubai";
const limit = Number(process.argv[3] ?? 12);

function buildDiscoveryProvider(): EnrichmentProvider {
  const sk = process.env.SEARCHAPI_API_KEY?.trim();
  if (sk) return new SearchApiAdapter({ apiKey: sk });
  const gm = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (gm) return new PlacesAdapter({ apiKey: gm });
  throw new Error("No discovery provider configured (set SEARCHAPI_API_KEY or GOOGLE_MAPS_API_KEY).");
}

function syntheticContact(company: NormalisedCompany): NormalisedContact {
  const phone = (company.socials as Record<string, unknown> | null)?.phone as string | undefined;
  const slug = (company.domain ?? company.name).replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return {
    companyDomain: company.domain ?? undefined,
    // Honest: NOT a real person. A company "primary line" decision-maker placeholder.
    fullName: `Decision-maker (unconfirmed) — ${company.name}`,
    title: "Primary line",
    seniority: null,
    department: null,
    // RFC-2606 .invalid TLD — unroutable by construction, can never be sent to.
    email: `synthetic+${slug}@unknown.invalid`,
    emailStatus: "invalid",
    phone: phone ?? null,
    whatsapp: phone ?? null,
    sources: { fullName: "synthetic", email: "synthetic", phone: "searchapi", whatsapp: "searchapi" },
  } as NormalisedContact;
}

/** Derive an accurate locale from the company's address/region/name, falling back to the search query, then the UAE. */
function localeFor(company: NormalisedCompany): string {
  const blob = `${company.region ?? ""} ${company.country ?? ""} ${company.name ?? ""} ${query}`.toLowerCase();
  const cities: [string, string][] = [
    ["abu dhabi", "Abu Dhabi, UAE"],
    ["sharjah", "Sharjah, UAE"],
    ["ajman", "Ajman, UAE"],
    ["ras al khaimah", "Ras Al Khaimah, UAE"],
    ["fujairah", "Fujairah, UAE"],
    ["dubai", "Dubai, UAE"],
  ];
  for (const [needle, label] of cities) if (blob.includes(needle)) return label;
  return "the UAE";
}

async function main() {
  if ((process.env.DRY_RUN ?? "true").toLowerCase() !== "true") {
    throw new Error("Refusing to run: DRY_RUN must be true. Discovery never runs with the send-gate down.");
  }
  const costs: CostRecord[] = [];
  const ctx: AdapterContext = { dryRun: true, recordCost: (c) => costs.push(c) };

  const profileRow = await prisma.icpProfile.findFirst({ where: { active: true } });
  if (!profileRow) throw new Error("No active ICP — run pnpm db:seed first.");
  const icp: IcpProfile = icpProfile.parse(profileRow.config);

  const discovery = buildDiscoveryProvider();
  console.log(`\n=== LIVE discovery: "${query}" via ${discovery.name} (limit ${limit}) ===`);
  const discovered = (await discovery.discoverCompanies({ text: query }, ctx))
    .filter((c) => c.domain) // need a domain for dedup/enrich
    .slice(0, limit);
  console.log(`Discovered ${discovered.length} companies with domains.`);

  const apollo = new ApolloAdapter({ apiKey: process.env.APOLLO_API_KEY ?? "" });
  const theirstack = new TheirStackAdapter({ apiKey: process.env.THEIRSTACK_API_KEY ?? "" });
  const llm = new LlmClient({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

  const sequence = await prisma.sequence.upsert({
    where: { id: "discover-live-uae" },
    create: {
      id: "discover-live-uae",
      name: "UAE developers — phone-first (WhatsApp + call)",
      status: "active",
      steps: [{ channel: "whatsapp", delayHours: 0, templateId: "opener" }] as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  let approvals = 0;
  for (const disc of discovered) {
    const company = { ...disc };
    // Company enrich (free Apollo organizations/enrich); fills gaps, never overwrites discovery (keeps phone).
    try {
      const a = await apollo.enrichCompany({ domain: company.domain ?? undefined, name: company.name }, ctx);
      if (a.matched && a.data) {
        company.industry = company.industry ?? a.data.industry ?? null;
        company.employeeCount = company.employeeCount ?? a.data.employeeCount ?? null;
        company.revenueBand = company.revenueBand ?? a.data.revenueBand ?? null;
      }
    } catch (e) {
      console.log(`  (apollo enrich skipped for ${company.name}: ${(e as Error).message.slice(0, 60)})`);
    }

    const { signals } = await collectSignals(
      [theirstack],
      { companyDomain: company.domain ?? undefined },
      ctx,
    );

    const contact = syntheticContact(company);

    const dbCompany = await prisma.company.upsert({
      where: { domain: company.domain! },
      create: {
        domain: company.domain,
        name: company.name,
        website: company.website ?? null,
        industry: company.industry ?? null,
        employeeCount: company.employeeCount ?? null,
        region: company.region ?? null,
        country: company.country ?? null,
        lat: company.lat ?? null,
        lng: company.lng ?? null,
        placeId: company.placeId ?? null,
        localCategory: company.localCategory ?? null,
        sources: (company.sources ?? {}) as Prisma.InputJsonValue,
      },
      update: { industry: company.industry ?? null, employeeCount: company.employeeCount ?? null },
    });
    const dbContact = await prisma.contact.upsert({
      where: { email: contact.email! },
      create: {
        companyId: dbCompany.id,
        fullName: contact.fullName,
        title: contact.title ?? null,
        seniority: contact.seniority ?? null,
        department: contact.department ?? null,
        email: contact.email,
        phone: contact.phone ?? null,
        whatsapp: contact.whatsapp ?? null,
      },
      update: { phone: contact.phone ?? null, whatsapp: contact.whatsapp ?? null },
    });

    await prisma.signal.deleteMany({
      where: { companyId: dbCompany.id, provider: { in: ["theirstack", "predictleads", "exa"] } },
    });
    for (const s of signals) {
      await prisma.signal.create({
        data: {
          companyId: dbCompany.id,
          type: s.type,
          strength: s.strength,
          provider: s.provider,
          sourceUrl: s.sourceUrl,
          evidence: (s.evidence ?? {}) as Prisma.InputJsonObject,
          detectedAt: s.detectedAt,
          expiresAt: s.expiresAt ?? null,
        },
      });
    }

    const score = scoreLead(toScoringSubject(company, contact, signals), icp, NOW);
    await prisma.score.upsert({
      where: { contactId_icpProfileId: { contactId: dbContact.id, icpProfileId: profileRow.id } },
      create: {
        contactId: dbContact.id,
        icpProfileId: profileRow.id,
        fit: score.fit,
        intent: score.intent,
        composite: score.composite,
        tier: score.tier,
        rationale: score.rationale as unknown as Prisma.InputJsonObject,
        modelVersion: SCORING_MODEL_VERSION,
      },
      update: {
        fit: score.fit,
        intent: score.intent,
        composite: score.composite,
        tier: score.tier,
        rationale: score.rationale as unknown as Prisma.InputJsonObject,
      },
    });

    let openerNote = "";
    const topSignal = signals[0];
    // Generate an opener for every workable tier (A/B/C). Tier D = discard.
    // With a real buying signal we cite it; otherwise an honest cold opener
    // grounded in vertical + locale + size (never a fabricated signal).
    if (score.tier !== "D") {
      const opener = topSignal
        ? (await personaliseOpener(llm, { contact, company, signal: topSignal })).opener
        : (
            await personaliseColdOpener(llm, {
              contact,
              company,
              locale: localeFor(company),
              channel: "whatsapp",
              product: {
                name: "Huscribe",
                oneLiner:
                  "A Voice-AI receptionist that instantly answers and qualifies inbound property enquiries 24/7 in Arabic and English, books viewings, and hands agents only ready buyers — so no enquiry goes cold.",
                proofPoints: [
                  "Captures and qualifies after-hours and weekend enquiries that would otherwise be missed",
                  "Replies in seconds — speed-to-lead wins the buyer in a competitive market",
                  "Frees agents from repetitive qualifying calls to focus on closing",
                ],
              },
            })
          ).opener;
      const enrolment = await prisma.enrolment.upsert({
        where: { contactId_sequenceId: { contactId: dbContact.id, sequenceId: sequence.id } },
        create: { contactId: dbContact.id, sequenceId: sequence.id, status: "active", currentStep: 0 },
        update: {},
      });
      await prisma.message.upsert({
        where: { channel_externalId: { channel: "whatsapp", externalId: `live-${dbContact.id}` } },
        create: {
          enrolmentId: enrolment.id,
          channel: "whatsapp",
          direction: "outbound",
          status: "awaiting_approval",
          body: opener,
          templateId: "opener",
          externalId: `live-${dbContact.id}`,
        },
        update: { status: "awaiting_approval", body: opener },
      });
      approvals++;
      openerNote = `  ☎ ${contact.phone ?? "no phone"}  ·  "${opener.slice(0, 70)}…"`;
    }
    console.log(`  ${score.tier}  composite=${score.composite.toFixed(0)}  ${company.name}${openerNote ? "\n" + openerNote : ""}`);
  }

  // Persist provider spend for the run.
  for (const c of costs) {
    await prisma.providerCost.create({
      data: { provider: c.provider, task: c.task, units: c.units, costUsd: c.costUsd, at: c.at },
    }).catch(() => {});
  }
  await prisma.auditLog.create({
    data: {
      actor: "system:discover-live",
      action: "pipeline.discover_live",
      entity: "Company",
      payload: { query, discovered: discovered.length, approvals },
    },
  });

  const counts = {
    companies: await prisma.company.count(),
    awaitingApproval: await prisma.message.count({ where: { status: "awaiting_approval" } }),
  };
  console.log(`\n=== Done. ${counts.companies} companies in DB · ${counts.awaitingApproval} messages awaiting approval. ===`);
  console.log("Nothing sent — everything is gated. Review at http://localhost:3000/approvals");
}

main()
  .catch((e) => {
    console.error("discover-live failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
/* eslint-enable no-console */
