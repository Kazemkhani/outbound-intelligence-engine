/**
 * Install a synthetic B2B SaaS profile for local evaluation.
 *
 * Run: pnpm exec tsx --env-file=.env scripts/seed-example-icp.ts
 */
import { icpProfile, type IcpProfile } from "../packages/core/src/index";
import { prisma, Prisma } from "../packages/db/src/index";

const syntheticProfile = {
  id: "example-b2b-saas",
  name: "Example: B2B SaaS",
  version: 1,
  active: true,
  firmographics: {
    industries: {
      values: ["software", "information technology", "saas"],
      weight: 0.7,
    },
    employeeCount: { min: 10, max: 1000, weight: 0.6 },
    revenueBand: { values: [], weight: 0 },
    geographies: {
      countries: ["United States", "United Kingdom", "United Arab Emirates"],
      regions: [],
      weight: 0.4,
    },
    localCategory: { values: [], weight: 0 },
  },
  technographics: {
    uses: ["salesforce", "hubspot"],
    avoids: [],
    weight: 0.2,
  },
  people: {
    titles: ["Founder", "VP Sales", "Head of Sales", "Revenue Operations"],
    seniority: ["c_level", "vp", "director"],
    departments: ["sales", "operations"],
    weight: 0.5,
  },
  signals: [
    {
      type: "hiring",
      config: { keywords: ["sales", "business development", "revenue operations"] },
      weight: 0.5,
    },
    {
      type: "funding",
      config: {},
      weight: 0.3,
    },
    {
      type: "news",
      config: { keywords: ["launch", "expansion", "partnership"] },
      weight: 0.2,
    },
  ],
  keywords: {
    include: ["B2B", "SaaS", "software"],
    exclude: ["consumer"],
    weight: 0.3,
  },
  compositeBlend: { fit: 0.6, intent: 0.4 },
  tierThresholds: { A: 80, B: 65, C: 50 },
} satisfies IcpProfile;

async function seedProfile(): Promise<string> {
  const candidate = icpProfile.parse(syntheticProfile);
  const config = candidate as unknown as Prisma.InputJsonObject;
  return prisma.$transaction(async (tx) => {
    const profile = await tx.icpProfile.upsert({
      where: { name_version: { name: candidate.name, version: candidate.version } },
      create: {
        name: candidate.name,
        version: candidate.version,
        active: true,
        config,
      },
      update: { active: true, config },
    });
    await tx.icpProfile.updateMany({
      where: { id: { not: profile.id }, active: true },
      data: { active: false },
    });
    await tx.auditLog.create({
      data: {
        actor: "system:seed",
        action: "icp.seed",
        entity: "IcpProfile",
        entityId: profile.id,
        payload: { name: profile.name, version: profile.version },
      },
    });
    return profile.id;
  });
}

seedProfile()
  .then((id) => console.log(`Activated synthetic ICP ${id}.`))
  .catch((error: unknown) => {
    console.error("Unable to seed the synthetic ICP.", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
