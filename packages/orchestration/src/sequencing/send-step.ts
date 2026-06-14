import type { Channel } from "@oie/core";
import type {
  AdapterContext,
  EmailSender,
  MessagingChannel,
  OutboundEmail,
  OutboundMessage,
  SendResult,
} from "@oie/integrations";
import { evaluateSendGate, type ApprovalState, type SendGateDecision } from "../send-gate";
import type { SequenceStep } from "./state-machine";

/**
 * The send-step execution layer (brief §11 Phase 7, §3.5).
 *
 * This is the ONLY place in the sequencing engine that may call an adapter's
 * `.send()` method, and it does so only when `evaluateSendGate` returns
 * `allowSend: true`. The gate is evaluated unconditionally on every call,
 * including replays — idempotency is enforced at the adapter level via
 * `idempotencyKey`, so a re-run of this step is always safe.
 *
 * Layered enforcement (outermost wins):
 *   1. Channel-disabled gate  — LinkedIn/WhatsApp off by default.
 *   2. Suppression check       — skip suppressed email addresses / domains.
 *   3. DRY_RUN gate            — always simulates when on, regardless of approval.
 *   4. Approval gate           — must be "approved" for a real send.
 *
 * Nothing here reaches a provider when any gate blocks.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuppressionRecord {
  email?: string | null;
  domain?: string | null;
  reason: string;
}

export interface SendStepParams {
  /** The sequence step definition being executed. */
  step: SequenceStep;
  /** Zero-based index of this step in the sequence (used in idempotency key). */
  stepIndex: number;
  /** The enrolment ID (used in idempotency key and audit). */
  enrolmentId: string;

  /** Recipient email address (required when channel is "email"). */
  recipientEmail?: string;
  /** Recipient social handle (required when channel is "linkedin" or "whatsapp"). */
  recipientHandle?: string;
  /** Sender email address (required when channel is "email"). */
  fromEmail?: string;

  /** Pre-rendered subject line (template resolution happens above this layer). */
  subject?: string;
  /** Pre-rendered message body. */
  body: string;

  /** System-wide dry-run flag. Defaults true — must be explicitly false to live-send. */
  dryRun: boolean;
  /** Human approval state for this specific action. */
  approval: ApprovalState;
  /** Whether the channel is operator-enabled (LinkedIn/WhatsApp are off by default). */
  channelEnabled: boolean;

  /** Suppression list snapshot for this send attempt. */
  suppressions: SuppressionRecord[];

  /** The email sender adapter. Required when channel is "email". */
  emailSender?: EmailSender;
  /** The messaging channel adapter. Required when channel is "linkedin"|"whatsapp". */
  messagingChannel?: MessagingChannel;

  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

/** The outcome of a single send-step execution. */
export type SendStepOutcome =
  | "sent"
  | "dry_run"
  | "awaiting_approval"
  | "rejected"
  | "suppressed"
  | "channel_disabled"
  | "skipped_idempotent";

export interface SendStepResult {
  outcome: SendStepOutcome;
  /** The idempotency key used for this action — stable across replays. */
  idempotencyKey: string;
  /**
   * The logical message record to persist (status maps to MessageStatus).
   * Always present so the caller can write to the AuditLog regardless of outcome.
   */
  message: PendingMessage;
  /** The adapter result, when a real or simulated send was attempted. */
  sendResult?: SendResult;
  /** The gate decision — always present for audit purposes. */
  gateDecision: SendGateDecision;
  reason: string;
}

/**
 * A message record ready to be written to the DB `Message` table.
 * Status is expressed in the DB enum vocabulary so the caller can persist
 * without translation.
 */
export interface PendingMessage {
  enrolmentId: string;
  channel: Channel;
  templateId: string;
  body: string;
  idempotencyKey: string;
  /** Maps directly to the DB MessageStatus enum. */
  status: "queued" | "awaiting_approval" | "sent" | "failed";
}

// ── Idempotency key ───────────────────────────────────────────────────────────

/**
 * Build a stable idempotency key for a send-step execution.
 *
 * The key encodes all the dimensions that make a send action unique:
 * enrolment, step position, and channel. A re-run of the same Inngest step
 * will produce the identical key, which the adapter uses to detect a
 * duplicate and return the original result without re-sending.
 */
export function buildIdempotencyKey(
  enrolmentId: string,
  stepIndex: number,
  channel: Channel,
): string {
  return `enrolment:${enrolmentId}:step:${stepIndex}:channel:${channel}`;
}

// ── Suppression check ─────────────────────────────────────────────────────────

function isSuppressionMatch(
  suppressions: SuppressionRecord[],
  email: string | undefined,
  channel: Channel,
): { suppressed: boolean; reason?: string } {
  if (channel !== "email" || !email) return { suppressed: false };

  const domain = email.split("@")[1];

  for (const record of suppressions) {
    if (record.email && record.email.toLowerCase() === email.toLowerCase()) {
      return { suppressed: true, reason: record.reason };
    }
    if (record.domain && domain && record.domain.toLowerCase() === domain.toLowerCase()) {
      return { suppressed: true, reason: record.reason };
    }
  }

  return { suppressed: false };
}

// ── Main execution function ───────────────────────────────────────────────────

