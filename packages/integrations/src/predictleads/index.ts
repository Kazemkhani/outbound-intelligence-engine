import type { AdapterContext, CostRecord, NormalisedSignal } from "../contracts/index";
import type { SignalProvider, SignalQuery } from "../contracts/interfaces";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { eventToSignal, predictLeadsEventsResponse } from "./mapper";

const PREDICTLEADS_BASE_URL = "https://predictleads.com/api/v3";

/**
 * Cost model: PredictLeads charges per company events lookup. The USD figure
 * here is indicative; operators should override via their contract pricing.
 * One cost record is emitted per fetchSignals call regardless of result count.
 */
const COST_PER_EVENTS_FETCH_USD = 0.01;

export interface PredictLeadsAdapterOptions {
  apiKey?: string;
  apiToken?: string;
  transport?: HttpTransport;
}

/**
 * PredictLeads adapter — company event signals (hiring, funding, executive
 * changes, tech adoption, news). Implements SignalProvider; vendor shapes
 * are validated at the Zod boundary in mapper.ts and never reach the core.
 *
 * Auth: two required headers per request —
 *   Api-Key: <apiKey>
 *   Api-Token: <apiToken>
 *
 * The waterfall and provider-fallback logic lives in orchestration, NOT here.
 * This adapter is dumb, single-vendor, and stateless beyond its auth credentials.
 */
export class PredictLeadsAdapter implements SignalProvider {
  readonly name = "predictleads";

  private readonly apiKey: string;
  private readonly apiToken: string;
  private readonly transport: HttpTransport;

  constructor(options: PredictLeadsAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.apiToken = options.apiToken ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  /**
   * Returns true only when both credentials are present. A partial configuration
   * (one key but not the other) is treated as unconfigured — PredictLeads
   * requires both headers on every request.
   */
  isConfigured(): boolean {
    return this.apiKey.trim() !== "" && this.apiToken.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "companyEvents",
      units: 1,
      costUsd: COST_PER_EVENTS_FETCH_USD,
      at: new Date(),
    };
  }

  async fetchSignals(query: SignalQuery, ctx: AdapterContext): Promise<NormalisedSignal[]> {
    const domain = query.companyDomain;
    if (!domain) return [];

    const url = `${PREDICTLEADS_BASE_URL}/companies/${encodeURIComponent(domain)}/events`;

    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url,
          method: "GET",
          headers: {
            "Api-Key": this.apiKey,
            "Api-Token": this.apiToken,
            Accept: "application/json",
          },
        },
        ctx.signal,
      ),
    );

    const parsed = predictLeadsEventsResponse.parse(raw);

    ctx.recordCost?.(this.cost());

    return parsed.data.map((event) => eventToSignal(event, domain));
  }
}
