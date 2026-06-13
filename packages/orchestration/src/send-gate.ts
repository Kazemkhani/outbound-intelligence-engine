import type { Channel } from "@oie/core";

/**
 * The send gate — the absolute, code-level enforcement of brief §3.5 and the
 * addendum §2 requirement that the live-send rail is a CODE check, not a
 * remembered chat instruction. Every send-path call MUST pass through
 * `evaluateSendGate` before touching any provider adapter.
 *
 * Two independent conditions must BOTH hold for a real send:
 *   1. DRY_RUN is off (system-level), and
 *   2. the specific action has been explicitly approved by a human (per-action).
 *
 * They are deliberately separate so that flipping DRY_RUN alone can never cause
 * a send, and an approval can never override DRY_RUN. LinkedIn and WhatsApp
 * carry a third gate: the channel must be explicitly enabled (off by default).
 */

export type ApprovalState = "pending" | "approved" | "rejected";

export interface SendGateInput {
  /** System dry-run flag, sourced from validated env. Defaults true everywhere. */
  dryRun: boolean;
  /** Human approval state for THIS specific action. */
  approval: ApprovalState;
  /** Channel of the pending action. */
  channel: Channel;
  /** Whether the channel is operator-enabled. LinkedIn/WhatsApp are off by default. */
  channelEnabled: boolean;
}

export type SendGateOutcome =
  | "send" // real send permitted
  | "simulate" // DRY_RUN: produce a preview, do not contact provider
  | "blocked_awaiting_approval"
  | "blocked_rejected"
  | "blocked_channel_disabled";

export interface SendGateDecision {
  outcome: SendGateOutcome;
  /** True only when a real provider send is permitted. */
  allowSend: boolean;
  reason: string;
}

const GATED_CHANNELS: Channel[] = ["linkedin", "whatsapp"];

/**
 * Decide what a send-path step may do. Pure and total — every branch returns a
 * decision; there is no implicit "allow".
 */
export function evaluateSendGate(input: SendGateInput): SendGateDecision {
  const { dryRun, approval, channel, channelEnabled } = input;

  // Channel opt-in gate first: LinkedIn/WhatsApp are OFF by default (§6.2).
  if (GATED_CHANNELS.includes(channel) && !channelEnabled) {
    return {
      outcome: "blocked_channel_disabled",
      allowSend: false,
      reason: `${channel} is disabled by default and requires explicit operator opt-in`,
    };
  }

  if (approval === "rejected") {
    return {
      outcome: "blocked_rejected",
      allowSend: false,
      reason: "action was rejected by a human",
    };
  }

  // DRY_RUN always wins: simulate regardless of approval.
  if (dryRun) {
    return {
      outcome: "simulate",
      allowSend: false,
      reason: "DRY_RUN is on — producing a preview, not sending",
    };
  }

  if (approval !== "approved") {
    return {
      outcome: "blocked_awaiting_approval",
      allowSend: false,
      reason: "no human approval for this action",
    };
  }

  return { outcome: "send", allowSend: true, reason: "DRY_RUN off and human-approved" };
}

/** Throwing guard for call sites that must abort on a blocked decision. */
export class SendBlockedError extends Error {
  constructor(public readonly decision: SendGateDecision) {
    super(`send blocked: ${decision.outcome} — ${decision.reason}`);
    this.name = "SendBlockedError";
  }
}

/** Returns true only if a real send is permitted; never throws. */
export function isRealSendAllowed(input: SendGateInput): boolean {
  return evaluateSendGate(input).allowSend;
}
