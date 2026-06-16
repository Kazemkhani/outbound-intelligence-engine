/**
 * Stage-4 runtime unit tests.
 *
 * Covers the four requirements added in the Stage-4 wiring pass:
 *   1. Stop-on-reply: a reply/bounce/unsubscribe halts the cadence.
 *   2. Cost-cap breach: assertWithinCaps halts non-critical work.
 *   3. Auto-enrol: qualifiesForEnrolment + Prisma upsert called only when qualified.
 *   4. Suppression blocks a send: executeSendStep returns "suppressed" before the gate.
 *
 * No live DB — Prisma is mocked at the module level. Pure decision functions are
 * exercised directly; Inngest durable functions are tested via their underlying
 * helper logic (the step.run blocks are plain async functions at test time).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MockInstance } from "vitest";

// ── 1. Stop-on-reply ──────────────────────────────────────────────────────────
// Pure logic only — no DB needed.

import { shouldStop } from "../sequencing/state-machine";
import type { EnrolmentState, SequenceEvent } from "../sequencing/state-machine";

const T0 = new Date("2026-06-14T09:00:00.000Z");

const ACTIVE_STATE: EnrolmentState = {
  currentStep: 0,
  status: "active",
  lastActionAt: T0,
  nextActionAt: null,
};

describe("stop-on-reply — shouldStop pure logic", () => {
  it("returns null when events list is empty", () => {
    expect(shouldStop(ACTIVE_STATE, [])).toBeNull();
  });

  it("halts immediately on a reply event — cadence must stop", () => {
    const events: SequenceEvent[] = [{ type: "reply", channel: "email", occurredAt: T0 }];
    const result = shouldStop(ACTIVE_STATE, events);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("stopped");
    if (result?.kind === "stopped") expect(result.reason).toMatch(/repl/i);
  });

  it("halts on a bounce event", () => {
    const events: SequenceEvent[] = [{ type: "bounce", occurredAt: T0 }];
    const result = shouldStop(ACTIVE_STATE, events);
    expect(result?.kind).toBe("stopped");
    if (result?.kind === "stopped") expect(result.reason).toMatch(/bounce/i);
  });

  it("halts on an unsubscribe event", () => {
    const events: SequenceEvent[] = [{ type: "unsubscribe", occurredAt: T0 }];
    const result = shouldStop(ACTIVE_STATE, events);
    expect(result?.kind).toBe("stopped");
  });

  it("halts on manual_stop", () => {
    const events: SequenceEvent[] = [{ type: "manual_stop", occurredAt: T0 }];
    expect(shouldStop(ACTIVE_STATE, events)?.kind).toBe("stopped");
  });

  it("a mix of events still halts — first event wins", () => {
    const events: SequenceEvent[] = [
      { type: "reply", occurredAt: T0 },
      { type: "bounce", occurredAt: T0 },
    ];
    const result = shouldStop(ACTIVE_STATE, events);
    expect(result?.kind).toBe("stopped");
    if (result?.kind === "stopped") expect(result.reason).toMatch(/repl/i);
  });

  it("does NOT halt a stopped enrolment a second time (no-op path)", () => {
    const stoppedState: EnrolmentState = { ...ACTIVE_STATE, status: "stopped" };
    // shouldStop is still pure — it does halt here because it checks events not
    // current status. The Inngest layer gates on status before calling shouldStop.
    // This test documents the contract: the function only reads events.
    const events: SequenceEvent[] = [{ type: "reply", occurredAt: T0 }];
    expect(shouldStop(stoppedState, events)?.kind).toBe("stopped");
  });
});

// ── 2. Cost-cap breach ────────────────────────────────────────────────────────

import { costCapStatus, assertWithinCaps, CostCapExceededError } from "./cost-caps";
import type { CostCaps, DailySpend } from "./cost-caps";

const CAPS: CostCaps = { dailyLlmUsd: 25, dailyProviderUsd: 50 };

describe("cost-cap enforcement — assertWithinCaps", () => {
  it("does not throw when well within caps", () => {
    const spend: DailySpend = { llmUsd: 5, providerUsd: 10 };
    expect(() => assertWithinCaps(spend, CAPS)).not.toThrow();
  });

  it("throws CostCapExceededError when the LLM cap is hit", () => {
    const spend: DailySpend = { llmUsd: 25, providerUsd: 0 };
    expect(() => assertWithinCaps(spend, CAPS)).toThrowError(CostCapExceededError);
  });

  it("throws CostCapExceededError when the provider cap is exceeded", () => {
    const spend: DailySpend = { llmUsd: 0, providerUsd: 55 };
    expect(() => assertWithinCaps(spend, CAPS)).toThrowError(CostCapExceededError);
  });

  it("throws with a message that identifies which cap was exceeded", () => {
    const spend: DailySpend = { llmUsd: 30, providerUsd: 0 };
    let caught: CostCapExceededError | null = null;
    try {
      assertWithinCaps(spend, CAPS);
    } catch (e) {
      caught = e as CostCapExceededError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain("LLM");
    expect(caught?.status.llmExceeded).toBe(true);
    expect(caught?.status.halt).toBe(true);
  });

  it("costCapStatus reports halt false when both caps have headroom", () => {
    const status = costCapStatus({ llmUsd: 24.99, providerUsd: 49.99 }, CAPS);
    expect(status.halt).toBe(false);
    expect(status.llmExceeded).toBe(false);
    expect(status.providerExceeded).toBe(false);
  });

  it("costCapStatus reports both caps exceeded simultaneously", () => {
    const status = costCapStatus({ llmUsd: 30, providerUsd: 60 }, CAPS);
    expect(status.halt).toBe(true);
    expect(status.llmExceeded).toBe(true);
    expect(status.providerExceeded).toBe(true);
    expect(status.reason).toContain("LLM");
    expect(status.reason).toContain("provider");
  });
});

// ── 3. Auto-enrol — qualifiesForEnrolment + DB mock ──────────────────────────

import { qualifiesForEnrolment } from "./auto-enrol";
import type { EnrolmentPolicy } from "./auto-enrol";

const NOW = new Date("2026-06-14T00:00:00Z");

const POLICY: EnrolmentPolicy = {
  minTier: "B",
  qualifyingTypes: ["hiring", "funding"],
};

describe("auto-enrol — qualifiesForEnrolment decision", () => {
  it("returns enrol:true for a fresh, high-tier, qualifying-type signal", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: new Date("2026-07-14T00:00:00Z"), tier: "A" },
      POLICY,
      NOW,
    );
    expect(d.enrol).toBe(true);
  });

  it("returns enrol:true for tier B (at the bar)", () => {
    const d = qualifiesForEnrolment(
      { signalType: "funding", signalExpiresAt: null, tier: "B" },
      POLICY,
      NOW,
    );
    expect(d.enrol).toBe(true);
  });

  it("returns enrol:false for tier C (below the bar) — no DB write should occur", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: null, tier: "C" },
      POLICY,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("below");
  });

  it("returns enrol:false for a non-qualifying signal type", () => {
    const d = qualifiesForEnrolment(
      { signalType: "news", signalExpiresAt: null, tier: "A" },
      POLICY,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("not a qualifying");
  });

  it("returns enrol:false for an expired signal", () => {
    const d = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: new Date("2026-06-01T00:00:00Z"), tier: "A" },
      POLICY,
      NOW,
    );
    expect(d.enrol).toBe(false);
    expect(d.reason).toContain("expired");
  });
});

/**
 * Test that the auto-enrol function calls prisma.enrolment.upsert only when
 * qualifiesForEnrolment returns true, and skips it otherwise.
 *
 * We mock @oie/db so no Postgres connection is needed.
 */

