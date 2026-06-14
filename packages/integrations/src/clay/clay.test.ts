import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { ClayAdapter, parseClayWebhook } from "./index";
import inboundRow from "./fixtures/inboundRow.json";

function ctxWithCosts(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: true, recordCost: (c) => costs.push(c) }, costs };
}

const WEBHOOK = "https://api.clay.com/v3/sources/webhook/seed-table";

describe("ClayAdapter", () => {
  it("is not configured without a webhook URL", () => {
    expect(new ClayAdapter().isConfigured()).toBe(false);
    expect(new ClayAdapter({ webhookUrl: WEBHOOK }).isConfigured()).toBe(true);
  });

  it("enrichCompany POSTs the query to the webhook with an idempotency key and returns matched:false (enqueued)", async () => {
    const transport = stubTransport([{ body: { ok: true } }]);
    const adapter = new ClayAdapter({ webhookUrl: WEBHOOK, transport });
    const { ctx } = ctxWithCosts();

    const result = await adapter.enrichCompany(
      { domain: "alnoorjewellery.ae", name: "Al Noor Jewellery LLC" },
      ctx,
    );

    // Async/push-based: nothing comes back synchronously, the row is enqueued.
    expect(result.matched).toBe(false);
    expect(result.data).toBeNull();
    expect(result.provider).toBe("clay");

    // The waterfall was triggered by a POST to the webhook with the query body.
    const call = transport.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(WEBHOOK);
    const body = JSON.parse(call.body ?? "{}");
    expect(typeof body.idempotencyKey).toBe("string");
    expect(body.idempotencyKey.length).toBeGreaterThan(0);
    expect(body.domain).toBe("alnoorjewellery.ae");
    expect(body.name).toBe("Al Noor Jewellery LLC");
  });

  it("honours an explicit ctx.idempotencyKey on the enqueued row", async () => {
    const transport = stubTransport([{ body: { ok: true } }]);
    const adapter = new ClayAdapter({ webhookUrl: WEBHOOK, transport });
    const ctx: AdapterContext = { dryRun: true, idempotencyKey: "fixed-key-123" };
    await adapter.enrichContact({ email: "layla.hassan@alnoorjewellery.ae" }, ctx);
    const body = JSON.parse(transport.calls[0]!.body ?? "{}");
    expect(body.idempotencyKey).toBe("fixed-key-123");
  });

  it("enrichCompany is a no-op when not configured (no POST)", async () => {
    const transport = stubTransport([]);
    const adapter = new ClayAdapter({ transport });
    const { ctx } = ctxWithCosts();
    const result = await adapter.enrichCompany({ name: "Anything" }, ctx);
    expect(result.matched).toBe(false);
    expect(transport.calls.length).toBe(0);
  });

  it("parseClayWebhook maps an inbound row into NormalisedCompany + NormalisedContact", () => {
    const { company, contact } = parseClayWebhook(inboundRow);

    expect(company).toBeDefined();
    expect(company!.domain).toBe("alnoorjewellery.ae"); // normalised from the URL
    expect(company!.name).toBe("Al Noor Jewellery LLC");
    expect(company!.industry).toBe("Luxury Goods & Jewelry");
    expect(company!.employeeCount).toBe(85);
    expect(company!.sources?.domain).toBe("clay"); // provenance recorded

    expect(contact).toBeDefined();
    expect(contact!.fullName).toBe("Layla Hassan");
    expect(contact!.companyDomain).toBe("alnoorjewellery.ae");
    expect(contact!.title).toBe("Director of Procurement");
    expect(contact!.seniority).toBe("director"); // inferred from the title
    expect(contact!.email).toBe("layla.hassan@alnoorjewellery.ae");
    expect(contact!.linkedinUrl).toContain("linkedin.com");
    expect(contact!.sources?.email).toBe("clay");
  });

  it("parseClayWebhook rejects a malformed inbound payload (zod)", () => {
    expect(() => parseClayWebhook("not-an-object")).toThrow();
    expect(() => parseClayWebhook(null)).toThrow();
    expect(() => parseClayWebhook(42)).toThrow();
  });

  it("parseClayWebhook returns no entities for a row with no recognised columns", () => {
    const result = parseClayWebhook({ Unrelated: "value", another_col: 7 });
    expect(result.company).toBeUndefined();
    expect(result.contact).toBeUndefined();
  });
});
