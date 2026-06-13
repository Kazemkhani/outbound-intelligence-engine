import { z } from "zod";
import { seniority, signalType, weight } from "./types";

/**
 * ICP configuration (brief §10.1). The architecture is generic; the seed ICP
 * (§13.2) is just one instance. Scores are computed deterministically from this
 * profile against the unified data model — the LLM never computes the number.
 */

export const firmographics = z.object({
  industries: z.object({ values: z.array(z.string()), weight }),
  employeeCount: z.object({
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    weight,
  }),
  revenueBand: z.object({ values: z.array(z.string()), weight }),
  geographies: z.object({
    countries: z.array(z.string()).optional(),
    regions: z.array(z.string()).optional(),
    radiusKm: z.object({ lat: z.number(), lng: z.number(), km: z.number().positive() }).optional(),
    weight,
  }),
  // Places categories (e.g. "restaurant") — drives the local/door-to-door motion.
  localCategory: z.object({ values: z.array(z.string()), weight }).optional(),
});

export const technographics = z.object({
  uses: z.array(z.string()),
  avoids: z.array(z.string()),
  weight,
});

export const peopleCriteria = z.object({
  titles: z.array(z.string()),
  seniority: z.array(seniority),
  departments: z.array(z.string()),
  weight,
});

export const signalCriterion = z.object({
  type: signalType,
  config: z.record(z.unknown()),
  weight,
});

export const keywordsCriteria = z.object({
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  weight,
});

export const compositeBlend = z
  .object({ fit: z.number().min(0).max(1), intent: z.number().min(0).max(1) })
  .refine((b) => Math.abs(b.fit + b.intent - 1) < 1e-9, {
    message: "compositeBlend.fit + intent must sum to 1",
  });

export const tierThresholds = z
  .object({ A: z.number(), B: z.number(), C: z.number() })
  .refine((t) => t.A >= t.B && t.B >= t.C, {
    message: "tier thresholds must satisfy A >= B >= C",
  });

export const icpProfile = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  active: z.boolean(),
  firmographics,
  technographics,
  people: peopleCriteria,
  signals: z.array(signalCriterion),
  keywords: keywordsCriteria,
  compositeBlend,
  tierThresholds,
});

export type IcpProfile = z.infer<typeof icpProfile>;
export type Firmographics = z.infer<typeof firmographics>;
export type SignalCriterion = z.infer<typeof signalCriterion>;
