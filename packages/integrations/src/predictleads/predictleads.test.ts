import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { PredictLeadsAdapter } from "./index";
import fixture from "./fixtures/companyEvents.json";
import emptyFixture from "./fixtures/companyEventsEmpty.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: false, recordCost: (c) => costs.push(c) }, costs };
}

const TEST_DOMAIN = "acme.com";

describe("PredictLeadsAdapter", () => {
  describe("isConfigured()", () => {
    it("is not configured when both credentials are absent", () => {
      expect(new PredictLeadsAdapter().isConfigured()).toBe(false);
    });

    it("is not configured when only apiKey is provided", () => {
      expect(new PredictLeadsAdapter({ apiKey: "key-abc" }).isConfigured()).toBe(false);
    });

    it("is not configured when only apiToken is provided", () => {
      expect(new PredictLeadsAdapter({ apiToken: "tok-xyz" }).isConfigured()).toBe(false);
    });

    it("is configured when both apiKey and apiToken are present", () => {
      expect(
        new PredictLeadsAdapter({ apiKey: "key-abc", apiToken: "tok-xyz" }).isConfigured(),
      ).toBe(true);
    });
  });

  describe("fetchSignals()", () => {
    it("returns an empty array when companyDomain is absent", async () => {
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport: stubTransport([]),
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({}, ctx);
      expect(signals).toHaveLength(0);
    });

    it("returns an empty array for an empty events response", async () => {
      const transport = stubTransport([{ body: emptyFixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx, costs } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);
      expect(signals).toHaveLength(0);
      // Cost is still recorded even when there are no events.
      expect(costs).toHaveLength(1);
    });

    it("maps a mixed events fixture to the correct SignalTypes", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      // Fixture has 8 events; all should be returned.
      expect(signals).toHaveLength(8);

      // funding_round → funding
      const fundingRound = signals.find((s) => s.evidence?.["category"] === "funding_round");
      expect(fundingRound?.type).toBe("funding");
      expect(fundingRound?.strength).toBe(0.9);

      // acquisition → funding
      const acquisition = signals.find((s) => s.evidence?.["category"] === "acquisition");
      expect(acquisition?.type).toBe("funding");
      expect(acquisition?.strength).toBe(0.8);

      // job_opening → hiring
      const hiring = signals.find((s) => s.evidence?.["category"] === "job_opening");
      expect(hiring?.type).toBe("hiring");
      expect(hiring?.strength).toBe(0.7);

      // executive_change → job_change
      const jobChange = signals.find((s) => s.evidence?.["category"] === "executive_change");
      expect(jobChange?.type).toBe("job_change");
      expect(jobChange?.strength).toBe(0.8);

      // uses_technology → tech_adoption
      const techAdoption = signals.find((s) => s.evidence?.["category"] === "uses_technology");
      expect(techAdoption?.type).toBe("tech_adoption");
      expect(techAdoption?.strength).toBe(0.6);

      // news → news
      const news = signals.find((s) => s.evidence?.["category"] === "news");
      expect(news?.type).toBe("news");
      expect(news?.strength).toBe(0.4);

      // expansion → news
      const expansion = signals.find((s) => s.evidence?.["category"] === "expansion");
      expect(expansion?.type).toBe("news");
      expect(expansion?.strength).toBe(0.4);

      // customer_win → news
      const customerWin = signals.find((s) => s.evidence?.["category"] === "customer_win");
      expect(customerWin?.type).toBe("news");
      expect(customerWin?.strength).toBe(0.4);
    });

    it("sets detectedAt correctly from found_at", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      const fundingSignal = signals.find((s) => s.evidence?.["category"] === "funding_round");
      expect(fundingSignal?.detectedAt).toBeInstanceOf(Date);
      expect(fundingSignal?.detectedAt.toISOString()).toBe("2024-03-15T10:30:00.000Z");
    });

    it("strength is within the [0, 1] range for all mapped signals", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      for (const signal of signals) {
        expect(signal.strength).toBeGreaterThanOrEqual(0);
        expect(signal.strength).toBeLessThanOrEqual(1);
      }
    });

    it("normalises companyDomain on every signal", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      // Pass a domain with scheme and trailing slash to exercise normaliseDomain.
      const signals = await adapter.fetchSignals({ companyDomain: "https://www.acme.com/" }, ctx);
      for (const signal of signals) {
        expect(signal.companyDomain).toBe("acme.com");
      }
    });

    it("sends both Api-Key and Api-Token headers on every request", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      expect(transport.calls).toHaveLength(1);
      expect(transport.calls[0]?.headers?.["Api-Key"]).toBe("key-abc");
      expect(transport.calls[0]?.headers?.["Api-Token"]).toBe("tok-xyz");
    });

    it("hits the correct REST endpoint for the given domain", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      await adapter.fetchSignals({ companyDomain: "stripe.com" }, ctx);

      expect(transport.calls[0]?.url).toBe(
        "https://predictleads.com/api/v3/companies/stripe.com/events",
      );
      expect(transport.calls[0]?.method).toBe("GET");
    });

    it("records one cost entry per fetchSignals call", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx, costs } = ctxWithCosts();
      await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      expect(costs).toHaveLength(1);
      expect(costs[0]?.provider).toBe("predictleads");
      expect(costs[0]?.task).toBe("companyEvents");
      expect(costs[0]?.units).toBe(1);
      expect(costs[0]?.costUsd).toBeGreaterThan(0);
    });

    it("maps a 429 onto a retryable rate_limit error and recovers on retry", async () => {
      const transport = stubTransport([
        { status: 429, body: { errors: [{ detail: "rate limit exceeded" }] } },
        { body: fixture },
      ]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx, costs } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      // Recovered after retry — full fixture result returned.
      expect(signals).toHaveLength(8);
      expect(transport.calls.length).toBe(2);
      expect(costs).toHaveLength(1);
    });

    it("sets provider to 'predictleads' on every signal", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      for (const signal of signals) {
        expect(signal.provider).toBe("predictleads");
      }
    });

    it("sets sourceUrl from news_article_url when present, null otherwise", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      // funding_round has a news_article_url in the fixture.
      const withUrl = signals.find((s) => s.evidence?.["category"] === "funding_round");
      expect(withUrl?.sourceUrl).toBe("https://techcrunch.com/2024/03/15/acme-series-b");

      // job_opening has no news_article_url in the fixture.
      const withoutUrl = signals.find((s) => s.evidence?.["category"] === "job_opening");
      expect(withoutUrl?.sourceUrl).toBeNull();
    });

    it("does not set expiresAt (assigned centrally by the orchestration decay layer)", async () => {
      const transport = stubTransport([{ body: fixture }]);
      const adapter = new PredictLeadsAdapter({
        apiKey: "key-abc",
        apiToken: "tok-xyz",
        transport,
      });
      const { ctx } = ctxWithCosts();
      const signals = await adapter.fetchSignals({ companyDomain: TEST_DOMAIN }, ctx);

      for (const signal of signals) {
        expect(signal.expiresAt).toBeUndefined();
      }
    });
  });
});
