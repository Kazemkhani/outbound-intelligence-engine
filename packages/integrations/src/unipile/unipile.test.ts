import { describe, it, expect, vi } from "vitest";
import type { AdapterContext, CostRecord, OutboundMessage } from "../contracts/index";
import { stubTransport } from "../base/http";
import { UnipileAdapter } from "./index";
import { parseUnipileWebhook } from "./index";
import linkedinSendFixture from "./fixtures/linkedinSend.json";
import whatsappSendFixture from "./fixtures/whatsappSend.json";
import inboundWebhookFixture from "./fixtures/inboundWebhook.json";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DSN = "https://api1.unipile.com:13465";
const API_KEY = "test-api-key-seed";

function makeDryCtx(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return {
    ctx: { dryRun: true, recordCost: (c) => costs.push(c) },
    costs,
  };
}

function makeLiveCtx(): { ctx: AdapterContext; costs: CostRecord[] } {
  const costs: CostRecord[] = [];
  return {
    ctx: { dryRun: false, recordCost: (c) => costs.push(c) },
    costs,
  };
}

function makeMessage(
  channel: "linkedin" | "whatsapp",
  overrides: Partial<OutboundMessage> = {},
): OutboundMessage {
  return {
    channel,
    toHandle: channel === "linkedin" ? "layla-hassan-procurement" : "+971501234567",
    body: "Hello — we help jewellers reduce procurement costs by 20%.",
    idempotencyKey: "idem-seed-001",
    ...overrides,
  };
}

// ── isConfigured ─────────────────────────────────────────────────────────────

describe("UnipileAdapter — isConfigured", () => {
  it("returns false when neither apiKey nor dsn is provided", () => {
    const adapter = new UnipileAdapter({ channel: "linkedin" });
    expect(adapter.isConfigured()).toBe(false);
  });

  it("returns false when only apiKey is provided (dsn missing)", () => {
    const adapter = new UnipileAdapter({ channel: "linkedin", apiKey: API_KEY });
    expect(adapter.isConfigured()).toBe(false);
  });

  it("returns false when only dsn is provided (apiKey missing)", () => {
    const adapter = new UnipileAdapter({ channel: "linkedin", dsn: DSN });
    expect(adapter.isConfigured()).toBe(false);
  });

  it("returns true when both apiKey and dsn are present", () => {
    const adapter = new UnipileAdapter({ channel: "linkedin", apiKey: API_KEY, dsn: DSN });
    expect(adapter.isConfigured()).toBe(true);
  });

  it("returns true for whatsapp channel when both credentials are present", () => {
    const adapter = new UnipileAdapter({ channel: "whatsapp", apiKey: API_KEY, dsn: DSN });
    expect(adapter.isConfigured()).toBe(true);
  });
});

// ── channel property ─────────────────────────────────────────────────────────

describe("UnipileAdapter — channel property", () => {
  it("exposes 'linkedin' when constructed with channel:'linkedin'", () => {
    const adapter = new UnipileAdapter({ channel: "linkedin" });
    expect(adapter.channel).toBe("linkedin");
  });

  it("exposes 'whatsapp' when constructed with channel:'whatsapp'", () => {
    const adapter = new UnipileAdapter({ channel: "whatsapp" });
    expect(adapter.channel).toBe("whatsapp");
  });
});

// ── dry-run — LinkedIn ────────────────────────────────────────────────────────

describe("UnipileAdapter — dryRun (linkedin)", () => {
  it("returns outcome:dry_run with ZERO transport calls for linkedin", async () => {
    const transport = stubTransport([]);
    const adapter = new UnipileAdapter({
      channel: "linkedin",
      apiKey: API_KEY,
      dsn: DSN,
      transport,
    });
    const { ctx, costs } = makeDryCtx();
    const message = makeMessage("linkedin");

    const result = await adapter.send(message, ctx);

    expect(result.outcome).toBe("dry_run");
    expect(result.provider).toBe("unipile");
    expect(typeof result.preview).toBe("string");
    expect(result.preview).toContain("layla-hassan-procurement");
    expect(result.preview).toContain("LINKEDIN");
    // Zero transport calls — the dry-run guard fires before any network access.
    expect(transport.calls).toHaveLength(0);
    // Cost must NOT be recorded on a dry run.
    expect(costs).toHaveLength(0);
  });

  it("dry-run still works even when adapter is not configured (linkedin)", async () => {
    const transport = stubTransport([]);
    // No apiKey or dsn — deliberately not configured.
    const adapter = new UnipileAdapter({ channel: "linkedin", transport });
    const { ctx } = makeDryCtx();

    const result = await adapter.send(makeMessage("linkedin"), ctx);

    expect(result.outcome).toBe("dry_run");
    expect(transport.calls).toHaveLength(0);
  });
});

