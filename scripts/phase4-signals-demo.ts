/**
 * Phase 4 / Stream B evidence (brief §11 acceptance): a scan stores dated
 * signals with evidence and visibly MOVES the intent score. Run against local
 * Postgres:  pnpm exec tsx --env-file=.env scripts/phase4-signals-demo.ts
 *
 * No live provider calls — a fixture SignalProvider stands in for TheirStack so
 * this is reproducible and keyless. DRY_RUN is irrelevant here (no sends).
 */
import { prisma, Prisma } from "../packages/db/src/index";
import {
  icpProfile,
  scoreLead,
  SCORING_MODEL_VERSION,
  type IcpProfile,
} from "../packages/core/src/index";
import { collectSignals, toScoringSubject } from "../packages/orchestration/src/index";
import type {
  AdapterContext,
  NormalisedSignal,
  SignalProvider,
} from "../packages/integrations/src/index";

const NOW = new Date("2026-06-14T00:00:00Z");
const DOMAIN = "alnoorjewellery.ae";

/** A fixture provider standing in for TheirStack — one fresh hiring signal. */
const fixtureSignals: SignalProvider = {
  name: "theirstack-fixture",
  isConfigured: () => true,
  async fetchSignals(): Promise<NormalisedSignal[]> {
    return [
      {
        companyDomain: DOMAIN,
        type: "hiring",
        strength: 0.9,
        provider: "theirstack",
        sourceUrl: "https://jobs.alnoorjewellery.ae/sales-executive",
        detectedAt: new Date("2026-06-12T00:00:00Z"),
        evidence: { jobTitle: "Sales Executive", location: "Dubai" },
      },
    ];
  },
};

async function main(): Promise<void> {
  const ctx: AdapterContext = { dryRun: true };

  // Load the active seed ICP.
  const profileRow = await prisma.icpProfile.findFirst({ where: { active: true } });
  if (!profileRow) throw new Error("No active ICP — run pnpm db:seed first.");
  const icp: IcpProfile = icpProfile.parse(profileRow.config);

  // Upsert a demo company + contact in the seed market.
  const company = await prisma.company.upsert({
    where: { domain: DOMAIN },
    create: {
      domain: DOMAIN,
      name: "Al Noor Jewellery LLC",
      industry: "jewellery",
      employeeCount: 45,
      region: "Dubai",
      country: "United Arab Emirates",
      techStack: ["Odoo"],
      sources: { domain: "places", industry: "apollo" },
    },
    update: {},
  });
  const contact = await prisma.contact.upsert({
    where: { email: "owner@alnoorjewellery.ae" },
    create: {
      companyId: company.id,
      fullName: "Aisha Al Noor",
      title: "Owner",
      seniority: "c_level",
      department: "sales",
      email: "owner@alnoorjewellery.ae",
    },
    update: { companyId: company.id },
  });

  const company_facts = {
    domain: company.domain,
    name: company.name,
    industry: company.industry,
    employeeCount: company.employeeCount,
    region: company.region,
    country: company.country,
    techStack: company.techStack,
  };
  const contact_facts = {
    companyDomain: company.domain,
    fullName: contact.fullName,
    title: contact.title,
    seniority: "c_level" as const,
    department: contact.department,
  };

  // 1. BASELINE — score with no signals.
  const baseline = scoreLead(toScoringSubject(company_facts, contact_facts, []), icp, NOW);

  // 2. SCAN — collect signals (fixture), dedup + assign decay window centrally.
  const { signals, trace } = await collectSignals([fixtureSignals], { companyDomain: DOMAIN }, ctx);

  // 3. STORE — persist dated signals with evidence (idempotent: clear prior demo signals first).
  await prisma.signal.deleteMany({ where: { companyId: company.id, provider: "theirstack" } });
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

  // 4. RECOMPUTE — read stored signals back and re-score.
  const stored = await prisma.signal.findMany({ where: { companyId: company.id } });
  const storedSignals: NormalisedSignal[] = stored.map((row) => ({
    companyDomain: company.domain,
    type: row.type,
    strength: row.strength,
    provider: row.provider,
    sourceUrl: row.sourceUrl,
    evidence: (row.evidence ?? {}) as Record<string, unknown>,
    detectedAt: row.detectedAt,
    expiresAt: row.expiresAt,
  }));
  const recomputed = scoreLead(
    toScoringSubject(company_facts, contact_facts, storedSignals),
    icp,
    NOW,
  );

  // 5. PERSIST the score.
  await prisma.score.upsert({
    where: { contactId_icpProfileId: { contactId: contact.id, icpProfileId: profileRow.id } },
    create: {
      contactId: contact.id,
      icpProfileId: profileRow.id,
      fit: recomputed.fit,
      intent: recomputed.intent,
      composite: recomputed.composite,
      tier: recomputed.tier,
      rationale: recomputed.rationale as unknown as Prisma.InputJsonObject,
      modelVersion: SCORING_MODEL_VERSION,
    },
    update: {
      fit: recomputed.fit,
      intent: recomputed.intent,
      composite: recomputed.composite,
      tier: recomputed.tier,
      rationale: recomputed.rationale as unknown as Prisma.InputJsonObject,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "system:phase4-demo",
      action: "signal.scan",
      entity: "Company",
      entityId: company.id,
      payload: { stored: signals.length },
    },
  });

  /* eslint-disable no-console -- this is an operator evidence script */
  console.log("=== Phase 4 signal scan ===");
  console.log(
    "collect trace:",
    trace.map((t) => `${t.provider}:${t.outcome}(${t.count ?? 0})`).join(", "),
  );
  console.log(`stored ${stored.length} dated signal(s):`);
  for (const s of stored) {
    console.log(
      `  - ${s.type} strength=${s.strength} detected=${s.detectedAt.toISOString().slice(0, 10)} expires=${s.expiresAt?.toISOString().slice(0, 10)} evidence=${JSON.stringify(s.evidence)}`,
    );
  }
  console.log("");
  console.log(
    `intent BEFORE scan: ${baseline.intent.toFixed(1)}  (tier ${baseline.tier}, composite ${baseline.composite.toFixed(1)})`,
  );
  console.log(
    `intent AFTER scan:  ${recomputed.intent.toFixed(1)}  (tier ${recomputed.tier}, composite ${recomputed.composite.toFixed(1)})`,
  );
  console.log(`intent moved by:    +${(recomputed.intent - baseline.intent).toFixed(1)}`);
  /* eslint-enable no-console */
}

main()
  .catch((err) => {
    console.error("Phase 4 demo failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
