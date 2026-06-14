import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { NormalisedSignal } from "../contracts/model";

// ── Zod boundary ─────────────────────────────────────────────────────────────

/**
 * Exa POST /search response schema validated at the adapter boundary.
 * Fields not needed by the signal model are kept optional so the schema never
 * fabricates values from absent data.
 */
export const exaResultItem = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  /**
   * ISO-8601 string when the page was published.
   * Absent on many results — callers MUST skip items without this field rather
   * than inventing a date (brief §2.4, data quality rules).
   */
  publishedDate: z.string().datetime({ offset: true }).optional(),
  author: z.string().nullable().optional(),
  /**
   * Exa's neural relevance score; typically 0..1 though the API docs note it
   * can exceed 1 for highly relevant results. We clamp to [0, 1] in the mapper.
   */
  score: z.number(),
  /** Extracted page text; present only when contents.text:true is sent. */
  text: z.string().optional(),
});

export const exaSearchResponse = z.object({
  results: z.array(exaResultItem).default([]),
});

export type ExaSearchResponse = z.infer<typeof exaSearchResponse>;
export type ExaResultItem = z.infer<typeof exaResultItem>;

// ── Mapping helpers ──────────────────────────────────────────────────────────

/**
 * Clamp `score` to [0, 1].
 *
 * Exa's documentation describes `score` as a neural relevance measure.
 * In practice values above 1 can appear for top-ranked results; values below 0
 * are not documented but we guard defensively. The strength field in
 * NormalisedSignal is defined as 0..1 pre-decay, so we clamp without scaling.
 */
function clampStrength(score: number): number {
  return Math.min(1, Math.max(0, score));
}

/**
 * Map one validated Exa result to a NormalisedSignal of type "news".
 *
 * Returns `null` when `publishedDate` is absent — the orchestration core
 * requires a real detection timestamp and fabricating one would mislead the
 * signal-decay model.
 */
export function exaResultToSignal(
  item: ExaResultItem,
  companyDomain: string | null | undefined,
): NormalisedSignal | null {
  if (!item.publishedDate) return null;

  const evidence: Record<string, unknown> = {
    title: item.title,
  };
  if (item.author != null) evidence["author"] = item.author;
  if (item.text) evidence["excerpt"] = item.text.slice(0, 280);

  return {
    type: "news",
    provider: "exa",
    companyDomain: normaliseDomain(companyDomain ?? null),
    sourceUrl: item.url,
    strength: clampStrength(item.score),
    detectedAt: new Date(item.publishedDate),
    // expiresAt is intentionally absent — assigned centrally by the orchestration core.
    evidence,
  };
}
