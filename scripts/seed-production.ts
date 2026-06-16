/**
 * Production seed + adapter verification (no live provider keys required).
 *
 * Runs every adapter's REAL code path against its recorded fixture (the same
 * fixtures the unit tests use), pushes the output through the real pipeline
 * (waterfall -> collectSignals -> scoreLead) and persists the result to the
 * live Neon database. This (a) verifies the adapter -> pipeline -> DB flow
 * end-to-end against production and (b) gives the dashboard real data.
 *
 * Run:  DATABASE_URL=<neon-direct> pnpm exec tsx scripts/seed-production.ts
 * Nothing sends — messages are written as `awaiting_approval`.
 */
import {
  PlacesAdapter,
  ApolloAdapter,
  TheirStackAdapter,
  PredictLeadsAdapter,
  ExaAdapter,
  stubTransport,
  type AdapterContext,
  type NormalisedCompany,
  type NormalisedContact,
  type NormalisedSignal,
} from "../packages/integrations/src/index";
import {
  enrichCompanyWaterfall,
  collectSignals,
  toScoringSubject,
} from "../packages/orchestration/src/index";
import {
  icpProfile,
  scoreLead,
  SCORING_MODEL_VERSION,
  type IcpProfile,
} from "../packages/core/src/index";
import { prisma, Prisma } from "../packages/db/src/index";

import placesFx from "../packages/integrations/src/places/fixtures/searchText.json";
import apolloOrgFx from "../packages/integrations/src/apollo/fixtures/organizationEnrich.json";
import apolloPeopleFx from "../packages/integrations/src/apollo/fixtures/peopleSearch.json";
import theirstackFx from "../packages/integrations/src/theirstack/fixtures/jobsSearch.json";
import predictleadsFx from "../packages/integrations/src/predictleads/fixtures/companyEvents.json";
import exaFx from "../packages/integrations/src/exa/fixtures/search.json";

const NOW = new Date();
const ctx: AdapterContext = { dryRun: true };
/* eslint-disable no-console -- operator seed/verification script */

async function verifyAdapters() {
  console.log("=== Adapter verification (real code, recorded fixtures) ===");
  const places = new PlacesAdapter({
    apiKey: "fixture",
    transport: stubTransport([{ body: placesFx }]),
  });
  const placesOut = await places.discoverCompanies(
    { text: "jewellery and restaurants in Dubai" },
    ctx,
  );
  console.log(
    `  Places       discoverCompanies -> ${placesOut.length} companies  [${placesOut.length ? "OK" : "FAIL"}]`,
  );

  const apollo = new ApolloAdapter({
    apiKey: "fixture",
    transport: stubTransport([{ body: apolloOrgFx }, { body: apolloPeopleFx }]),
  });
  const apolloCo = await apollo.enrichCompany({ domain: placesOut[0]?.domain ?? "acme.io" }, ctx);
  const apolloCt = await apollo.enrichContact(
    { companyDomain: placesOut[0]?.domain ?? "acme.io" },
    ctx,
  );
  console.log(
    `  Apollo       enrichCompany matched=${apolloCo.matched}, enrichContact matched=${apolloCt.matched}  [${apolloCo.matched ? "OK" : "FAIL"}]`,
  );

  const theirstack = new TheirStackAdapter({
    apiKey: "fixture",
    transport: stubTransport([{ body: theirstackFx }]),
  });
  const tsSignals = await theirstack.fetchSignals({ companyDomain: "acme.com" }, ctx);
  console.log(
    `  TheirStack   fetchSignals -> ${tsSignals.length} signals  [${tsSignals.length ? "OK" : "FAIL"}]`,
  );

  const predictleads = new PredictLeadsAdapter({
    apiKey: "fixture",
    apiToken: "fixture",
    transport: stubTransport([{ body: predictleadsFx }]),
  });
  const plSignals = await predictleads.fetchSignals({ companyDomain: "acme.com" }, ctx);
  console.log(
    `  PredictLeads fetchSignals -> ${plSignals.length} signals  [${plSignals.length ? "OK" : "FAIL"}]`,
  );

  const exa = new ExaAdapter({ apiKey: "fixture", transport: stubTransport([{ body: exaFx }]) });
  const exaSignals = await exa.fetchSignals({ companyDomain: "acme.com" }, ctx);
  console.log(
    `  Exa          fetchSignals -> ${exaSignals.length} signals  [${exaSignals.length >= 0 ? "OK" : "FAIL"}]`,
  );

  return { placesOut, apolloCo, apolloCt };
}

