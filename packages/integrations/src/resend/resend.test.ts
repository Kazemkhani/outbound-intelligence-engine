import { describe, it, expect } from "vitest";
import type { AdapterContext, CostRecord, OutboundEmail } from "../contracts/index";
import { stubTransport } from "../base/http";
import { ResendAdapter } from "./index";
import sendFixture from "./fixtures/sendEmail.json";

function makeCtx(overrides: Partial<AdapterContext> = {}): {
  ctx: AdapterContext;
  costs: CostRecord[];
} {
  const costs: CostRecord[] = [];
  return { ctx: { dryRun: false, recordCost: (c) => costs.push(c), ...overrides }, costs };
}

const baseMessage: OutboundEmail = {
  to: "buyer@example.ae",
  from: "outreach@oie.ai",
  subject: "Partnership opportunity",
  body: "Hi there — quick note about our offer.",
  idempotencyKey: "idem-resend-123",
};

describe("ResendAdapter.isConfigured", () => {
  it("reflects key presence", () => {
    expect(new ResendAdapter().isConfigured()).toBe(false);
    expect(new ResendAdapter({ apiKey: "re_test" }).isConfigured()).toBe(true);
    expect(new ResendAdapter({ apiKey: "  " }).isConfigured()).toBe(false);
  });
});

describe("ResendAdapter.send — dry-run", () => {
  it("returns dry_run with ZERO transport calls and no cost", async () => {
    const transport = stubTransport([]);
    const adapter = new ResendAdapter({ apiKey: "re_test", transport });
    const { ctx, costs } = makeCtx({ dryRun: true });
    const r = await adapter.send(baseMessage, ctx);
    expect(r.outcome).toBe("dry_run");
    expect(r.preview).toBe("Partnership opportunity -> buyer@example.ae");
    expect(transport.calls.length).toBe(0);
    expect(costs.length).toBe(0);
  });
});

describe("ResendAdapter.send — live", () => {
  it("POSTs to Resend with the Bearer key + idempotency header and returns sent", async () => {
    const transport = stubTransport([{ body: sendFixture }]);
    const adapter = new ResendAdapter({ apiKey: "re_test", transport });
    const { ctx, costs } = makeCtx({ dryRun: false });
    const r = await adapter.send(baseMessage, ctx);

    expect(r.outcome).toBe("sent");
    expect(r.externalId).toBe("4ef9a417-02e9-4d39-ad75-9611e0fcc33c");
    const call = transport.calls[0]!;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.headers?.["Authorization"]).toBe("Bearer re_test");
    expect(call.headers?.["Idempotency-Key"]).toBe("idem-resend-123");
    const sent = JSON.parse(call.body ?? "{}") as { to: string[]; subject: string };
    expect(sent.to).toEqual(["buyer@example.ae"]);
    expect(costs.length).toBe(1);
  });

  it("emits compliance headers + footer when provided", async () => {
    const transport = stubTransport([{ body: sendFixture }]);
    const adapter = new ResendAdapter({ apiKey: "re_test", transport });
    const { ctx } = makeCtx({ dryRun: false });
    await adapter.send(
      {
        ...baseMessage,
        listUnsubscribe: "https://oie.ai/u/abc",
        senderIdentity: { name: "Example Company LLC", physicalAddress: "Dubai, UAE" },
      },
      ctx,
    );
    const call = transport.calls[0]!;
    expect(call.headers?.["List-Unsubscribe"]).toBe("<https://oie.ai/u/abc>");
    const sent = JSON.parse(call.body ?? "{}") as { text: string };
    expect(sent.text).toContain("Example Company LLC, Dubai, UAE");
    expect(sent.text).toContain("Unsubscribe: https://oie.ai/u/abc");
  });

  it("retries on a 429 then recovers", async () => {
    const transport = stubTransport([
      { status: 429, body: { message: "rate" } },
      { body: sendFixture },
    ]);
    const adapter = new ResendAdapter({ apiKey: "re_test", transport });
    const { ctx } = makeCtx({ dryRun: false });
    const r = await adapter.send(baseMessage, ctx);
    expect(r.outcome).toBe("sent");
    expect(transport.calls.length).toBe(2);
  });

  it("maps a 401 to a typed auth error", async () => {
    const transport = stubTransport([{ status: 401, body: { message: "unauthorised" } }]);
    const adapter = new ResendAdapter({ apiKey: "bad", transport });
    const { ctx } = makeCtx({ dryRun: false });
    await expect(adapter.send(baseMessage, ctx)).rejects.toMatchObject({
      kind: "auth",
      provider: "resend",
    });
  });
});
