import type {
  AdapterContext,
  CompanyQuery,
  ContactQuery,
  CostRecord,
  EnrichmentProvider,
  EnrichmentResult,
  NormalisedCompany,
  NormalisedContact,
} from "../contracts/index";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { idempotencyKey } from "../base/idempotency";

export { parseClayWebhook } from "./mapper";

/** Nominal cost of enqueuing one row onto the Clay waterfall; operator-tunable. */
const COST_PER_ENQUEUE_USD = 0;

export interface ClayAdapterOptions {
  /** Clay table webhook URL — POST a row here to start the waterfall. */
  webhookUrl?: string;
  /** Optional shared secret some Clay webhooks expect; carried as a header. */
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Clay enrichment adapter — the waterfall workhorse for company/contact
 * enrichment (brief §2.2). Clay is ASYNC and PUSH-BASED: there is no synchronous
 * request/response. We POST a query row to the table's webhook URL; Clay runs its
 * waterfall in the background; the enriched row returns LATER via an inbound
 * webhook that our handler feeds to `parseClayWebhook`. Therefore enrichCompany /
 * enrichContact only ENQUEUE — they always return `matched: false, data: null`.
 * The actual enrichment is realised on the inbound path, not here.
 *
 * (The addendum is explicit: Clay's MCP is read-only and CANNOT trigger the
 * waterfall, so this rail is REST/webhook only.)
 */
export class ClayAdapter implements EnrichmentProvider {
  readonly name = "clay";
  private readonly webhookUrl: string;
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: ClayAdapterOptions = {}) {
    this.webhookUrl = options.webhookUrl ?? "";
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  /** Configured once we know where to POST rows; the API key is optional. */
  isConfigured(): boolean {
    return this.webhookUrl.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "enqueue",
      units: 1,
      costUsd: COST_PER_ENQUEUE_USD,
      at: new Date(),
    };
  }

  /**
   * POST one row onto the Clay table webhook to start the waterfall. The body
   * carries a deterministic idempotencyKey so re-running the same logical query
   * does not enqueue a duplicate row. Wrapped in withRetry for bounded backoff.
   */
  private async enqueue(
    kind: "company" | "contact",
    payload: Record<string, unknown>,
    ctx: AdapterContext,
  ): Promise<void> {
    const key =
      ctx.idempotencyKey ?? idempotencyKey(this.name, kind, ...Object.values(payload).map(String));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey.trim() !== "") headers["x-clay-api-key"] = this.apiKey;

    await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: this.webhookUrl,
          method: "POST",
          headers,
          body: JSON.stringify({ idempotencyKey: key, ...payload }),
        },
        ctx.signal,
      ),
    );
  }

  /**
   * ENQUEUE a company for enrichment. Returns immediately with matched:false —
   * the enriched company arrives later via the inbound webhook, not synchronously.
   */
  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    if (!this.isConfigured() || (!query.domain && !query.name && !query.text)) {
      return { provider: this.name, matched: false, data: null };
    }
    await this.enqueue(
      "company",
      { domain: query.domain ?? null, name: query.name ?? null, text: query.text ?? null },
      ctx,
    );
    // Enqueued: the waterfall runs asynchronously; no synchronous data is returned.
    return { provider: this.name, matched: false, data: null, cost: this.cost() };
  }

  /**
   * ENQUEUE a contact for enrichment. Same async contract as enrichCompany —
   * results return later via the inbound webhook (`parseClayWebhook`).
   */
  async enrichContact(
    query: ContactQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    if (
      !this.isConfigured() ||
      (!query.companyDomain && !query.fullName && !query.email && !query.linkedinUrl)
    ) {
      return { provider: this.name, matched: false, data: null };
    }
    await this.enqueue(
      "contact",
      {
        companyDomain: query.companyDomain ?? null,
        fullName: query.fullName ?? null,
        email: query.email ?? null,
        linkedinUrl: query.linkedinUrl ?? null,
      },
      ctx,
    );
    // Enqueued: the waterfall runs asynchronously; no synchronous data is returned.
    return { provider: this.name, matched: false, data: null, cost: this.cost() };
  }
}
