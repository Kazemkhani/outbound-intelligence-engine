import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord } from "../contracts/index";
import { stubTransport } from "../base/http";
import { SmartleadAdapter } from "./index";
import sendEmailFixture from "./fixtures/sendEmail.json";
import createCampaignFixture from "./fixtures/createCampaign.json";
import addMailboxFixture from "./fixtures/addMailbox.json";
import addLeadsFixture from "./fixtures/addLeads.json";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<AdapterContext> = {}): {
  ctx: AdapterContext;
  costs: CostRecord[];
} {
  const costs: CostRecord[] = [];
  return {
    ctx: { dryRun: false, recordCost: (c) => costs.push(c), ...overrides },
    costs,
  };
}

const baseMessage = {
  to: "buyer@example.ae",
  from: "outreach@oie.ai",
  subject: "Partnership opportunity",
  body: "Hi there — quick note about our offer.",
  campaignId: "1842",
  idempotencyKey: ["fixture", "idempotency", "key"].join("-"),
} as const;

// ── isConfigured ──────────────────────────────────────────────────────────────

describe("SmartleadAdapter.isConfigured", () => {
  it("returns false when no API key is supplied", () => {
    expect(new SmartleadAdapter().isConfigured()).toBe(false);
  });

  it("returns true when an API key is present", () => {
    expect(new SmartleadAdapter({ apiKey: "sl-key-xyz" }).isConfigured()).toBe(true);
  });

  it("returns false for a blank/whitespace-only key", () => {
    expect(new SmartleadAdapter({ apiKey: "   " }).isConfigured()).toBe(false);
  });
});

// ── dry-run guarantee ─────────────────────────────────────────────────────────

describe("SmartleadAdapter.send — dry-run", () => {
  it("returns outcome:dry_run and makes ZERO transport calls", async () => {
    // The transport queue is intentionally empty — any call to it would
    // exhaust the queue, triggering an error or returning a stub 200 with {}.
    // We assert calls.length === 0 to prove the network was never touched.
    const transport = stubTransport([]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx, costs } = makeCtx({ dryRun: true });

    const result = await adapter.send(baseMessage, ctx);

    expect(result.outcome).toBe("dry_run");
    expect(result.provider).toBe("smartlead");
    expect(result.preview).toBe("Partnership opportunity -> buyer@example.ae");

    // THE KEY ASSERTION: the transport was never called.
    expect(transport.calls.length).toBe(0);

    // Cost must not be recorded on a dry run.
    expect(costs.length).toBe(0);
  });

  it("returns a dry_run preview even when the adapter is not configured", async () => {
    // A misconfigured adapter must still honour dryRun — it should not throw
    // because of a missing key when dryRun is true.
    const transport = stubTransport([]);
    const adapter = new SmartleadAdapter({ transport }); // no apiKey
    const { ctx } = makeCtx({ dryRun: true });

    const result = await adapter.send(baseMessage, ctx);

    expect(result.outcome).toBe("dry_run");
    expect(transport.calls.length).toBe(0);
  });
});

// ── real send ─────────────────────────────────────────────────────────────────

