import { z } from "zod";
import { dubaiPulseRecordToSignals, type DubaiPulseRecord } from "./mapper";
import type { NormalisedSignal } from "../contracts/model";

/**
 * Real DLD `dld_transactions-open` ingest layer.
 *
 * Dubai Pulse publishes raw transaction ROWS (one per registered transaction),
 * NOT the pre-aggregated period counts our signal mapper consumes. This module
 * confines the real 46-column DLD shape and turns a batch of raw rows into the
 * aggregated DubaiPulseRecord shape that ./mapper already turns into intent
 * signals (transaction_spike + off_plan_launch). We reuse the tested mapper, so
 * the scoring contract is unchanged.
 *
 * Schema verified against the official dld_transactions-open dataset (46 cols).
 * We only read the columns we need; unknown columns are ignored. The producing
 * feed is owner-gated (a free Dubai Pulse OAuth registration, see ./AGENTS.md);
 * this code is the real, plug-in transform that runs the moment rows arrive.
 */

/** The subset of the real DLD transaction row we use. Extra columns are ignored. */
export const dldRawRow = z.object({
  /** Registration date (the signal date). */
  instance_date: z.string(),
  /** Transaction category: "Sales" | "Mortgages" | "Gifts". */
  trans_group_en: z.string().optional().nullable(),
  /** "Existing Properties" | "Off-Plan Properties". */
  reg_type_en: z.string().optional().nullable(),
  /** Community / area name — the reliable grouping key. */
  area_name_en: z.string().optional().nullable(),
  master_project_en: z.string().optional().nullable(),
  project_name_en: z.string().optional().nullable(),
  /** Sale / mortgage value in AED. */
  actual_worth: z.coerce.number().optional().nullable(),
  property_type_en: z.string().optional().nullable(),
});

export type DldRawRow = z.infer<typeof dldRawRow>;

const DAY_MS = 86_400_000;

function isOffPlan(regType: string | null | undefined): boolean {
  return (regType ?? "").toLowerCase().includes("off");
}

function isSales(group: string | null | undefined): boolean {
  // Only sales are a demand signal; mortgages/gifts are not. Missing group counts
  // as sales (the open dataset's dominant category) rather than being dropped.
  const g = (group ?? "").toLowerCase();
  return g === "" || g.includes("sale");
}

/**
 * Aggregate raw DLD rows into DubaiPulseRecord[]: one transaction_spike candidate
 * per area (current vs prior `periodDays` window) and one off_plan_launch per
 * project that has off-plan sales in the current window but none in the prior
 * (i.e. a launch). `now` is injected — never read from the clock here — so the
 * aggregation is deterministic and testable.
 */
export function aggregateTransactions(
  rawRows: unknown[],
  opts: { now: Date; periodDays?: number },
): DubaiPulseRecord[] {
  const periodDays = opts.periodDays ?? 30;
  const now = opts.now;
  const curStart = new Date(now.getTime() - periodDays * DAY_MS);
  const priorStart = new Date(now.getTime() - 2 * periodDays * DAY_MS);

  const areaCounts = new Map<string, { cur: number; prior: number }>();
  const projCounts = new Map<string, { area: string; project: string; cur: number; prior: number }>();

  for (const raw of rawRows) {
    const parsed = dldRawRow.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (!isSales(row.trans_group_en)) continue;

    const d = new Date(row.instance_date);
    if (Number.isNaN(d.getTime())) continue;
    const inCur = d >= curStart && d <= now;
    const inPrior = d >= priorStart && d < curStart;
    if (!inCur && !inPrior) continue;

    const area = (row.area_name_en ?? "").trim();
    if (area) {
      const a = areaCounts.get(area) ?? { cur: 0, prior: 0 };
      if (inCur) a.cur += 1;
      else a.prior += 1;
      areaCounts.set(area, a);
    }

    if (isOffPlan(row.reg_type_en)) {
      const project = (row.project_name_en ?? row.master_project_en ?? "").trim();
      if (project) {
        const key = `${project}::${area}`;
        const pc = projCounts.get(key) ?? { area, project, cur: 0, prior: 0 };
        if (inCur) pc.cur += 1;
        else pc.prior += 1;
        projCounts.set(key, pc);
      }
    }
  }

  const periodEnd = now.toISOString().slice(0, 10);
  const out: DubaiPulseRecord[] = [];

  for (const [area, c] of areaCounts) {
    if (c.cur === 0) continue; // no current-period activity -> no signal
    out.push({
      area,
      periodEnd,
      transactionCount: c.cur,
      priorPeriodCount: c.prior,
      projectLaunch: false,
      sourceUrl: "https://www.dubaipulse.gov.ae/data/dld-transactions",
    });
  }

  for (const pc of projCounts.values()) {
    // A launch = off-plan sales appearing now with none in the prior window.
    if (pc.cur > 0 && pc.prior === 0) {
      out.push({
        area: pc.area || "Dubai",
        projectName: pc.project,
        periodEnd,
        transactionCount: pc.cur,
        projectLaunch: true,
        sourceUrl: "https://www.dubaipulse.gov.ae/data/dld-projects",
      });
    }
  }

  return out;
}

/** Convenience: raw DLD rows straight to NormalisedSignals via the tested mapper. */
export function rawTransactionsToSignals(
  rawRows: unknown[],
  opts: { now: Date; periodDays?: number },
): NormalisedSignal[] {
  return aggregateTransactions(rawRows, opts).flatMap(dubaiPulseRecordToSignals);
}
