"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@oie/db";
import { z } from "zod";

/**
 * Platform configuration — written to data/platform-config.json and upserted
 * into the DB IcpProfile. Everything here is safe to commit except API keys
 * (which stay in .env). The file is gitignored so each deployment customises
 * its own config without touching the codebase.
 */

const setupSchema = z.object({
  // Business identity
  businessName: z.string().min(1).max(100),
  website: z.string().max(200).optional(),
  tagline: z.string().max(200).optional(),
  oneLiner: z.string().max(500),

  // ICP
  targetIndustries: z.array(z.string()).min(1),
  companySizeMin: z.number().int().min(1).max(100000),
  companySizeMax: z.number().int().min(1).max(100000),
  targetGeographies: z.array(z.string()).min(1),
  targetTitles: z.array(z.string()).min(1),

  // Offer
  whatYouSell: z.string().min(10).max(1000),
  keyBenefits: z.array(z.string()).min(1),
  differentiators: z.array(z.string()).min(1),
  pricingNote: z.string().max(500).optional(),

  // Objections & competition
  topObjections: z.array(z.string()),
  mainCompetitors: z.array(z.string()),
});

export type SetupData = z.infer<typeof setupSchema>;

export type SetupResult = { ok: true } | { ok: false; error: string };

export async function saveSetup(raw: unknown): Promise<SetupResult> {
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };
  }
  const data = parsed.data;

  // 1. Write platform-config.json so the app can read it without a DB query.
  try {
    const configDir = path.join(process.cwd(), "data");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "platform-config.json"),
      JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch (err) {
    return { ok: false, error: `Could not write config: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 2. Upsert the ICP profile in the DB (non-fatal if DB is unavailable).
  try {
    const icpConfig = {
      firmographics: {
        industries: { values: data.targetIndustries, weight: 0.25 },
        employeeCount: { min: data.companySizeMin, max: data.companySizeMax, weight: 0.15 },
        revenueBand: { values: [], weight: 0 },
        geographies: { countries: data.targetGeographies, regions: [], weight: 0.2 },
        localCategory: { values: [], weight: 0.1 },
      },
      technographics: { uses: [], avoids: [], weight: 0.15 },
      people: {
        titles: data.targetTitles,
        seniority: ["c_level", "vp", "director"],
        departments: ["sales", "operations", "general"],
        weight: 0.15,
      },
      signals: [
        { type: "hiring", config: {}, weight: 0.4 },
        { type: "funding", config: {}, weight: 0.3 },
      ],
      keywords: { include: [], exclude: [], weight: 0 },
      compositeBlend: { fit: 0.6, intent: 0.4 },
      tierThresholds: { A: 80, B: 65, C: 50 },
    };

    // Deactivate any existing active profiles first.
    await prisma.icpProfile.updateMany({ where: { active: true }, data: { active: false } });

    await prisma.icpProfile.upsert({
      where: { name_version: { name: data.businessName, version: 1 } },
      create: {
        name: data.businessName,
        version: 1,
        active: true,
        config: icpConfig,
      },
      update: {
        active: true,
        config: icpConfig,
      },
    });
  } catch {
    // Non-fatal — config file is the source of truth for the UI.
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/icp");
  return { ok: true };
}

export async function loadConfig(): Promise<SetupData | null> {
  try {
    const configPath = path.join(process.cwd(), "data", "platform-config.json");
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    const parsed = setupSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