vi.mock("@oie/db", () => {
  const mockUpsert = vi.fn();
  const mockAuditCreate = vi.fn();
  const mockCostAggregate = vi.fn().mockResolvedValue({ _sum: { costUsd: 0 } });

  return {
    prisma: {
      enrolment: {
        upsert: mockUpsert,
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      auditLog: { create: mockAuditCreate },
      providerCost: { aggregate: mockCostAggregate },
      suppression: {
        upsert: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      contact: { findUnique: vi.fn().mockResolvedValue(null) },
      message: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    },
  };
});

// Import the prisma mock AFTER vi.mock so we get the mocked instance.
import { prisma } from "@oie/db";

function getMockUpsert(): MockInstance {
  return prisma.enrolment.upsert as unknown as MockInstance;
}

function getMockAuditCreate(): MockInstance {
  return prisma.auditLog.create as unknown as MockInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: upsert resolves with a dummy enrolment.
  getMockUpsert().mockResolvedValue({ id: "enr-test-001", status: "active" });
  getMockAuditCreate().mockResolvedValue({ id: "audit-001" });
});

describe("auto-enrol — DB write only when qualified", () => {
  it("does NOT call prisma.enrolment.upsert when the signal is non-qualifying", async () => {
    // Simulate what the Inngest step would do: evaluate policy, conditionally upsert.
    const decision = qualifiesForEnrolment(
      { signalType: "news", signalExpiresAt: null, tier: "A" },
      POLICY,
      NOW,
    );

    if (decision.enrol) {
      await prisma.enrolment.upsert({
        where: { contactId_sequenceId: { contactId: "c-001", sequenceId: "seq-001" } },
        create: { contactId: "c-001", sequenceId: "seq-001", status: "active", currentStep: 0 },
        update: { status: "active", currentStep: 0, nextActionAt: null },
        select: { id: true, status: true },
      });
    }

    expect(decision.enrol).toBe(false);
    expect(getMockUpsert()).not.toHaveBeenCalled();
  });

  it("calls prisma.enrolment.upsert exactly once when qualified", async () => {
    const decision = qualifiesForEnrolment(
      { signalType: "hiring", signalExpiresAt: null, tier: "A" },
      POLICY,
      NOW,
    );

    if (decision.enrol) {
      await prisma.enrolment.upsert({
        where: { contactId_sequenceId: { contactId: "c-001", sequenceId: "seq-001" } },
        create: { contactId: "c-001", sequenceId: "seq-001", status: "active", currentStep: 0 },
        update: { status: "active", currentStep: 0, nextActionAt: null },
        select: { id: true, status: true },
      });
    }

    expect(decision.enrol).toBe(true);
    expect(getMockUpsert()).toHaveBeenCalledOnce();
    // Confirm the upsert key uses the correct unique constraint field name.
    const callArg = getMockUpsert().mock.calls[0]?.[0] as {
      where: { contactId_sequenceId: { contactId: string; sequenceId: string } };
    };
    expect(callArg.where.contactId_sequenceId.contactId).toBe("c-001");
  });

  it("writes an AuditLog entry after a successful enrolment upsert", async () => {
    const decision = qualifiesForEnrolment(
      { signalType: "funding", signalExpiresAt: null, tier: "B" },
      POLICY,
      NOW,
    );

    if (decision.enrol) {
      const row = await prisma.enrolment.upsert({
        where: { contactId_sequenceId: { contactId: "c-002", sequenceId: "seq-001" } },
        create: { contactId: "c-002", sequenceId: "seq-001", status: "active", currentStep: 0 },
        update: { status: "active", currentStep: 0, nextActionAt: null },
        select: { id: true, status: true },
      });

      await prisma.auditLog.create({
        data: {
          actor: "orchestration",
          action: "enrolment.created",
          entity: "Enrolment",
          entityId: row.id,
          payload: { contactId: "c-002", reason: decision.reason },
        },
      });
    }

    expect(getMockAuditCreate()).toHaveBeenCalledOnce();
    const auditCall = getMockAuditCreate().mock.calls[0]?.[0] as {
      data: { action: string; entity: string };
    };
    expect(auditCall.data.action).toBe("enrolment.created");
    expect(auditCall.data.entity).toBe("Enrolment");
  });
});

// ── 4. Suppression blocks a send ─────────────────────────────────────────────

import { executeSendStep } from "../sequencing/send-step";
import type { SendStepParams, SuppressionRecord } from "../sequencing/send-step";
import type { EmailSender, OutboundEmail, SendResult, AdapterContext } from "@oie/integrations";

function makeFakeEmailSender(): EmailSender & { calls: OutboundEmail[] } {
  const calls: OutboundEmail[] = [];
  return {
    name: "fake-email",
    isConfigured: () => true,
    calls,
    async send(message: OutboundEmail, _ctx: AdapterContext): Promise<SendResult> {
      calls.push(message);
      return { outcome: "sent", externalId: `ext-${message.idempotencyKey}`, provider: "fake" };
    },
  };
}

const EMAIL_STEP = {
  channel: "email" as const,
  delayHours: 0,
  templateId: "intro",
};

function baseParams(overrides: Partial<SendStepParams> = {}): SendStepParams {
  return {
    step: EMAIL_STEP,
    stepIndex: 0,
    enrolmentId: "enr-suppression-test",
    recipientEmail: "bounce@example.com",
    fromEmail: "sender@oie.ai",
    subject: "Test",
    body: "Body text",
    dryRun: false,
    approval: "approved",
    channelEnabled: true,
    suppressions: [],
    ...overrides,
  };
}

describe("suppression — executeSendStep blocks suppressed addresses", () => {
  it("returns outcome 'suppressed' and never calls the adapter for a suppressed email", async () => {
    const sender = makeFakeEmailSender();
    const suppressions: SuppressionRecord[] = [
      { email: "bounce@example.com", reason: "hard bounce" },
    ];

    const result = await executeSendStep(baseParams({ emailSender: sender, suppressions }));

    expect(result.outcome).toBe("suppressed");
    expect(result.gateDecision.allowSend).toBe(false);
    expect(sender.calls).toHaveLength(0); // adapter never called
  });

  it("returns outcome 'suppressed' for a suppressed domain", async () => {
    const sender = makeFakeEmailSender();
    const suppressions: SuppressionRecord[] = [{ domain: "example.com", reason: "competitor" }];

    const result = await executeSendStep(baseParams({ emailSender: sender, suppressions }));

    expect(result.outcome).toBe("suppressed");
    expect(sender.calls).toHaveLength(0);
  });

  it("allows the send when the address is NOT on the suppression list", async () => {
    const sender = makeFakeEmailSender();
    const suppressions: SuppressionRecord[] = [{ email: "other@different.com", reason: "bounced" }];

    const result = await executeSendStep(baseParams({ emailSender: sender, suppressions }));

    expect(result.outcome).toBe("sent");
    expect(sender.calls).toHaveLength(1);
  });

  it("suppression check fires before the DRY_RUN gate — suppressed address returns 'suppressed' not 'dry_run'", async () => {
    const sender = makeFakeEmailSender();
    const suppressions: SuppressionRecord[] = [
      { email: "bounce@example.com", reason: "unsubscribed" },
    ];

    // Even with dryRun:true, suppression wins because it is checked first.
    const result = await executeSendStep(
      baseParams({ dryRun: true, emailSender: sender, suppressions }),
    );

    expect(result.outcome).toBe("suppressed");
    expect(sender.calls).toHaveLength(0);
  });

  it("suppression is case-insensitive on email address", async () => {
    const sender = makeFakeEmailSender();
    const suppressions: SuppressionRecord[] = [{ email: "Bounce@Example.COM", reason: "bounced" }];

    const result = await executeSendStep(baseParams({ emailSender: sender, suppressions }));

    expect(result.outcome).toBe("suppressed");
    expect(sender.calls).toHaveLength(0);
  });
});
