/**
 * Seed the Huscribe ICP — the real buyer of Huscribe (Voice-AI inbound
 * lead-qualification): UAE/MENA real-estate developers, brokerages and portals
 * with high inbound enquiry volume. Replaces the generic ERP seed as the active
 * profile.
 *
 * Tuned for the phone-first local motion: fit leans on the dimensions we can
 * RELIABLY fill from SearchApi (geography via lat/lng, local category) + Apollo
 * company-enrich (industry, employee count). Dimensions we cannot fill without a
 * paid person-search or a technographics provider (people, technographics,
 * revenue) carry weight 0 so they do not drag fit toward zero. The composite
 * blend and tier thresholds stay at the brief defaults (0.6/0.4, A80/B65/C50).
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/seed-huscribe-icp.ts
 */
import { icpProfile, type IcpProfile } from "../packages/core/src/index";
import { prisma, Prisma } from "../packages/db/src/index";

const huscribeIcp: IcpProfile = {
  id: "huscribe-uae-realestate",
  name: "Huscribe — UAE Real Estate (developers · brokers · portals)",
  version: 1,
  active: true,
  firmographics: {
    industries: {
      values: [
        "real estate",
        "real estate development",
        "property",
        "property management",
        "real estate agency",
        "construction",
        "proptech",
      ],
      weight: 0.6,
    },
    // Inbound enquiry volume matters more than headcount — keep a broad band.
    employeeCount: { min: 5, max: 5000, weight: 0.3 },
    revenueBand: { values: [], weight: 0 },
    geographies: {
      countries: ["United Arab Emirates", "UAE", "AE"],
      regions: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah"],
      // ~150km of Dubai covers the populated emirates; lat/lng are exact.
      radiusKm: { lat: 25.2048, lng: 55.2708, km: 150 },
      weight: 1.0,
    },
    localCategory: {
      values: [
        "real estate developer",
        "real estate developers",
        "property developer",
        "real estate agency",
        "real estate agents",
        "real estate consultant",
        "property management company",
        "real estate",
      ],
      weight: 1.0,
    },
  },
  // No technographics provider wired → exclude from fit (weight 0) rather than
  // penalise every lead with an "unknown".
  technographics: { uses: [], avoids: [], weight: 0 },
  // Phone-first: contacts are synthetic until paid Apollo adds a named person.
  // Keep the persona config documented but weight 0 so it never drags fit.
  people: {
    titles: [
      "Owner",
      "Founder",
      "Managing Director",
      "CEO",
      "Head of Sales",
      "Sales Director",
      "Sales Manager",
      "Head of Marketing",
      "Marketing Manager",
    ],
    seniority: ["c_level", "director", "manager"],
    departments: ["sales", "marketing", "commercial"],
    weight: 0,
  },
  signals: [
    {
      type: "hiring",
      config: {
        keywords: [
          "sales",
          "property consultant",
          "real estate agent",
          "broker",
          "telesales",
          "tele-sales",
          "inside sales",
          "call centre",
          "call center",
          "customer service",
          "lead",
          "CRM",
        ],
      },
      weight: 0.5,
    },
    {
      type: "news",
      config: {
        keywords: ["launch", "new project", "off-plan", "handover", "new development", "sales office", "expansion"],
      },
      weight: 0.3,
    },
    { type: "funding", config: {}, weight: 0.2 },
  ],
  keywords: {
    include: ["real estate", "property", "developer", "off-plan", "brokerage", "agency"],
    exclude: [],
    weight: 0.5,
  },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
};

async function main(): Promise<void> {
  const parsed = icpProfile.parse(huscribeIcp);
  const config = parsed as unknown as Prisma.InputJsonObject;

  const profile = await prisma.icpProfile.upsert({
    where: { name_version: { name: parsed.name, version: parsed.version } },
    create: { name: parsed.name, version: parsed.version, active: parsed.active, config },
    update: { active: parsed.active, config },
  });

  if (parsed.active) {
    await prisma.icpProfile.updateMany({
      where: { id: { not: profile.id }, active: true },
      data: { active: false },
    });
  }

  await prisma.auditLog.create({
    data: {
      actor: "system:seed",
      action: "icp.seed",
      entity: "IcpProfile",
      entityId: profile.id,
      payload: { name: profile.name, version: profile.version },
    },
  });

  // eslint-disable-next-line no-console -- seed scripts report to the operator's console.
  console.log(`Seeded + activated ICP "${profile.name}" (id=${profile.id}). Other profiles deactivated.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console -- surface the failure to the operator.
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
