import { Prisma } from "@prisma/client";
import { icpProfile } from "@oie/core";
import { prisma } from "./client";
import { seedIcp } from "./seed-data";

/**
 * Idempotent seed. Validates the seed ICP against the canonical Zod schema
 * before writing (never seed invalid data), then upserts it on (name, version).
 * Re-running the seed never creates duplicates.
 */
async function main(): Promise<void> {
  const parsed = icpProfile.parse(seedIcp);
  // The validated ICP is plain JSON data; cast to Prisma's JSON input type.
  const config = parsed as unknown as Prisma.InputJsonObject;

  const profile = await prisma.icpProfile.upsert({
    where: { name_version: { name: parsed.name, version: parsed.version } },
    create: {
      name: parsed.name,
      version: parsed.version,
      active: parsed.active,
      config,
    },
    update: {
      active: parsed.active,
      config,
    },
  });

  // Maintain the single-active-profile invariant.
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
  console.log(
    `Seeded ICP "${profile.name}" v${profile.version} (id=${profile.id}, active=${profile.active}).`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console -- surface the failure to the operator.
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