/**
 * Execute a single cadence send-step.
 *
 * Call order (every gate checked in sequence, outer gates win):
 *   1. Suppression list check.
 *   2. `evaluateSendGate` — DRY_RUN, approval, channel-enabled.
 *   3. Adapter `.send()` — ONLY if `decision.allowSend` is true.
 *
 * Idempotency: the `idempotencyKey` is computed deterministically from
 * (enrolmentId, stepIndex, channel) and passed to the adapter. Replaying this
 * function with the same inputs must be a no-op at the provider level.
 */
export async function executeSendStep(params: SendStepParams): Promise<SendStepResult> {
  const {
    step,
    stepIndex,
    enrolmentId,
    recipientEmail,
    recipientHandle,
    fromEmail,
    subject,
    body,
    dryRun,
    approval,
    channelEnabled,
    suppressions,
    emailSender,
    messagingChannel,
    signal,
  } = params;

  const idempotencyKey = buildIdempotencyKey(enrolmentId, stepIndex, step.channel);

  // ── 1. Suppression check ─────────────────────────────────────────────────
  const suppressionCheck = isSuppressionMatch(suppressions, recipientEmail, step.channel);
  if (suppressionCheck.suppressed) {
    const message: PendingMessage = {
      enrolmentId,
      channel: step.channel,
      templateId: step.templateId,
      body,
      idempotencyKey,
      status: "failed",
    };
    const gateDecision: SendGateDecision = {
      outcome: "blocked_channel_disabled",
      allowSend: false,
      reason: `suppressed: ${suppressionCheck.reason ?? "no reason given"}`,
    };
    return {
      outcome: "suppressed",
      idempotencyKey,
      message,
      gateDecision,
      reason: `recipient is on the suppression list: ${suppressionCheck.reason ?? "no reason given"}`,
    };
  }

  // ── 2. Send gate (DRY_RUN, approval, channel-enabled) ────────────────────
  const gateDecision = evaluateSendGate({
    dryRun,
    approval,
    channel: step.channel,
    channelEnabled,
  });

  if (!gateDecision.allowSend) {
    const outcome = gateOutcomeToStepOutcome(gateDecision.outcome);
    const messageStatus = pendingMessageStatus(gateDecision.outcome);

    const message: PendingMessage = {
      enrolmentId,
      channel: step.channel,
      templateId: step.templateId,
      body,
      idempotencyKey,
      status: messageStatus,
    };

    return {
      outcome,
      idempotencyKey,
      message,
      gateDecision,
      reason: gateDecision.reason,
    };
  }

  // ── 3. Real send — gate permitted it ─────────────────────────────────────
  const ctx: AdapterContext = {
    dryRun: false, // gate already confirmed dryRun is off
    idempotencyKey,
    signal,
  };

  let sendResult: SendResult;

  if (step.channel === "email") {
    if (!emailSender) {
      throw new TypeError("executeSendStep: emailSender is required for channel 'email'");
    }
    if (!recipientEmail) {
      throw new TypeError("executeSendStep: recipientEmail is required for channel 'email'");
    }
    if (!fromEmail) {
      throw new TypeError("executeSendStep: fromEmail is required for channel 'email'");
    }

    const outbound: OutboundEmail = {
      to: recipientEmail,
      from: fromEmail,
      subject: subject ?? `(no subject — templateId: ${step.templateId})`,
      body,
      idempotencyKey,
    };

    sendResult = await emailSender.send(outbound, ctx);
  } else {
    // linkedin | whatsapp
    if (!messagingChannel) {
      throw new TypeError(
        `executeSendStep: messagingChannel is required for channel '${step.channel}'`,
      );
    }
    if (!recipientHandle) {
      throw new TypeError(
        `executeSendStep: recipientHandle is required for channel '${step.channel}'`,
      );
    }

    const outbound: OutboundMessage = {
      channel: step.channel as Extract<typeof step.channel, "linkedin" | "whatsapp">,
      toHandle: recipientHandle,
      body,
      idempotencyKey,
    };

    sendResult = await messagingChannel.send(outbound, ctx);
  }

  const message: PendingMessage = {
    enrolmentId,
    channel: step.channel,
    templateId: step.templateId,
    body,
    idempotencyKey,
    status: "sent",
  };

  return {
    outcome: "sent",
    idempotencyKey,
    message,
    sendResult,
    gateDecision,
    reason: "send permitted by gate and dispatched to adapter",
  };
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function gateOutcomeToStepOutcome(outcome: SendGateDecision["outcome"]): SendStepOutcome {
  switch (outcome) {
    case "simulate":
      return "dry_run";
    case "blocked_awaiting_approval":
      return "awaiting_approval";
    case "blocked_rejected":
      return "rejected";
    case "blocked_channel_disabled":
      return "channel_disabled";
    case "send":
      // Should never reach here — gate allowed send.
      return "sent";
  }
}

function pendingMessageStatus(outcome: SendGateDecision["outcome"]): PendingMessage["status"] {
  switch (outcome) {
    case "simulate":
      return "awaiting_approval"; // dry-run previews sit in the approval queue
    case "blocked_awaiting_approval":
      return "awaiting_approval";
    case "blocked_rejected":
      return "failed";
    case "blocked_channel_disabled":
      return "failed";
    case "send":
      return "sent";
  }
}
