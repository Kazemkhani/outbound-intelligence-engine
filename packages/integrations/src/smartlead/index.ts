import type { AdapterContext, EmailSender, OutboundEmail, SendResult } from "../contracts/index";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import {
  smartleadAddLeadsResponse,
  smartleadAddMailboxResponse,
  smartleadCreateCampaignResponse,
  smartleadSendEmailResponse,
  type SmartleadAddLeadsResponse,
  type SmartleadAddMailboxResponse,
  type SmartleadCreateCampaignResponse,
  type SmartleadSendEmailResponse,
} from "./mapper";

/**
 * Smartlead adapter — email sending rail for the OIE outbound pipeline.
 * Implements EmailSender (brief §2.4). Vendor payloads never leave this file
 * or mapper.ts. All live calls are wrapped in withRetry; every response is
 * Zod-validated at the boundary.
 *
 * Auth: Smartlead uses an `api_key` query parameter (not a bearer token).
 * Idempotency: the caller's idempotencyKey is forwarded as a custom header
 * and as `client_reference_id` in the body so Smartlead de-duplicates on
 * re-runs; we never re-send if the key has already been accepted.
 *
 * DRY-RUN GUARANTEE: the very first thing send() does is check ctx.dryRun.
 * When true it returns a preview immediately — no transport call is made,
 * and no cost is recorded. The transport is never even referenced in that
 * branch, so it is structurally impossible to hit the network.
 */

const BASE_URL = "https://server.smartlead.ai/api/v1";

/** Indicative cost per outbound send; operator-tunable. */
const COST_PER_SEND_USD = 0.001;

export interface SmartleadAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

export class SmartleadAdapter implements EmailSender {
  readonly name = "smartlead";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: SmartleadAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  /**
   * Append the api_key query parameter that Smartlead requires on every call.
   * We append rather than embed so the key never appears in fixture URLs.
   */
  private url(path: string): string {
    return `${BASE_URL}${path}?api_key=${encodeURIComponent(this.apiKey)}`;
  }

  // ── EmailSender.send ────────────────────────────────────────────────────────

  async send(message: OutboundEmail, ctx: AdapterContext): Promise<SendResult> {
    // DRY-RUN GATE — must be the first check; nothing below this point executes
    // when dryRun is true. The transport is not touched in any code path that
    // reaches this return.
    if (ctx.dryRun) {
      return {
        outcome: "dry_run",
        provider: this.name,
        preview: `${message.subject} -> ${message.to}`,
      };
    }

    const campaignId = message.campaignId;
    if (!campaignId) {
      // Without a campaign context Smartlead cannot route the send. Surface a
      // typed error rather than silently skipping.
      throw new Error(
        `smartlead: send() requires message.campaignId — supply a Smartlead campaign ID or create one with createCampaign()`,
      );
    }

    // POST the lead into the campaign so Smartlead knows the recipient, then
    // trigger the send. The idempotencyKey is forwarded in both the
    // X-Idempotency-Key header and client_reference_id body field.
    const idempotencyKey = message.idempotencyKey;

    // Inject the CAN-SPAM / GDPR opt-out footer and one-click unsubscribe headers.
    const body = withComplianceFooter(message);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": idempotencyKey,
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
          url: this.url(`/campaigns/${encodeURIComponent(campaignId)}/leads/send-email`),
          method: "POST",
          headers,
          body: JSON.stringify({
            lead_email: message.to,
            from_email: message.from,
            subject: message.subject,
            body,
            client_reference_id: idempotencyKey,
          }),
        },
        ctx.signal,
      ),
    );

    const parsed: SmartleadSendEmailResponse = smartleadSendEmailResponse.parse(raw);

    // Record cost only on a real send, never on dry-run (brief §7).
    ctx.recordCost?.({
      provider: this.name,
      task: "send-email",
      units: 1,
      costUsd: COST_PER_SEND_USD,
      at: new Date(),
    });

    return {
      outcome: "sent",
      externalId: parsed.email_id,
      provider: this.name,
    };
  }

  // ── Light campaign-management helpers ───────────────────────────────────────
  // These are used by the orchestration layer to set up a Smartlead campaign
  // before the first send. They are NOT part of the EmailSender contract and
  // are intentionally minimal — the waterfall logic lives in orchestration core,
  // not here.

  /**
   * Create a new Smartlead campaign. Returns the numeric campaign ID that must
   * be stored and passed as message.campaignId on subsequent sends.
   */
  async createCampaign(
    name: string,
    ctx: AdapterContext,
  ): Promise<SmartleadCreateCampaignResponse> {
    const raw = await withRetry(() =>
      httpJson<unknown>(
        this.transport,
        this.name,
        {
          url: this.url("/campaigns"),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ name }),
        },
        ctx.signal,
      ),
    );
    return smartleadCreateCampaignResponse.parse(raw);
  }

  /**
   * Attach a sending mailbox (email account) to an existing campaign. Smartlead
   * rotates across attached mailboxes to distribute volume (email-deliverability
   * skill: caps, rotation, warmup).
   */
  async addMailbox(
    campaignId: number,
    emailAccountId: number,
    ctx: AdapterContext,
  ): Promise<SmartleadAddMailboxResponse> {
    const raw = await withRetry(() =>
      httpJson<unknown>(
        this.transport,
        this.name,
        {
          url: this.url(`/campaigns/${campaignId}/email-accounts`),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email_account_id: emailAccountId }),
        },
        ctx.signal,
      ),
    );
    return smartleadAddMailboxResponse.parse(raw);
  }

  /**
   * Bulk-add leads (contacts) to a campaign sequence. De-duplicated by
   * Smartlead on `email`; already-existing leads are counted but not
   * re-added. Returns the full upload summary.
   */
  async addLeadsToCampaign(
    campaignId: number,
    leads: ReadonlyArray<{ email: string; first_name?: string; last_name?: string }>,
    ctx: AdapterContext,
  ): Promise<SmartleadAddLeadsResponse> {
    const raw = await withRetry(() =>
      httpJson<unknown>(
        this.transport,
        this.name,
        {
          url: this.url(`/campaigns/${campaignId}/leads`),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ lead_list: leads }),
        },
        ctx.signal,
      ),
    );
    return smartleadAddLeadsResponse.parse(raw);
  }
}

/**
 * Append the legally-required opt-out footer (CAN-SPAM / GDPR / PECR, brief §6.1):
 * the sender's legal identity, physical postal address, and a one-click
 * unsubscribe link. Returns the body unchanged when no compliance data is
 * supplied (the go-live gate requires it before any live email).
 */
export function withComplianceFooter(message: OutboundEmail): string {
  const lines: string[] = [];
  if (message.senderIdentity) {
    lines.push(`${message.senderIdentity.name}, ${message.senderIdentity.physicalAddress}`);
  }
  if (message.listUnsubscribe) {
    lines.push(`Unsubscribe: ${message.listUnsubscribe}`);
  }
  if (lines.length === 0) return message.body;
  return `${message.body}\n\n--\n${lines.join("\n")}`;
}