// ── dry-run — WhatsApp ────────────────────────────────────────────────────────

describe("UnipileAdapter — dryRun (whatsapp)", () => {
  it("returns outcome:dry_run with ZERO transport calls for whatsapp", async () => {
    const transport = stubTransport([]);
    const adapter = new UnipileAdapter({
      channel: "whatsapp",
      apiKey: API_KEY,
      dsn: DSN,
      transport,
    });
    const { ctx, costs } = makeDryCtx();
    const message = makeMessage("whatsapp");

    const result = await adapter.send(message, ctx);

    expect(result.outcome).toBe("dry_run");
    expect(result.provider).toBe("unipile");
    expect(result.preview).toContain("WHATSAPP");
    expect(result.preview).toContain("+971501234567");
    expect(transport.calls).toHaveLength(0);
    expect(costs).toHaveLength(0);
  });

  it("dry-run still works even when adapter is not configured (whatsapp)", async () => {
    const transport = stubTransport([]);
    const adapter = new UnipileAdapter({ channel: "whatsapp", transport });
    const { ctx } = makeDryCtx();

    const result = await adapter.send(makeMessage("whatsapp"), ctx);

    expect(result.outcome).toBe("dry_run");
    expect(transport.calls).toHaveLength(0);
  });
});

// ── live send — LinkedIn ──────────────────────────────────────────────────────

describe("UnipileAdapter — live send (linkedin)", () => {
  it("POSTs to the linkedin endpoint and returns outcome:sent", async () => {
    const transport = stubTransport([{ body: linkedinSendFixture }]);
    const adapter = new UnipileAdapter({
      channel: "linkedin",
      apiKey: API_KEY,
      dsn: DSN,
      transport,
    });
    const { ctx, costs } = makeLiveCtx();
    const message = makeMessage("linkedin");

    const result = await adapter.send(message, ctx);

    expect(result.outcome).toBe("sent");
    expect(result.provider).toBe("unipile");
    expect(result.externalId).toBe("msg_li_seed_001");

    // Exactly one POST was made.
    expect(transport.calls).toHaveLength(1);
    const call = transport.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${DSN}/api/v1/chats/messages`);

    // Auth header must be present and correct.
    expect(call.headers?.["X-API-KEY"]).toBe(API_KEY);

    // Idempotency key forwarded as a header.
    expect(call.headers?.["X-Idempotency-Key"]).toBe("idem-seed-001");

    // Body targets linkedin account_type.
    const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    expect(body["account_type"]).toBe("LINKEDIN");
    expect(body["recipient_identifier"]).toBe("layla-hassan-procurement");
    expect(body["text"]).toContain("jewellers");

    // Cost recorded exactly once.
    expect(costs).toHaveLength(1);
    expect(costs[0]?.provider).toBe("unipile");
    expect(costs[0]?.task).toBe("send_linkedin");
    expect(costs[0]?.costUsd).toBeGreaterThan(0);
  });
});

// ── live send — WhatsApp ──────────────────────────────────────────────────────

describe("UnipileAdapter — live send (whatsapp)", () => {
  it("POSTs to the whatsapp endpoint and returns outcome:sent", async () => {
    const transport = stubTransport([{ body: whatsappSendFixture }]);
    const adapter = new UnipileAdapter({
      channel: "whatsapp",
      apiKey: API_KEY,
      dsn: DSN,
      transport,
    });
    const { ctx, costs } = makeLiveCtx();
    const message = makeMessage("whatsapp");

    const result = await adapter.send(message, ctx);

    expect(result.outcome).toBe("sent");
    expect(result.externalId).toBe("msg_wa_seed_001");

    const call = transport.calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${DSN}/api/v1/chats/messages`);
    expect(call.headers?.["X-API-KEY"]).toBe(API_KEY);

    const body = JSON.parse(call.body ?? "{}") as Record<string, unknown>;
    expect(body["account_type"]).toBe("WHATSAPP");
    expect(body["recipient_identifier"]).toBe("+971501234567");

    expect(costs[0]?.task).toBe("send_whatsapp");
  });
});

