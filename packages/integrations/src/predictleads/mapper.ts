import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { SignalType } from "@oie/core";
import type { NormalisedSignal } from "../contracts/model";

// ── PredictLeads v3 response schema ─────────────────────────────────────────
//
// GET /api/v3/companies/<domain>/events returns a JSON:API-style envelope.
// Every field is validated here; vendor shapes never cross this boundary.

export const predictLeadsEventAttributes = z.object({
  category: z.string(),
  title: z.string(),
  found_at: z.string(), // ISO-8601 datetime string
  news_article_url: z.string().nullable().optional(),
  additional_data: z.record(z.unknown()).nullable().optional(),
});

export const predictLeadsEvent = z.object({
  id: z.string(),
  type: z.literal("event"),
  attributes: predictLeadsEventAttributes,
});

export const predictLeadsEventsResponse = z.object({
  data: z.array(predictLeadsEvent),
});

export type PredictLeadsEventsResponse = z.infer<typeof predictLeadsEventsResponse>;
export type PredictLeadsEvent = z.infer<typeof predictLeadsEvent>;
export type PredictLeadsEventAttributes = z.infer<typeof predictLeadsEventAttributes>;

// ── Category → SignalType mapping ───────────────────────────────────────────
//
// Strength rationale (0..1 scale, pre-decay):
//
// | Category(ies)                                    | SignalType     | Strength | Rationale                                                         |
// |--------------------------------------------------|----------------|----------|-------------------------------------------------------------------|
// | financing, funding_round                         | funding        | 0.9      | Highest buying intent; fresh capital is actionable immediately    |
// | acquisition                                      | funding        | 0.8      | Major corporate event; still signals resource and strategic shift |
// | job_change, executive_change, leadership         | job_change     | 0.8      | New executive = new budget owner; window is short and valuable    |
// | job_opening, new_job_opening, hiring             | hiring         | 0.7      | Growing headcount correlates with spend; many signals compound    |
// | product_launch, technology, uses_technology      | tech_adoption  | 0.6      | Signals tech stack openness; useful but indirect buying signal    |
// | news, press, award, expansion, customer_win      | news           | 0.4      | Relevant context; lower intent than operational signals           |
// | anything else (unknown category)                 | news (default) | 0.3      | We do not skip unknowns — they land as low-strength news signals  |
//
// Skipping unknown categories was considered but rejected: an unknown category
// still demonstrates company activity and is preferable to silently discarding
// data. The 0.3 strength floors them below all known categories so the
// orchestration decay can deprioritise them naturally.

interface CategoryMapping {
  type: SignalType;
  strength: number;
}

const CATEGORY_MAP: Record<string, CategoryMapping> = {
  // Funding / M&A
  financing: { type: "funding", strength: 0.9 },
  funding_round: { type: "funding", strength: 0.9 },
  acquisition: { type: "funding", strength: 0.8 },

  // Leadership / job change
  job_change: { type: "job_change", strength: 0.8 },
  executive_change: { type: "job_change", strength: 0.8 },
  leadership: { type: "job_change", strength: 0.8 },

  // Hiring
  job_opening: { type: "hiring", strength: 0.7 },
  new_job_opening: { type: "hiring", strength: 0.7 },
  hiring: { type: "hiring", strength: 0.7 },

  // Tech adoption
  product_launch: { type: "tech_adoption", strength: 0.6 },
  technology: { type: "tech_adoption", strength: 0.6 },
  uses_technology: { type: "tech_adoption", strength: 0.6 },

  // News / awareness
  news: { type: "news", strength: 0.4 },
  press: { type: "news", strength: 0.4 },
  award: { type: "news", strength: 0.4 },
  expansion: { type: "news", strength: 0.4 },
  customer_win: { type: "news", strength: 0.4 },
};

const UNKNOWN_MAPPING: CategoryMapping = { type: "news", strength: 0.3 };

function resolveCategory(category: string): CategoryMapping {
  return CATEGORY_MAP[category] ?? UNKNOWN_MAPPING;
}

/** Translate a single PredictLeads event into the unified NormalisedSignal shape. */
export function eventToSignal(event: PredictLeadsEvent, companyDomain: string): NormalisedSignal {
  const { category, title, found_at, news_article_url, additional_data } = event.attributes;
  const { type, strength } = resolveCategory(category);

  const evidence: Record<string, unknown> = {
    category,
    title,
    ...(additional_data ?? {}),
  };

  return {
    companyDomain: normaliseDomain(companyDomain),
    type,
    strength,
    sourceUrl: news_article_url ?? null,
    provider: "predictleads",
    evidence,
    detectedAt: new Date(found_at),
    // expiresAt is intentionally omitted — assigned centrally by the orchestration
    // decay layer, not by the adapter.
  };
}
