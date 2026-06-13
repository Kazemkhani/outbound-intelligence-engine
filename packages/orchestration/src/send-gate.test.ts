import { describe, it, expect } from "vitest";
import { evaluateSendGate, isRealSendAllowed, type SendGateInput } from "./send-gate";

const base: SendGateInput = {
  dryRun: true,
  approval: "pending",
  channel: "email",
  channelEnabled: true,
};

describe("evaluateSendGate", () => {
  it("simulates while DRY_RUN is on, even if approved", () => {
    const d = evaluateSendGate({ ...base, dryRun: true, approval: "approved" });
    expect(d.outcome).toBe("simulate");
    expect(d.allowSend).toBe(false);
  });

  it("permits a real send ONLY when DRY_RUN off AND approved", () => {
    const d = evaluateSendGate({ ...base, dryRun: false, approval: "approved" });
    expect(d.outcome).toBe("send");
    expect(d.allowSend).toBe(true);
  });

  it("blocks a real send when DRY_RUN off but not approved", () => {
    const d = evaluateSendGate({ ...base, dryRun: false, approval: "pending" });
    expect(d.outcome).toBe("blocked_awaiting_approval");
    expect(d.allowSend).toBe(false);
  });

  it("blocks a rejected action outright", () => {
    const d = evaluateSendGate({ ...base, dryRun: false, approval: "rejected" });
    expect(d.outcome).toBe("blocked_rejected");
    expect(d.allowSend).toBe(false);
  });

  it("blocks LinkedIn/WhatsApp when the channel is not enabled", () => {
    for (const channel of ["linkedin", "whatsapp"] as const) {
      const d = evaluateSendGate({
        ...base,
        dryRun: false,
        approval: "approved",
        channel,
        channelEnabled: false,
      });
      expect(d.outcome).toBe("blocked_channel_disabled");
      expect(d.allowSend).toBe(false);
    }
  });

  it("allows an enabled, approved, live LinkedIn send", () => {
    const d = evaluateSendGate({
      dryRun: false,
      approval: "approved",
      channel: "linkedin",
      channelEnabled: true,
    });
    expect(d.allowSend).toBe(true);
  });

  it("the default posture (DRY_RUN on, pending) never sends", () => {
    expect(isRealSendAllowed(base)).toBe(false);
  });
});