// ── 429 retry behaviour ───────────────────────────────────────────────────────

describe("UnipileAdapter — retry on 429", () => {
  it("retries on a 429 and succeeds on the second attempt", async () => {
    const transport = stubTransport([
      { status: 429, body: { error: "rate_limit_exceeded" } },
      { body: linkedinSendFixture },
    ]);
    const adapter = new UnipileAdapter({
      channel: "linkedin",
      apiKey: API_KEY,
      dsn: DSN,
      transport,
    });
    const { ctx } = makeLiveCtx();

    const result = await adapter.send(
      makeMessage("linkedin"),
      // Inject instant sleep so the test doesn't actually wait for backoff.
      { ...ctx },
    );

    expect(result.outcome).toBe("sent");
    // Two transport calls: first 429, then the successful retry.
    expect(transport.calls).toHaveLength(2);
  });
});

// ── parseUnipileWebhook ───────────────────────────────────────────────────────

describe("parseUnipileWebhook", () => {
  it("maps an inbound linkedin message fixture to ParsedWebhookMessage", () => {
    const parsed = parseUnipileWebhook(inboundWebhookFixture);

    expect(parsed.type).toBe("message");
    expect(parsed.channel).toBe("linkedin");
    expect(parsed.fromHandle).toBe("layla-hassan-procurement");
    expect(parsed.body).toContain("interested in learning more");
    expect(parsed.externalId).toBe("msg_inbound_seed_001");
    expect(parsed.at).toBeInstanceOf(Date);
    expect(parsed.at.getFullYear()).toBe(2026);
  });

  it("maps event 'message.reply' to type:'reply'", () => {
    const replyPayload = {
      ...inboundWebhookFixture,
      event: "message.reply",
    };
    const parsed = parseUnipileWebhook(replyPayload);
    expect(parsed.type).toBe("reply");
  });

  it("maps WHATSAPP provider to channel:'whatsapp'", () => {
    const waPayload = {
      ...inboundWebhookFixture,
      provider: "WHATSAPP",
    };
    const parsed = parseUnipileWebhook(waPayload);
    expect(parsed.channel).toBe("whatsapp");
  });

  it("throws a Zod error for a non-object payload", () => {
    expect(() => parseUnipileWebhook("not-an-object")).toThrow();
    expect(() => parseUnipileWebhook(null)).toThrow();
    expect(() => parseUnipileWebhook(42)).toThrow();
  });

  it("throws when a required field is missing from the message sub-object", () => {
    const bad = {
      event: "message.received",
      provider: "LINKEDIN",
      message: {
        // `id` is required but missing
        sender_identifier: "someone",
        text: "hello",
        received_at: "2026-06-14T10:00:00.000Z",
      },
    };
    expect(() => parseUnipileWebhook(bad)).toThrow();
  });

  it("throws when provider is not LINKEDIN or WHATSAPP", () => {
    const unknownProvider = {
      ...inboundWebhookFixture,
      provider: "TELEGRAM",
    };
    expect(() => parseUnipileWebhook(unknownProvider)).toThrow(/unknown provider/);
  });
});

// ── auth header absent when not configured ────────────────────────────────────

describe("UnipileAdapter — auth header on live send", () => {
  it("forwards X-API-KEY on every live request", async () => {
    const transport = stubTransport([{ body: linkedinSendFixture }]);
    const adapter = new UnipileAdapter({
      channel: "linkedin",
      apiKey: "super-secret-key",
      dsn: DSN,
      transport,
    });
    const { ctx } = makeLiveCtx();
    await adapter.send(makeMessage("linkedin"), ctx);
    expect(transport.calls[0]?.headers?.["X-API-KEY"]).toBe("super-secret-key");
  });
});

// ── spy: zero transport calls on dry-run (explicit assertion via mock) ────────

describe("UnipileAdapter — transport never called on dryRun (spy variant)", () => {
  it("transport.request is never invoked when dryRun:true", async () => {
    const mockRequest = vi.fn();
    const mockTransport = { request: mockRequest };
    const adapter = new UnipileAdapter({
      channel: "linkedin",
      apiKey: API_KEY,
      dsn: DSN,
      transport: mockTransport,
    });
    const { ctx } = makeDryCtx();
    await adapter.send(makeMessage("linkedin"), ctx);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
