import { z } from "zod";

/**
 * Unipile API response and webhook schemas — validated at the boundary with Zod
 * so vendor shapes never leak beyond this file (brief §2.4, §10.2).
 *
 * Unipile docs: https://developer.unipile.com/reference
 * Provider maps `LINKEDIN` → channel 'linkedin' and `WHATSAPP` → channel 'whatsapp'.
 */

// ── Outbound send response ───────────────────────────────────────────────────

/**
 * Response body returned by both Unipile send endpoints.
 * The field names match the Unipile v1 API.
 */
export const unipileSendResponse = z.object({
  object: z.string(),
  /** Unipile-issued message identifier — exposed as `externalId` in SendResult. */
  message_id: z.string(),
  account_id: z.string().optional(),
  tracking_id: z.string().optional(),
  conversation_id: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().optional(),
  sent_at: z.string().optional(),
});

export type UnipileSendResponse = z.infer<typeof unipileSendResponse>;

// ── Inbound webhook ──────────────────────────────────────────────────────────

const unipileWebhookMessage = z.object({
  id: z.string(),
  conversation_id: z.string().optional(),
  /** The sender's handle: a LinkedIn slug, phone number, or Unipile identifier. */
  sender_identifier: z.string(),
  text: z.string(),
  received_at: z.string(),
});

/**
 * Raw inbound Unipile webhook payload.
 * `event` is either `"message.received"` (a new inbound message from a prospect)
 * or `"message.reply"` (a reply to an outbound thread). Both feed the unified
 * reply-sync / stop-on-reply mechanism (Phase 8).
 */
export const unipileWebhookPayload = z.object({
  event: z.string(),
  account_id: z.string().optional(),
  /** `"LINKEDIN"` or `"WHATSAPP"` — mapped to unified channel name below. */
  provider: z.string(),
  message: unipileWebhookMessage,
});

export type UnipileWebhookPayload = z.infer<typeof unipileWebhookPayload>;

/** Unified inbound-message shape written to the reply-sync store. */
export interface ParsedWebhookMessage {
  type: "reply" | "message";
  channel: "linkedin" | "whatsapp";
  fromHandle: string;
  body: string;
  externalId: string;
  at: Date;
}

/**
 * Map Unipile provider string to our unified channel name.
 * Throws with a descriptive message for any unknown provider so callers can
 * reject the webhook rather than silently accepting junk.
 */
function mapProvider(provider: string): "linkedin" | "whatsapp" {
  const upper = provider.toUpperCase();
  if (upper === "LINKEDIN") return "linkedin";
  if (upper === "WHATSAPP") return "whatsapp";
  throw new Error(`unipile: unknown provider "${provider}" in webhook payload`);
}

/**
 * Validate a raw inbound Unipile webhook payload (via Zod) and translate it
 * into the unified ParsedWebhookMessage shape. The result feeds the reply-sync
 * mechanism and the stop-on-reply rule (Phase 8). Throws on schema violations or
 * an unrecognised `provider` value — the webhook handler must reject, not swallow.
 */
export function parseUnipileWebhook(payload: unknown): ParsedWebhookMessage {
  const parsed = unipileWebhookPayload.parse(payload);

  const eventLower = parsed.event.toLowerCase();
  const type: "reply" | "message" = eventLower.includes("reply") ? "reply" : "message";

  return {
    type,
    channel: mapProvider(parsed.provider),
    fromHandle: parsed.message.sender_identifier,
    body: parsed.message.text,
    externalId: parsed.message.id,
    at: new Date(parsed.message.received_at),
  };
}
