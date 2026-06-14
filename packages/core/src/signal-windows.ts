import type { SignalType } from "./types";

/**
 * Signal decay windows (brief §10.2 `expiresAt`, scoring-conventions). Each
 * signal type has a default time-to-live; a signal contributes full strength at
 * detection and decays linearly to zero at `detectedAt + TTL` (see
 * `signalDecayFactor`). Centralising the policy here keeps ingestion and scoring
 * in agreement — adapters never set their own expiry.
 */
export const DEFAULT_SIGNAL_TTL_DAYS: Record<SignalType, number> = {
  funding: 90, // funding rounds stay relevant for a quarter
  tech_adoption: 60,
  job_change: 45,
  hiring: 30, // a job posting goes stale within a month
  news: 30,
  web_change: 21,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Compute the expiry for a signal from its type and detection time. */
export function signalExpiry(
  type: SignalType,
  detectedAt: Date,
  ttlDays: Partial<Record<SignalType, number>> = {},
): Date {
  const days = ttlDays[type] ?? DEFAULT_SIGNAL_TTL_DAYS[type];
  return new Date(detectedAt.getTime() + days * MS_PER_DAY);
}