describe("SmartleadAdapter.send — live (dryRun: false)", () => {
  it("POSTs to the correct endpoint and returns outcome:sent with externalId", async () => {
    const transport = stubTransport([{ body: sendEmailFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx({ dryRun: false });

    const result = await adapter.send(baseMessage, ctx);

    expect(result.outcome).toBe("sent");
    expect(result.provider).toBe("smartlead");
    expect(result.externalId).toBe("el_7f3a9c2b4d1e6f8a0b5c2d3e4f5a6b7c");

    // Exactly one HTTP call made.
    expect(transport.calls.length).toBe(1);

    const call = transport.calls[0]!;
    // Endpoint must include the campaign ID and api_key.
    expect(call.url).toContain("/campaigns/1842/leads/send-email");
    expect(call.url).toContain("api_key=sl-key");
    expect(call.method).toBe("POST");
  });

  it("includes the idempotencyKey in the request header and body", async () => {
    const transport = stubTransport([{ body: sendEmailFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx({ dryRun: false });

    await adapter.send(baseMessage, ctx);

    const call = transport.calls[0]!;
    // Header
    expect(call.headers?.["X-Idempotency-Key"]).toBe(baseMessage.idempotencyKey);
    // Body field
    const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    expect(body["client_reference_id"]).toBe(baseMessage.idempotencyKey);
  });

  it("records cost exactly once on a real send", async () => {
    const transport = stubTransport([{ body: sendEmailFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx, costs } = makeCtx({ dryRun: false });

    await adapter.send(baseMessage, ctx);

    expect(costs.length).toBe(1);
    expect(costs[0]!.provider).toBe("smartlead");
    expect(costs[0]!.task).toBe("send-email");
    expect(costs[0]!.costUsd).toBeGreaterThan(0);
  });

  it("retries on a 429 and recovers", async () => {
    const transport = stubTransport([
      { status: 429, body: { error: "too many requests" } },
      { body: sendEmailFixture },
    ]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx({ dryRun: false });

    const result = await adapter.send(baseMessage, ctx);

    expect(result.outcome).toBe("sent");
    expect(transport.calls.length).toBe(2); // first attempt (429) + one retry
  });

  it("propagates a non-retryable 401 as an AdapterError", async () => {
    const transport = stubTransport([{ status: 401, body: { error: "unauthorised" } }]);
    const adapter = new SmartleadAdapter({ apiKey: "bad-key", transport });
    const { ctx } = makeCtx({ dryRun: false });

    await expect(adapter.send(baseMessage, ctx)).rejects.toMatchObject({
      kind: "auth",
      provider: "smartlead",
    });
  });

  it("throws synchronously when campaignId is absent (live mode)", async () => {
    const transport = stubTransport([]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx({ dryRun: false });
    const msgWithoutCampaign = { ...baseMessage, campaignId: undefined };

    await expect(adapter.send(msgWithoutCampaign, ctx)).rejects.toThrow(
      /send\(\) requires message\.campaignId/,
    );
    expect(transport.calls.length).toBe(0);
  });
});

// ── campaign-management helpers ───────────────────────────────────────────────

describe("SmartleadAdapter.createCampaign", () => {
  it("POSTs to /campaigns and returns a Zod-validated response", async () => {
    const transport = stubTransport([{ body: createCampaignFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx();

    const campaign = await adapter.createCampaign("OIE — Q2 UAE Outbound", ctx);

    expect(campaign.id).toBe(1842);
    expect(campaign.name).toBe("OIE — Q2 UAE Outbound");
    expect(campaign.status).toBe("DRAFTED");
    expect(transport.calls[0]!.url).toContain("/campaigns");
    expect(transport.calls[0]!.url).toContain("api_key=sl-key");
  });
});

describe("SmartleadAdapter.addMailbox", () => {
  it("POSTs to /campaigns/{id}/email-accounts and returns validated response", async () => {
    const transport = stubTransport([{ body: addMailboxFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx();

    const result = await adapter.addMailbox(1842, 9001, ctx);

    expect(result.ok).toBe(true);
    expect(result.campaign_id).toBe(1842);
    expect(result.email_account_id).toBe(9001);
    expect(transport.calls[0]!.url).toContain("/campaigns/1842/email-accounts");
  });
});

describe("SmartleadAdapter.addLeadsToCampaign", () => {
  it("POSTs lead list to /campaigns/{id}/leads and returns upload summary", async () => {
    const transport = stubTransport([{ body: addLeadsFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx();

    const result = await adapter.addLeadsToCampaign(
      1842,
      [{ email: "buyer@example.ae", first_name: "Hassan", last_name: "Al Rashid" }],
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.upload_count).toBe(1);
    expect(result.lead_import_count).toBe(1);

    const body = JSON.parse(transport.calls[0]!.body ?? "{}") as Record<string, unknown>;
    const leadList = body["lead_list"] as Array<Record<string, unknown>>;
    expect(leadList[0]!["email"]).toBe("buyer@example.ae");
  });
});

describe("SmartleadAdapter compliance (CAN-SPAM / GDPR)", () => {
  it("emits one-click unsubscribe headers and an opt-out footer on a live send", async () => {
    const transport = stubTransport([{ body: sendEmailFixture }]);
    const adapter = new SmartleadAdapter({ apiKey: "sl-key", transport });
    const { ctx } = makeCtx({ dryRun: false });

    await adapter.send(
      {
        ...baseMessage,
        listUnsubscribe: "https://oie.ai/u/abc123",
        senderIdentity: { name: "Example Company LLC", physicalAddress: "Dubai, UAE" },
      },
      ctx,
    );

    const call = transport.calls[0]!;
    expect(call.headers?.["List-Unsubscribe"]).toBe("<https://oie.ai/u/abc123>");
    expect(call.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const sentBody = JSON.parse(call.body ?? "{}") as { body: string };
    expect(sentBody.body).toContain("Example Company LLC, Dubai, UAE");
    expect(sentBody.body).toContain("Unsubscribe: https://oie.ai/u/abc123");
  });
});
