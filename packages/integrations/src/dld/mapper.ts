import { z } from "zod";
import type { NormalisedSignal } from "../contracts/model";

/**
 * Dubai Pulse / DLD adapter boundary. Dubai Pulse publishes UAE real-estate
 * transaction and project data that no global B2B vendor packages. We turn it
 * into two UAE-native intent signals:
 *   - transaction_spike: a developer/area's recent transaction volume jumped vs
 *     the prior period (a "this week" timing signal for inbound-lead pressure).
 *   - off_plan_launch: a new off-plan project launched (a launch-week lead spike).
 *
 * All Dubai-Pulse-specific shapes stay in this package; only NormalisedSignal
 * leaves the adapter boundary. We never fabricate: a record without a valid
 * period date yields no signal, and a flat/declining period yields no spike.
 */

export const dubaiPulseRecord = z.object({
  area: z.string(),
  developer: z.string().optional(),
  projectName: z.string().optional(),
  /** ISO-8601 date marking the end of the measured period. Required to date the signal. */
  periodEnd: z.string(),
  transactionCount: z.number().nonnegative(),
  priorPeriodCount: z.number().nonnegative().optional(),
  projectLaunch: z.boolean().optional(),
  sourceUrl: z.string().url().optional(),
});

export const dubaiPulseResponse = z.object({
  records: z.array(dubaiPulseRecord).default([]),
});

export type DubaiPulseRecord = z.infer<typeof dubaiPulseRecord>;
export type DubaiPulseResponse = z.infer<typeof dubaiPulseResponse>;

/** A transaction count this multiple of the prior period (or more) is a spike. */
export const SPIKE_RATIO = 1.5;
/** Ratio at which spike strength saturates to 1.0. */
const SPIKE_CEILING = 3;
/** A confirmed off-plan launch is a strong, fixed-strength timing signal. */
const OFF_PLAN_LAUNCH_STRENGTH = 0.8;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Map one Dubai Pulse record to zero, one, or two NormalisedSignals. Returns []
 * when the period date is missing/invalid (we never invent a detection time).
 * companyDomain is null: DLD identifies firms by name, not domain, so the
 * orchestration matches by name using the evidence below.
 */
export function dubaiPulseRecordToSignals(record: DubaiPulseRecord): NormalisedSignal[] {
  const detectedAt = parseDate(record.periodEnd);
  if (detectedAt === null) return [];

  const out: NormalisedSignal[] = [];
  const baseEvidence = {
    area: record.area,
    ...(record.developer ? { developer: record.developer } : {}),
    ...(record.projectName ? { projectName: record.projectName } : {}),
  };

  // transaction_spike: a meaningful jump vs the prior period.
  if (record.priorPeriodCount && record.priorPeriodCount > 0) {
    const ratio = record.transactionCount / record.priorPeriodCount;
    if (ratio >= SPIKE_RATIO) {
      out.push({
        companyDomain: null,
        type: "transaction_spike",
        strength: clamp01((ratio - 1) / (SPIKE_CEILING - 1)),
        sourceUrl: record.sourceUrl ?? null,
        provider: "dld",
        evidence: {
          ...baseEvidence,
          transactionCount: record.transactionCount,
          priorPeriodCount: record.priorPeriodCount,
          ratio: Number(ratio.toFixed(2)),
        },
        detectedAt,
      });
    }
  }

  // off_plan_launch: a confirmed new project launch.
  if (record.projectLaunch === true) {
    out.push({
      companyDomain: null,
      type: "off_plan_launch",
      strength: OFF_PLAN_LAUNCH_STRENGTH,
      sourceUrl: record.sourceUrl ?? null,
      provider: "dld",
      evidence: { ...baseEvidence, transactionCount: record.transactionCount },
      detectedAt,
    });
  }

  return out;
}
