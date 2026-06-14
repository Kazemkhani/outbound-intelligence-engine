import type {
  AdapterContext,
  CostRecord,
  NormalisedSignal,
  SignalProvider,
  SignalQuery,
} from "../contracts/index";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { mapJobsToSignals, theirStackJobsSearchResponse } from "./mapper";

const JOBS_SEARCH_ENDPOINT = "https://api.theirstack.com/v1/jobs/search";

/**
 * Indicative cost per batch-search call (TheirStack pricing as of 2026-06-14).
 * Adjust via options if the operator has a negotiated rate.
 */
const DEFAULT_COST_PER_SEARCH_USD = 0.01;

export interface TheirStackAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
  /** Override the per-search cost used for cost accounting. */
  costPerSearchUsd?: number;
}

/**
 * TheirStack adapter — job-postings aggregator used as a hiring-intent and
 * tech-adoption signal source. Implements `SignalProvider`.
 *
 * Vendor payloads are validated by Zod at the mapper boundary and never reach
 * `@oie/core` or `packages/orchestration` in their raw form.
 *
 * Auth: Bearer token in `Authorization` header.
 * Rate limits: withRetry maps 429 → `rate_limit` (retryable) automatically via
 * the shared `kindFromStatus` helper in `base/errors`.
 *
 * Cost accounting: one `CostRecord` is emitted per `fetchSignals` call via
 * `ctx.recordCost`. Signals are a batch pull so per-posting accounting would
 * double-count; a single record per fetch is intentional.
 */
export class TheirStackAdapter implements SignalProvider {
  readonly name = "theirstack";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;
  private readonly costPerSearchUsd: number;

  constructor(options: TheirStackAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
    this.costPerSearchUsd = options.costPerSearchUsd ?? DEFAULT_COST_PER_SEARCH_USD;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "jobsSearch",
      units: 1,
      costUsd: this.costPerSearchUsd,
      at: new Date(),
    };
  }

  /**
   * Fetch job-postings signals for the given query.
   *
   * `query.companyDomain` is the primary filter; if absent, only `query.since`
   * is applied (broad pull — use with caution in production).
   * `query.types` is advisory on this adapter: TheirStack is exclusively a
   * hiring/tech source, so "funding", "news", etc. in the types filter will
   * always yield an empty array.
   */
  async fetchSignals(query: SignalQuery, ctx: AdapterContext): Promise<NormalisedSignal[]> {
    // If the caller narrowed to signal types that TheirStack cannot supply,
    // return early without a network call.
    if (query.types && query.types.length > 0) {
      const supported: string[] = ["hiring", "tech_adoption"];
      const hasOverlap = query.types.some((t) => supported.includes(t));
      if (!hasOverlap) return [];
    }

    const since = query.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const postedSince = since.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const requestBody: Record<string, unknown> = {
      posted_after: postedSince,
      limit: 25,
    };
    if (query.companyDomain) {
      requestBody["company_domain"] = query.companyDomain;
    }

    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: JOBS_SEARCH_ENDPOINT,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        },
        ctx.signal,
      ),
    );

    const parsed = theirStackJobsSearchResponse.parse(raw);

    ctx.recordCost?.(this.cost());

    if (parsed.data.length === 0) return [];

    return mapJobsToSignals(parsed.data, this.name);
  }
}
