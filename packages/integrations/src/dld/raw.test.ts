import { describe, it, expect } from "vitest";
import { aggregateTransactions, rawTransactionsToSignals } from "./raw";
import fixture from "./fixtures/raw-transactions.json";

const ROWS = fixture.rows;
// Matches the fixture's window note: current = 2026-05-26..06-25, prior = 04-26..05-25.
const NOW = new Date("2026-06-25T00:00:00.000Z");

describe("aggregateTransactions", () => {
  it("counts current vs prior period sales per area and ignores undated/out-of-window/mortgage rows", () => {
    const records = aggregateTransactions(ROWS, { now: NOW, periodDays: 30 });

    const businessBay = records.find((r) => r.area === "Business Bay" && !r.projectLaunch);
    expect(businessBay).toBeDefined();
    expect(businessBay?.transactionCount).toBe(3); // 06-10, 06-12, 06-18
    expect(businessBay?.priorPeriodCount).toBe(1); // 05-02

    // JVC only has a prior-window sale (cur=0) -> no record emitted.
    expect(records.find((r) => r.area === "Jumeirah Village Circle")).toBeUndefined();
    // Out-of-window (Old Area, March) and undated (Garbage Area) rows are dropped.
    expect(records.find((r) => r.area === "Old Area")).toBeUndefined();
    expect(records.find((r) => r.area === "Garbage Area")).toBeUndefined();
  });

  it("flags an off-plan launch for a project with off-plan sales now and none prior", () => {
    const records = aggregateTransactions(ROWS, { now: NOW, periodDays: 30 });
    const launch = records.find((r) => r.projectLaunch === true);
    expect(launch).toBeDefined();
    expect(launch?.projectName).toBe("Marina Vista Tower 2");
    expect(launch?.area).toBe("Dubai Marina");
  });

  it("is deterministic for a fixed now", () => {
    const a = aggregateTransactions(ROWS, { now: NOW, periodDays: 30 });
    const b = aggregateTransactions(ROWS, { now: NOW, periodDays: 30 });
    expect(b).toEqual(a);
  });
});

describe("rawTransactionsToSignals", () => {
  it("produces a Business Bay transaction_spike and a Marina Vista off_plan_launch", () => {
    const signals = rawTransactionsToSignals(ROWS, { now: NOW, periodDays: 30 });

    const spike = signals.find((s) => s.type === "transaction_spike");
    expect(spike).toBeDefined();
    expect(spike?.provider).toBe("dld");
    expect(spike?.evidence?.area).toBe("Business Bay");
    expect(spike?.strength).toBeCloseTo(1, 5); // ratio 3x saturates strength to 1

    const launch = signals.find((s) => s.type === "off_plan_launch");
    expect(launch).toBeDefined();
    expect(launch?.strength).toBeCloseTo(0.8, 5);
    expect(launch?.evidence?.projectName).toBe("Marina Vista Tower 2");

    expect(signals).toHaveLength(2);
  });
});
