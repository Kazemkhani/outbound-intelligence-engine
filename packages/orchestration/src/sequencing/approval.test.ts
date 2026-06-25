import { describe, it, expect } from "vitest";
import { SEND_APPROVED_EVENT, approvalFromEvent } from "./approval";
import { evaluateSendGate } from "../send-gate";

describe("approvalFromEvent", () => {
  it("maps an approved event to 'approved'", () => {
    expect(approvalFromEvent({ data: { enrolmentId: "e1", approved: true } })).toBe("approved");
  });

  it("maps a not-approved event to 'rejected'", () => {
    expect(approvalFromEvent({ data: { enrolmentId: "e1", approved: false } })).toBe("rejected");
  });

  it("falls back to pending on a timeout (null event), so it can never send", () => {
    expect(approvalFromEvent(null)).toBe("pending");
    expect(approvalFromEvent(undefined, "pending")).toBe("pending");
  });

  it("uses the provided fallback when there is no event", () => {
    expect(approvalFromEvent(null, "rejected")).toBe("rejected");
  });

  it("exposes the Close Room approval event name", () => {
    expect(SEND_APPROVED_EVENT).toBe("oie/send.approved");
  });
});

describe("durable send-gate: resume NEVER bypasses DRY_RUN", () => {
  it("DRY_RUN on + approval resumed as 'approved' still yields simulate (no send)", () => {
    const decision = evaluateSendGate({
      dryRun: true,
      approval: approvalFromEvent({ data: { enrolmentId: "e1", approved: true } }),
      channel: "email",
      channelEnabled: true,
    });
    expect(decision.outcome).toBe("simulate");
    expect(decision.allowSend).toBe(false);
  });

  it("a real send happens only when DRY_RUN is off AND the event approved it", () => {
    const decision = evaluateSendGate({
      dryRun: false,
      approval: approvalFromEvent({ data: { enrolmentId: "e1", approved: true } }),
      channel: "email",
      channelEnabled: true,
    });
    expect(decision.outcome).toBe("send");
    expect(decision.allowSend).toBe(true);
  });

  it("a rejection event blocks the send even with DRY_RUN off", () => {
    const decision = evaluateSendGate({
      dryRun: false,
      approval: approvalFromEvent({ data: { enrolmentId: "e1", approved: false } }),
      channel: "email",
      channelEnabled: true,
    });
    expect(decision.allowSend).toBe(false);
    expect(decision.outcome).toBe("blocked_rejected");
  });

  it("a timed-out approval (DRY_RUN off) blocks awaiting approval, never sends", () => {
    const decision = evaluateSendGate({
      dryRun: false,
      approval: approvalFromEvent(null),
      channel: "email",
      channelEnabled: true,
    });
    expect(decision.allowSend).toBe(false);
    expect(decision.outcome).toBe("blocked_awaiting_approval");
  });
});