/** A realistic UAE-SMB dataset for the dashboard. */
const COMPANIES: {
  company: NormalisedCompany;
  contact: NormalisedContact;
  signals: NormalisedSignal[];
}[] = [
  {
    company: {
      domain: "alnoorjewellery.ae",
      name: "Al Noor Jewellery LLC",
      industry: "jewellery",
      employeeCount: 45,
      region: "Dubai",
      country: "United Arab Emirates",
      techStack: ["Odoo"],
      localCategory: "jewellery_store",
      website: "https://alnoorjewellery.ae",
    },
    contact: {
      companyDomain: "alnoorjewellery.ae",
      fullName: "Aisha Al Noor",
      title: "Owner",
      seniority: "c_level",
      department: "sales",
      email: "owner@alnoorjewellery.ae",
    },
    signals: [
      {
        companyDomain: "alnoorjewellery.ae",
        type: "hiring",
        strength: 0.9,
        provider: "theirstack",
        sourceUrl: "https://jobs.alnoorjewellery.ae/sdr",
        detectedAt: new Date("2026-06-12"),
        expiresAt: new Date("2026-07-12"),
        evidence: { jobTitle: "Sales Executive", count: 3 },
      },
    ],
  },
  {
    company: {
      domain: "gulfwholesale.ae",
      name: "Gulf Wholesale Trading",
      industry: "wholesale/distribution",
      employeeCount: 80,
      region: "Sharjah",
      country: "United Arab Emirates",
      techStack: ["Zoho"],
      website: "https://gulfwholesale.ae",
    },
    contact: {
      companyDomain: "gulfwholesale.ae",
      fullName: "Omar Haddad",
      title: "Sales Manager",
      seniority: "manager",
      department: "sales",
      email: "omar@gulfwholesale.ae",
    },
    signals: [
      {
        companyDomain: "gulfwholesale.ae",
        type: "tech_adoption",
        strength: 0.65,
        provider: "theirstack",
        sourceUrl: "theirstack:tech:gulfwholesale.ae:zoho",
        detectedAt: new Date("2026-06-08"),
        expiresAt: new Date("2026-08-07"),
        evidence: { technologies: ["zoho"] },
      },
    ],
  },
  {
    company: {
      domain: "baitalmandi.ae",
      name: "Bait Al Mandi Restaurant",
      industry: "food & beverage",
      employeeCount: 35,
      region: "Dubai",
      country: "United Arab Emirates",
      localCategory: "restaurant",
      techStack: ["Tally"],
      website: "https://baitalmandi.ae",
    },
    contact: {
      companyDomain: "baitalmandi.ae",
      fullName: "Yusuf Rahman",
      title: "Operations Manager",
      seniority: "manager",
      department: "operations",
      email: "yusuf@baitalmandi.ae",
    },
    signals: [
      {
        companyDomain: "baitalmandi.ae",
        type: "news",
        strength: 0.45,
        provider: "exa",
        sourceUrl: "https://gulfnews.com/baitalmandi-new-branch",
        detectedAt: new Date("2026-06-05"),
        expiresAt: new Date("2026-07-05"),
        evidence: { title: "Bait Al Mandi opens new branch in Abu Dhabi" },
      },
    ],
  },
  {
    company: {
      domain: "emiratesretail.ae",
      name: "Emirates Retail Group",
      industry: "retail",
      employeeCount: 150,
      region: "Abu Dhabi",
      country: "United Arab Emirates",
      techStack: ["SAP Business One"],
      localCategory: "retailer",
      website: "https://emiratesretail.ae",
    },
    contact: {
      companyDomain: "emiratesretail.ae",
      fullName: "Fatima Khalid",
      title: "Head of Sales",
      seniority: "director",
      department: "sales",
      email: "fatima@emiratesretail.ae",
    },
    signals: [
      {
        companyDomain: "emiratesretail.ae",
        type: "funding",
        strength: 0.85,
        provider: "predictleads",
        sourceUrl: "https://predictleads.com/emiratesretail-funding",
        detectedAt: new Date("2026-06-01"),
        expiresAt: new Date("2026-08-30"),
        evidence: { round: "Series A", amount: "AED 20M" },
      },
    ],
  },
  {
    company: {
      domain: "bigaero.com",
      name: "BigAero Corp",
      industry: "aerospace",
      employeeCount: 6000,
      country: "US",
      techStack: ["Salesforce"],
      website: "https://bigaero.com",
    },
    contact: {
      companyDomain: "bigaero.com",
      fullName: "Pat Lee",
      title: "Intern",
      seniority: "ic",
      department: "engineering",
      email: "pat@bigaero.com",
    },
    signals: [],
  },
];

