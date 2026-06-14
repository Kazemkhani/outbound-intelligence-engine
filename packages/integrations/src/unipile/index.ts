import type {
  AdapterContext,
  MessagingChannel,
  OutboundMessage,
  SendResult,
} from "../contracts/index";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { unipileSendResponse } from "./mapper";

export { parseUnipileWebhook } from "./mapper";
export type { ParsedWebhookMessage } from "./mapper";

/**
 * Unipile API endpoints (v1).
 * Docs: https://developer.unipile.com/reference
 *
 * LinkedIn messages are sent via the Messaging API (/api/v1/chats/messages).
 * WhatsApp messages are sent via the same endpoint but with a different account
 * type — Unipile disambiguates by the `account_id` bound to the channel.
 *
 * We keep separate path constants for documentation clarity and to allow
 * independent evolution if Unipile introduces channel-specific path prefixes.
 */
const LINKEDIN_SEND_PATH = "/api/v1/chats/messages";
const WHATSAPP_SEND_PATH = "/api/v1/chats/messages";

/** Indicative Unipile per-message cost in USD; operator-tunable. */
const COST_PER_SEND_USD = 0.001;

export interface UnipileAdapterOptions {
  /** Unipile API key — passed as `X-API-KEY` header. */
  apiKey?: string;
  /**
   * Unipile DSN (base URL), e.g. `https://api1.unipile.com:13465`.
   * Obtain from the Unipile dashboard under Settings → API Keys.
   */
  dsn?: string;
  /** Which messaging rail this adapter instance drives. */
  channel: "linkedin" | "whatsapp";
  /** Injectable HTTP transport — defaults to global fetch. Tests inject a stub. */
  transport?: HttpTransport;
}

/**
 * Unipile messaging adapter — implements the MessagingChannel interface for
 * both the LinkedIn and WhatsApp rails (brief §6.2).
 *
 * CHANNEL GATING: LinkedIn and WhatsApp are OFF by default. The orchestration
 * layer's send gate (already built) is the sole authority on whether a channel
 * is enabled and whether operator approval has been granted for a given message.
 * send() MUST NEVER be called for a gated channel unless the gate has explicitly
 * allowed it. This adapter trusts its caller; it does NOT re-check gate state.
 *
 * DRY-RUN CONTRACT: when ctx.dryRun is true, send() returns outcome:'dry_run'
 * and makes ZERO calls to the Unipile API (brief §3.5). This is enforced
 * unconditionally and cannot be bypassed by any configuration.
 *
 * IDEMPOTENCY: the idempotencyKey from the message (or ctx) is forwarded to
 * Unipile as a `tracking_id` header so re-running the same logical send never
 * dispatches a duplicate message.
 *
 * RATE LIMITS (channel-limits skill §6.2): LinkedIn ~100 connection requests
 * per week; WhatsApp requires Business Platform opt-in and recipient consent.
 * Pacing, quiet hours, and the approval queue are enforced upstream — not here.
 */
export class UnipileAdapter implements MessagingChannel {
  readonly name = "unipile";
  readonly channel: "linkedin" | "whatsapp";

  private readonly apiKey: string;
  private readonly dsn: string;
  private readonly transport: HttpTransport;

  constructor(options: UnipileAdapterOptions) {
    this.channel = options.channel;
    this.apiKey = options.apiKey ?? "";
    this.dsn = options.dsn ? options.dsn.replace(/\/$/, "") : "";
    this.transport = options.transport ?? fetchTransport;
  }

  /**
   * Returns true when both `apiKey` and `dsn` are present.
   * A missing credential is not an error — callers use this to decide whether
   * to attempt a live send or fall back.
   */
  isConfigured(): boolean {
    return this.apiKey.trim() !== "" && this.dsn.trim() !== "";
  }

  /**
   * Send an outbound message on the configured channel.
   *
   * DRY-RUN: when ctx.dryRun is true this method returns immediately with
   * outcome:'dry_run' and makes ZERO requests to the Unipile API.
   *
   * LIVE SEND: POSTs to the appropriate Unipile endpoint, wraps the call in
   * withRetry (bounded exponential backoff + jitter), validates the response with
   * Zod, records a cost entry via ctx.recordCost, and returns outcome:'sent'.
   *
   * NOTE: this method must never be called for a gated channel unless the
   * orchestration send gate has explicitly permitted the send. The gate lives in
   * the orchestration layer, not in this adapter (brief §6.2, channel-limits skill).
   */
  async send(message: OutboundMessage, ctx: AdapterContext): Promise<SendResult> {
    // ── Dry-run guard — enforced unconditionally, no exceptions ─────────────
    if (ctx.dryRun === true) {
      return {
        outcome: "dry_run",
        provider: this.name,
        preview: `[${this.channel.toUpperCase()}] → ${message.toHandle}: ${message.body}`,
      };
    }

    const sendPath = this.channel === "linkedin" ? LINKEDIN_SEND_PATH : WHATSAPP_SEND_PATH;
    const url = `${this.dsn}${sendPath}`;

    const requestBody = buildRequestBody(this.channel, message);
    const idempKey = message.idempotencyKey;

    const raw = await withRetry((attempt) =>
      httpJson(
        this.transport,
        this.name,
        {
          url,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": this.apiKey,
            /**
             * Forward the idempotency key as a tracking_id so Unipile
             * de-duplicates re-submissions on its side too.
             * Attempt suffix ensures per-attempt uniqueness when retrying, while
             * the base key ties all retries to the same logical operation.
             */
            "X-Idempotency-Key": attempt === 0 ? idempKey : `${idempKey}-retry${attempt}`,
          },
          body: JSON.stringify(requestBody),
        },
        ctx.signal,
      ),
    );

    const response = unipileSendResponse.parse(raw);

    ctx.recordCost?.({
      provider: this.name,
      task: `send_${this.channel}`,
      units: 1,
      costUsd: COST_PER_SEND_USD,
      at: new Date(),
    });

    return {
      outcome: "sent",
      externalId: response.message_id,
      provider: this.name,
    };
  }
}

// ── Request body builders ────────────────────────────────────────────────────

/**
 * Build the Unipile POST body for a LinkedIn message.
 *
 * Unipile LinkedIn send: POST /api/v1/chats/messages
 * Body fields: { account_type, recipient_identifier, text }
 * Docs: https://developer.unipile.com/reference/messagescontroller_sendmessage
 */
function buildLinkedInBody(message: OutboundMessage): Record<string, unknown> {
  return {
    account_type: "LINKEDIN",
    recipient_identifier: message.toHandle,
    text: message.body,
  };
}

/**
 * Build the Unipile POST body for a WhatsApp message.
 *
 * Unipile WhatsApp send: POST /api/v1/chats/messages
 * Body fields: { account_type, recipient_identifier, text }
 * `recipient_identifier` is the recipient's phone number (E.164 format).
 * Docs: https://developer.unipile.com/reference/messagescontroller_sendmessage
 */
function buildWhatsAppBody(message: OutboundMessage): Record<string, unknown> {
  return {
    account_type: "WHATSAPP",
    recipient_identifier: message.toHandle,
    text: message.body,
  };
}

function buildRequestBody(
  channel: "linkedin" | "whatsapp",
  message: OutboundMessage,
): Record<string, unknown> {
  return channel === "linkedin" ? buildLinkedInBody(message) : buildWhatsAppBody(message);
}
