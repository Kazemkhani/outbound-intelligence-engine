import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { DLDAdapter } from "./index";
import { dubaiPulseRecordToSignals, type DubaiPulseRecord } from "./mapper";
import fixture from "./fixtures/transactions.json";

const ctx = (overrides?: Partial<AdapterContext>): { ctx: AdapterContext; costs: CostRecord[] } => {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: false, recordCost: (c) => costs.push(c), ...overrides }, costs };
};

const rec = (over: Partial<DubaiPulseRecord> = {}): DubaiPulseRecord => ({
  area: "Business Bay",
  periodEnd: "2026-06-20",
  transactionCount: 100,
  ...over,
});

describe("dubaiPulseRecordToSignals", () => {
  it("emits transaction_spike when volume jumps >= 1.5x, scaled by the ratio", () => {
    const [s] = dubaiPulseRecordToSignals(rec({ transactionCount: 180, priorPeriodCount: 90 }));
    expect(s?.type).toBe("transaction_spike");
    expect(s?.provider).toBe("dld");
    expect(s?.companyDomain).toBeNull();
    // ratio 2.0 -> (2-1)/(3-1) = 0.5
    expect(s?.strength).toBeCloseTo(0.5, 5);
    expect(s?.detectedAt.toISOString().slice(0, 10)).toBe("2026-06-20");
  });

  it("saturates spike strength to 1 at a 3x or greater ratio", () => {
    const [s] = dubaiPulseRecordToSignals(rec({ transactionCount: 400, priorPeriodCount: 100 }));
    expect(s?.strength).toBe(1);
  });

  it("emits no spike for a flat or declining period", () => {
    expect(dubaiPulseRecordToSignals(rec({ transactionCount: 20, priorPeriodCount: 22 }))).toEqual([]);
  });

  it("emits off_plan_launch on a launch, with a fixed strength", () => {
    const sigs = dubaiPulseRecordToSignals(rec({ projectLaunch: true, projectName: "Marina Heights" }));
    const launch = sigs.find((s) => s.type === "off_plan_launch");
    expect(launch?.strength).toBe(0.8);
    expect(launch?.evidence?.projectName).toBe("Marina Heights");
  });

  it("can emit BOTH a spike and a launch from one record", () => {
    const sigs = dubaiPulseRecordToSignals(
      rec({ transactionCount: 200, priorPeriodCount: 100, projectLaunch: true }),
    );
    expect(sigs.map((s) => s.type).sort()).toEqual(["off_plan_launch", "transaction_spike"]);
  });

  it("never fabricates a date: an invalid periodEnd yields no signals", () => {
    expect(dubaiPulseRecordToSignals(rec({ periodEnd: "not-a-date", transactionCount: 999, priorPeriodCount: 1 }))).toEqual([]);
  });
});

describe("DLDAdapter", () => {
  it("isConfigured is false without an endpoint, true with one", () => {
    expect(new DLDAdapter().isConfigured()).toBe(false);
    expect(new DLDAdapter({ endpoint: "https://api.example/ds" }).isConfigured()).toBe(true);
  });

  it("returns [] when not configured (no live calls)", async () => {
    const { ctx: c } = ctx();
    expect(await new DLDAdapter().fetchSignals({}, c)).toEqual([]);
  });

  it("maps a Dubai Pulse response into signals and records a (free) cost unit", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new DLDAdapter({ endpoint: "https://api.example/ds", transport });
    const { ctx: c, costs } = ctx();
    const signals = await adapter.fetchSignals({}, c);
    // fixture: spike(Business Bay) + launch(Marina Heights); JVC flat -> none; bad-date -> none
    const types = signals.map((s) => s.type).sort();
    expect(types).toEqual(["off_plan_launch", "transaction_spike"]);
    expect(costs).toHaveLength(1);
    expect(costs[0]?.costUsd).toBe(0);
  });

  it("filters by query.since", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new DLDAdapter({ endpoint: "https://api.example/ds", transport });
    const { ctx: c } = ctx();
    const signals = await adapter.fetchSignals({ since: new Date("2027-01-01") }, c);
    expect(signals).toEqual([]);
  });
});