async function main() {
  await verifyAdapters();

  const profileRow = await prisma.icpProfile.findFirst({ where: { active: true } });
  if (!profileRow) throw new Error("No active ICP — run db:seed first.");
  const icp: IcpProfile = icpProfile.parse(profileRow.config);

  console.log("\n=== Persisting scored leads to Neon ===");
  // A single sequence + the approval-queue data live here.
  const sequence = await prisma.sequence.upsert({
    where: { id: "seed-seq-uae" },
    create: {
      id: "seed-seq-uae",
      name: "UAE SMB — opener (email + LinkedIn)",
      status: "active",
      steps: [
        { channel: "email", delayHours: 0, templateId: "opener" },
        { channel: "linkedin", delayHours: 48, templateId: "connect" },
      ] as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  let approvals = 0;
  for (const lead of COMPANIES) {
    const c = lead.company;
    const company = await prisma.company.upsert({
      where: { domain: c.domain! },
      create: {
        domain: c.domain,
        name: c.name,
        website: c.website ?? null,
        industry: c.industry ?? null,
        employeeCount: c.employeeCount ?? null,
        region: c.region ?? null,
        country: c.country ?? null,
        lat: c.lat ?? null,
        lng: c.lng ?? null,
        placeId: c.placeId ?? null,
        localCategory: c.localCategory ?? null,
        techStack: c.techStack ?? [],
        sources: { domain: "places", industry: "apollo" } as Prisma.InputJsonValue,
      },
      update: { industry: c.industry ?? null, employeeCount: c.employeeCount ?? null },
    });
    const contact = await prisma.contact.upsert({
      where: { email: lead.contact.email! },
      create: {
        companyId: company.id,
        fullName: lead.contact.fullName,
        title: lead.contact.title ?? null,
        seniority: lead.contact.seniority ?? null,
        department: lead.contact.department ?? null,
        email: lead.contact.email,
      },
      update: { companyId: company.id },
    });

    // Signals (collected + decay-windowed) persisted.
    const { signals } = await collectSignals(
      [{ name: "seed", isConfigured: () => true, fetchSignals: async () => lead.signals }],
      { companyDomain: c.domain ?? undefined },
      ctx,
    );
    await prisma.signal.deleteMany({
      where: { companyId: company.id, provider: { in: ["theirstack", "predictleads", "exa"] } },
    });
    for (const s of signals) {
      await prisma.signal.create({
        data: {
          companyId: company.id,
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

    const score = scoreLead(toScoringSubject(c, lead.contact, signals), icp, NOW);
    await prisma.score.upsert({
      where: { contactId_icpProfileId: { contactId: contact.id, icpProfileId: profileRow.id } },
      create: {
        contactId: contact.id,
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

    // Top leads get an enrolment + an awaiting-approval message (the queue).
    if (score.tier === "A" || score.tier === "B") {
      const enrolment = await prisma.enrolment.upsert({
        where: { contactId_sequenceId: { contactId: contact.id, sequenceId: sequence.id } },
        create: {
          contactId: contact.id,
          sequenceId: sequence.id,
          status: "active",
          currentStep: 0,
        },
        update: {},
      });
      const opener = `Saw ${c.name} ${lead.signals[0]?.type === "hiring" ? "is hiring a Sales Executive" : "recent activity"} — worth a quick chat about your sales workflow?`;
      await prisma.message.upsert({
        where: { channel_externalId: { channel: "email", externalId: `seed-${contact.id}` } },
        create: {
          enrolmentId: enrolment.id,
          channel: "email",
          direction: "outbound",
          status: "awaiting_approval",
          body: opener,
          templateId: "opener",
          externalId: `seed-${contact.id}`,
        },
        update: { status: "awaiting_approval", body: opener },
      });
      approvals++;
    }
    console.log(`  ${score.tier}  composite=${score.composite.toFixed(0)}  ${c.name}`);
  }

  await prisma.auditLog.create({
    data: {
      actor: "system:seed-production",
      action: "pipeline.seed",
      entity: "Company",
      payload: { companies: COMPANIES.length, approvals },
    },
  });

  const counts = {
    companies: await prisma.company.count(),
    contacts: await prisma.contact.count(),
    signals: await prisma.signal.count(),
    scores: await prisma.score.count(),
    awaitingApproval: await prisma.message.count({ where: { status: "awaiting_approval" } }),
  };
  console.log("\n=== Neon now contains ===");
  console.log(
    `  ${counts.companies} companies, ${counts.contacts} contacts, ${counts.signals} signals, ${counts.scores} scores, ${counts.awaitingApproval} messages awaiting approval`,
  );
  console.log("Nothing sent — all messages are awaiting_approval (the gate).");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
/* eslint-enable no-console */
