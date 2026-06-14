import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { ExaAdapter } from "./index";
import fixture from "./fixtures/search.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<AdapterContext>): {
  ctx: AdapterContext;
  costs: CostRecord[];
} {
  const costs: CostRecord[] = [];
  return {
    ctx: {
      dryRun: false,
      recordCost: (c) => costs.push(c),
      ...overrides,
    },
    costs,
  };
}

// ── Configuration ─────────────────────────────────────────────────────────────

describe("ExaAdapter.isConfigured", () => {
  it("returns false when no API key is provided", () => {
    expect(new ExaAdapter().isConfigured()).toBe(false);
  });

  it("returns false for a blank API key", () => {
    expect(new ExaAdapter({ apiKey: "   " }).isConfigured()).toBe(false);
  });

  it("returns true when an API key is present", () => {
    expect(new ExaAdapter({ apiKey: "exa_test_key" }).isConfigured()).toBe(true);
  });
});

// ── fetchSignals happy path ───────────────────────────────────────────────────

describe("ExaAdapter.fetchSignals", () => {
  it("returns an empty array when companyDomain is absent", async () => {
    const transport = stubTransport([]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();
    const signals = await adapter.fetchSignals({}, ctx);
    expect(signals).toHaveLength(0);
    expect(transport.calls).toHaveLength(0);
  });

  it("maps fixture results to NormalisedSignal[]", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    // Fixture has 4 results; 1 has no publishedDate and must be skipped → 3 signals.
    expect(signals).toHaveLength(3);
  });

  it("sets provider to 'exa' and type to 'news' on every signal", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    for (const signal of signals) {
      expect(signal.provider).toBe("exa");
      expect(signal.type).toBe("news");
    }
  });

  it("normalises companyDomain on every signal", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    // Pass the domain with a protocol prefix — normaliseDomain must strip it.
    const signals = await adapter.fetchSignals({ companyDomain: "https://www.stripe.com" }, ctx);

    for (const signal of signals) {
      expect(signal.companyDomain).toBe("stripe.com");
    }
  });

  it("sets sourceUrl from the result url", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    expect(signals[0]?.sourceUrl).toBe("https://techcrunch.com/2024/03/15/stripe-hiring-surge");
  });

  it("clamps strength to [0, 1] from Exa score", async () => {
    const overScore = {
      results: [
        {
          id: "over",
          url: "https://example.com/over",
          title: "Over score",
          publishedDate: "2024-01-01T00:00:00.000Z",
          score: 1.8, // above ceiling
          text: "test",
        },
        {
          id: "neg",
          url: "https://example.com/neg",
          title: "Negative score",
          publishedDate: "2024-01-02T00:00:00.000Z",
          score: -0.3, // below floor (defensive guard)
          text: "test",
        },
      ],
    };
    const transport = stubTransport([{ body: overScore }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "example.com" }, ctx);

    expect(signals).toHaveLength(2);
    expect(signals[0]?.strength).toBe(1);
    expect(signals[1]?.strength).toBe(0);
  });

  it("strength for a normal score is within [0, 1]", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    for (const signal of signals) {
      expect(signal.strength).toBeGreaterThanOrEqual(0);
      expect(signal.strength).toBeLessThanOrEqual(1);
    }
  });

  it("skips results that lack publishedDate — does not fabricate a date", async () => {
    // Fixture result[3] has no publishedDate; all others have one → 3 signals.
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    // Confirm none of the signals originate from the date-less fixture entry.
    const urls = signals.map((s) => s.sourceUrl);
    expect(urls).not.toContain("https://www.bloomberg.com/news/articles/stripe-no-date");
    expect(signals).toHaveLength(3);
  });

  it("sets detectedAt to the parsed publishedDate", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    expect(signals[0]?.detectedAt).toEqual(new Date("2024-03-15T09:00:00.000Z"));
    expect(signals[1]?.detectedAt).toEqual(new Date("2024-02-10T14:30:00.000Z"));
  });

  it("does not set expiresAt (left for the orchestration core)", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    for (const signal of signals) {
      expect(signal.expiresAt).toBeUndefined();
    }
  });

  it("populates evidence with title, author and excerpt", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);
    const first = signals[0]!;

    expect(first.evidence?.["title"]).toBe(
      "Stripe Expands Engineering Headcount Ahead of IPO Push",
    );
    expect(first.evidence?.["author"]).toBe("Ingrid Lunden");
    expect(typeof first.evidence?.["excerpt"]).toBe("string");
    // excerpt must be at most 280 characters
    const excerpt = first.evidence?.["excerpt"] as string;
    expect(excerpt.length).toBeLessThanOrEqual(280);
  });

  it("omits author from evidence when it is null in the fixture", async () => {
    // fixture[2] has author: null
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);
    // Third result (index 2) is the one with author: null
    const third = signals[2]!;
    expect("author" in (third.evidence ?? {})).toBe(false);
  });

  it("records one cost entry per search call", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx, costs } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    expect(costs).toHaveLength(1);
    expect(costs[0]?.provider).toBe("exa");
    expect(costs[0]?.task).toBe("search");
    expect(costs[0]?.costUsd).toBeGreaterThan(0);
  });

  it("sends the x-api-key auth header", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "secret_key_123", transport });
    const { ctx } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    expect(transport.calls[0]?.headers?.["x-api-key"]).toBe("secret_key_123");
  });

  it("sends POST to the Exa search endpoint", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    expect(transport.calls[0]?.method).toBe("POST");
    expect(transport.calls[0]?.url).toBe("https://api.exa.ai/search");
  });

  it("includes the company domain in the request body query", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    const body = JSON.parse(transport.calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body["type"]).toBe("neural");
    expect(typeof body["query"]).toBe("string");
    expect((body["query"] as string).toLowerCase()).toContain("stripe.com");
  });

  it("includes startPublishedDate when query.since is provided", async () => {
    const transport = stubTransport([{ body: fixture }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();
    const since = new Date("2024-01-01T00:00:00.000Z");

    await adapter.fetchSignals({ companyDomain: "stripe.com", since }, ctx);

    const body = JSON.parse(transport.calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body["startPublishedDate"]).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns an empty array when Exa returns no results", async () => {
    const transport = stubTransport([{ body: { results: [] } }]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "unknown.example" }, ctx);

    expect(signals).toHaveLength(0);
  });

  // ── Rate-limit / retry ─────────────────────────────────────────────────────

  it("retries on 429 and recovers with the second response", async () => {
    const transport = stubTransport([
      { status: 429, body: { error: "rate_limited" } },
      { body: fixture },
    ]);
    // Inject instant sleep so the test does not actually wait for backoff.
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    const signals = await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

    // Recovered after the retry — three signals from the fixture.
    expect(signals).toHaveLength(3);
    expect(transport.calls).toHaveLength(2);
  });

  it("throws an AdapterError with kind rate_limit on 429 exhaustion", async () => {
    // Four 429s will exhaust the default 3-retry budget (1 attempt + 3 retries).
    const transport = stubTransport([
      { status: 429, body: {} },
      { status: 429, body: {} },
      { status: 429, body: {} },
      { status: 429, body: {} },
    ]);
    const adapter = new ExaAdapter({ apiKey: "k", transport });
    const { ctx } = makeCtx();

    await expect(adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx)).rejects.toMatchObject({
      kind: "rate_limit",
    });
  });

  it("throws an AdapterError with kind auth on 401", async () => {
    const transport = stubTransport([{ status: 401, body: { error: "unauthorized" } }]);
    const adapter = new ExaAdapter({ apiKey: "bad", transport });
    const { ctx } = makeCtx();

    // A 401 is non-retryable — one attempt, typed error, kind = "auth".
    await expect(adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx)).rejects.toMatchObject({
      kind: "auth",
    });
  });
});
