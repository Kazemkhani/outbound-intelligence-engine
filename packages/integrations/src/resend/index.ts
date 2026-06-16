import type {
  AdapterContext,
  CostRecord,
  EmailSender,
  OutboundEmail,
  SendResult,
} from "../contracts/index";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { resendSendResponse, withComplianceFooter } from "./mapper";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Indicative per-email cost; operator-tunable. */
const COST_PER_SEND_USD = 0.0004;

export interface ResendAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Resend email-sending adapter — an alternative `EmailSender` rail alongside
 * Smartlead (brief §2.4: every rail behind a stable interface; swap without
 * touching the core). Vendor payloads never leave this file.
 *
 * DRY-RUN GUARANTEE: the first statement of send() checks ctx.dryRun and returns
 * a preview without touching the transport — it is structurally impossible to
 * reach the network in dry-run, and no cost is recorded.
 *
 * The API key is read from the environment by the caller and passed in; it is
 * never hardcoded, logged, or committed.
 */
export class ResendAdapter implements EmailSender {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: ResendAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "send-email",
      units: 1,
      costUsd: COST_PER_SEND_USD,
      at: new Date(),
    };
  }

  async send(message: OutboundEmail, ctx: AdapterContext): Promise<SendResult> {
    // DRY-RUN GATE — must be first; the transport is never referenced below it.
    if (ctx.dryRun) {
      return {
        outcome: "dry_run",
        provider: this.name,
        preview: `${message.subject} -> ${message.to}`,
      };
    }

    const text = withComplianceFooter({
      body: message.body,
      listUnsubscribe: message.listUnsubscribe,
      senderIdentity: message.senderIdentity,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      // Resend honours an Idempotency-Key so a re-run never double-sends.
      "Idempotency-Key": message.idempotencyKey,
    };
    if (message.listUnsubscribe) {
      headers["List-Unsubscribe"] = `<${message.listUnsubscribe}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const raw = await withRetry(() =>
      httpJson<unknown>(
        this.transport,
        this.name,
        {
          url: RESEND_ENDPOINT,
          method: "POST",
          headers,
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text,
          }),
        },
        ctx.signal,
      ),
    );

    const parsed = resendSendResponse.parse(raw);
    ctx.recordCost?.(this.cost());
    return { outcome: "sent", externalId: parsed.id, provider: this.name };
  }
}
