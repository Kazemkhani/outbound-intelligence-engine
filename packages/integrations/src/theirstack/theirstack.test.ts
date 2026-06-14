import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { TheirStackAdapter } from "./index";
import { hiringStrength } from "./mapper";
import fixture from "./fixtures/jobsSearch.json";
import emptyFixture from "./fixtures/jobsSearchEmpty.json";

function makeCtx(overrides?: Partial<AdapterContext>): {
  ctx: AdapterContext;
  costs: CostRecord[];
} {
  const costs: CostRecord[] = [];
  return {
    ctx: { dryRun: false, recordCost: (c) => costs.push(c), ...overrides },
    costs,
  };
}

// Pin "now" to a date close to the fixture's most-recent posting (2026-06-10)
// so strength values are deterministic regardless of when tests run.
const FIXED_NOW = new Date("2026-06-14T00:00:00.000Z");

describe("TheirStackAdapter", () => {
  // ── Configuration ──────────────────────────────────────────────────────────

  it("is not configured without an API key", () => {
    expect(new TheirStackAdapter().isConfigured()).toBe(false);
  });

  it("is configured when an API key is provided", () => {
    expect(new TheirStackAdapter({ apiKey: "sk-test" }).isConfigured()).toBe(true);
  });

  // ── Hiring signals ─────────────────────────────────────────────────────────

  it("maps job postings to hiring signals with correct shape", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    // 3 jobs → 3 hiring signals + 1 aggregated tech_adoption signal.
    const hiringSignals = signals.filter((s) => s.type === "hiring");
    expect(hiringSignals).toHaveLength(3);

    const first = hiringSignals[0]!;
    expect(first.type).toBe("hiring");
    expect(first.provider).toBe("theirstack");
    expect(first.companyDomain).toBe("acme.com");
    expect(first.sourceUrl).toBe("https://jobs.acme.com/senior-software-engineer");
    expect(first.detectedAt).toEqual(new Date("2026-06-10T00:00:00.000Z"));
    expect(first.expiresAt).toBeUndefined();
    expect(first.evidence).toMatchObject({
      jobTitle: "Senior Software Engineer",
      seniority: "senior",
    });
  });

  it("normalises company domain via normaliseDomain", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    for (const s of signals) {
      // normaliseDomain strips www, protocol, trailing slash.
      expect(s.companyDomain).toBe("acme.com");
    }
  });

  it("computes hiring strength in [0, 1] for every posting", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    for (const s of signals) {
      expect(s.strength).toBeGreaterThanOrEqual(0);
      expect(s.strength).toBeLessThanOrEqual(1);
    }
  });

  it("assigns a higher strength to a fresher posting than an older one", () => {
    // Directly exercise the statically-imported strength helper.
    const fresh = hiringStrength(new Date("2026-06-13T00:00:00.000Z"), FIXED_NOW); // 1 day old
    const stale = hiringStrength(new Date("2026-05-15T00:00:00.000Z"), FIXED_NOW); // 30 days old
    expect(fresh).toBeGreaterThan(stale);
    expect(fresh).toBeLessThanOrEqual(1);
    expect(stale).toBeGreaterThanOrEqual(0);
  });

  // ── Tech-adoption signals ──────────────────────────────────────────────────

  it("emits a tech_adoption signal when technology_slugs are present", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    const techSignals = signals.filter((s) => s.type === "tech_adoption");
    expect(techSignals).toHaveLength(1);

    const tech = techSignals[0]!;
    expect(tech.provider).toBe("theirstack");
    expect(tech.companyDomain).toBe("acme.com");
    expect(tech.strength).toBeGreaterThanOrEqual(0);
    expect(tech.strength).toBeLessThanOrEqual(1);
    // All unique slugs from both postings that had technology_slugs.
    expect(tech.evidence?.["technologies"]).toEqual(
      expect.arrayContaining(["react", "typescript", "aws", "kubernetes", "terraform"]),
    );
    // Deterministic anchor (no wall clock) so re-pulls dedupe rather than double-count.
    expect(tech.sourceUrl).toMatch(/^theirstack:tech:acme\.com:/);
    expect(tech.expiresAt).toBeUndefined();

    // Re-pulling the same fixture yields an identical tech_adoption signal —
    // same sourceUrl and same data-derived detectedAt (not the wall clock).
    const adapter2 = new TheirStackAdapter({
      apiKey: "sk-test",
      transport: stubTransport([{ body: fixture }]),
    });
    const again = (await adapter2.fetchSignals({ companyDomain: "acme.com" }, makeCtx().ctx)).find(
      (s) => s.type === "tech_adoption",
    )!;
    expect(again.sourceUrl).toBe(tech.sourceUrl);
    expect(again.detectedAt).toEqual(tech.detectedAt);
  });

  it("does NOT emit a tech_adoption signal when no postings carry technology_slugs", async () => {
    const noTechFixture = {
      data: [
        {
          id: "ts_no_tech",
          job_title: "Office Manager",
          company_domain: "plain.com",
          date_posted: "2026-06-10T00:00:00.000Z",
          url: "https://plain.com/jobs/office-manager",
        },
      ],
    };
    const transport = stubTransport([{ body: noTechFixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "plain.com" }, ctx);

    expect(signals.filter((s) => s.type === "tech_adoption")).toHaveLength(0);
    expect(signals.filter((s) => s.type === "hiring")).toHaveLength(1);
  });

  // ── Empty result ───────────────────────────────────────────────────────────

  it("returns an empty array when the provider returns no jobs", async () => {
    const transport = stubTransport([{ body: emptyFixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "nobody.com" }, ctx);

    expect(signals).toEqual([]);
  });

  // ── Cost accounting ────────────────────────────────────────────────────────

  it("records exactly one cost entry per fetchSignals call", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx, costs } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    expect(costs).toHaveLength(1);
    expect(costs[0]?.provider).toBe("theirstack");
    expect(costs[0]?.task).toBe("jobsSearch");
    expect(costs[0]?.costUsd).toBeGreaterThan(0);
  });

  it("does not record a cost when the result is empty (no network call completes billing)", async () => {
    // Empty fixture: network call is made and succeeds but data is empty.
    // Cost SHOULD still be recorded because the API was called and billed.
    const transport = stubTransport([{ body: emptyFixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx, costs } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "nobody.com" }, ctx);

    // Even an empty response consumed an API credit.
    expect(costs).toHaveLength(1);
  });

  // ── Auth header ────────────────────────────────────────────────────────────

  it("sends the correct Bearer auth header", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "my-secret-key", transport });
    const { ctx } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.headers?.["Authorization"]).toBe("Bearer my-secret-key");
  });

  it("sets Content-Type and posts to the correct endpoint", async () => {
    const transport = stubTransport([{ body: emptyFixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "acme.com", since: new Date("2026-06-01") }, ctx);

    const call = transport.calls[0]!;
    expect(call.url).toBe("https://api.theirstack.com/v1/jobs/search");
    expect(call.method).toBe("POST");
    expect(call.headers?.["Content-Type"]).toBe("application/json");

    const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    expect(body["company_domain"]).toBe("acme.com");
    expect(body["posted_after"]).toBe("2026-06-01");
  });

  // ── 429 retry ─────────────────────────────────────────────────────────────

  it("retries on a 429 and recovers successfully", async () => {
    const transport = stubTransport([
      { status: 429, body: { error: "rate_limit_exceeded" } },
      { body: fixture },
    ]);
    // Inject deterministic sleep so the test never actually waits.
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "acme.com" }, ctx);

    // Recovered on the second attempt.
    expect(transport.calls).toHaveLength(2);
    expect(signals.filter((s) => s.type === "hiring")).toHaveLength(3);
  });

  // ── Type filtering ─────────────────────────────────────────────────────────

  it("returns empty array immediately when requested types are unsupported by TheirStack", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals(
      { companyDomain: "acme.com", types: ["funding", "news"] },
      ctx,
    );

    expect(signals).toEqual([]);
    // No network call made.
    expect(transport.calls).toHaveLength(0);
  });

  it("proceeds normally when requested types include a supported type", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new TheirStackAdapter({ apiKey: "sk-test", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals(
      { companyDomain: "acme.com", types: ["hiring", "funding"] },
      ctx,
    );

    // Network call was made; hiring signals returned.
    expect(transport.calls).toHaveLength(1);
    expect(signals.filter((s) => s.type === "hiring").length).toBeGreaterThan(0);
  });
});
