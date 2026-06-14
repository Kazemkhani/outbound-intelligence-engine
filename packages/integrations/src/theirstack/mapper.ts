import { z } from "zod";
import { normaliseDomain } from "@oie/core";
import type { NormalisedSignal } from "../contracts/index";

/**
 * TheirStack jobs/search v1 response schema — validated at the boundary.
 * Only the fields we consume are required; extra fields are stripped by Zod's
 * default strip mode so vendor shape can never leak into the core.
 */
const theirStackJob = z.object({
  id: z.string(),
  job_title: z.string(),
  company_domain: z.string(),
  date_posted: z.string(), // ISO-8601 date string
  url: z.string().url(),
  technology_slugs: z.array(z.string()).optional(),
  seniority: z.string().optional(),
});

export type TheirStackJob = z.infer<typeof theirStackJob>;

export const theirStackJobsSearchResponse = z.object({
  data: z.array(theirStackJob),
  metadata: z
    .object({
      total: z.number().optional(),
      page: z.number().optional(),
      page_size: z.number().optional(),
    })
    .optional(),
});

export type TheirStackJobsSearchResponse = z.infer<typeof theirStackJobsSearchResponse>;

/**
 * Derive a hiring-signal strength from the age of a job posting.
 *
 * Rule (documented here as required by brief §2.4):
 *   - A posting dated today scores 0.9 (very fresh intent).
 *   - Strength decays linearly to 0.3 at 30 days old.
 *   - Postings older than 30 days are clamped at 0.3 (still indicative).
 *   - Result is clamped to [0, 1].
 *
 * The decay *window* (how long a signal remains live in the pipeline) is
 * assigned centrally by the orchestration layer, not here. We emit the raw
 * provider strength only.
 */
export function hiringStrength(detectedAt: Date, now = new Date()): number {
  const ageMs = now.getTime() - detectedAt.getTime();
  const ageDays = ageMs / (1_000 * 60 * 60 * 24);
  const MAX_AGE_DAYS = 30;
  const HIGH = 0.9;
  const LOW = 0.3;
  const strength = HIGH - ((HIGH - LOW) * Math.min(ageDays, MAX_AGE_DAYS)) / MAX_AGE_DAYS;
  return Math.min(1, Math.max(0, strength));
}

/**
 * Derive a tech-adoption signal strength from the number of technologies
 * detected across a batch of postings.
 *
 * Rule:
 *   - Each unique tech slug detected adds 0.15, starting from a base of 0.5.
 *   - Result is clamped to [0, 1].
 *
 * Rationale: a company advertising multiple technologies in job postings is a
 * stronger adoption signal than one that mentions a single tool.
 */
export function techAdoptionStrength(uniqueTechCount: number): number {
  const BASE = 0.5;
  const PER_TECH = 0.15;
  return Math.min(1, Math.max(0, BASE + uniqueTechCount * PER_TECH));
}

/**
 * Map a validated TheirStack job-postings batch to `NormalisedSignal[]`.
 *
 * Signal-type mapping:
 *   - Every job posting → one "hiring" signal.  The job title, seniority, and
 *     posting URL are carried in `evidence` for downstream scoring.
 *   - When `technology_slugs` are present across the batch, ONE aggregated
 *     "tech_adoption" signal is emitted per company domain, listing all unique
 *     slugs in `evidence`.  Aggregating avoids flooding the signal store with
 *     one record per posting-per-tech; the orchestration layer decides weight.
 *
 * `expiresAt` is intentionally left `undefined` — the pipeline assigns decay
 * windows centrally (brief §2.4).
 */
export function mapJobsToSignals(
  jobs: TheirStackJob[],
  provider: string,
  now = new Date(),
): NormalisedSignal[] {
  const signals: NormalisedSignal[] = [];

  // Collect all tech slugs per domain for the aggregated tech_adoption signal.
  const techByDomain = new Map<string, Set<string>>();

  for (const job of jobs) {
    const detectedAt = new Date(job.date_posted);
    const companyDomain = normaliseDomain(job.company_domain);

    // Hiring signal — one per job posting.
    signals.push({
      companyDomain,
      type: "hiring",
      strength: hiringStrength(detectedAt, now),
      sourceUrl: job.url,
      provider,
      evidence: {
        jobTitle: job.job_title,
        jobId: job.id,
        ...(job.seniority !== undefined ? { seniority: job.seniority } : {}),
      },
      detectedAt,
    });

    // Accumulate tech slugs.
    if (job.technology_slugs && job.technology_slugs.length > 0) {
      const key = companyDomain ?? job.company_domain;
      const existing = techByDomain.get(key);
      if (existing) {
        for (const slug of job.technology_slugs) existing.add(slug);
      } else {
        techByDomain.set(key, new Set(job.technology_slugs));
      }
    }
  }

  // Emit one aggregated tech_adoption signal per domain that had tech slugs.
  for (const [domainKey, slugSet] of techByDomain.entries()) {
    const slugs = Array.from(slugSet).sort();
    signals.push({
      companyDomain: domainKey,
      type: "tech_adoption",
      strength: techAdoptionStrength(slugs.length),
      provider,
      evidence: {
        technologies: slugs,
        postingCount: jobs.filter(
          (j) => (normaliseDomain(j.company_domain) ?? j.company_domain) === domainKey,
        ).length,
      },
      detectedAt: now,
    });
  }

  return signals;
}
