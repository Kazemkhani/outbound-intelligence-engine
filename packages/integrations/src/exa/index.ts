import type { AdapterContext, CostRecord, NormalisedSignal } from "../contracts/model";
import type { SignalProvider, SignalQuery } from "../contracts/interfaces";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { exaSearchResponse, exaResultToSignal } from "./mapper";

const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";

/**
 * Indicative cost per search request (Exa "Basic" tier, neural search).
 * Verify against https://exa.ai/pricing before changing billing tiers.
 */
const COST_PER_SEARCH_USD = 0.005;

export interface ExaAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Exa adapter — neural web search for news and web-change signals.
 *
 * Implements SignalProvider. All Exa-specific shapes (request/response) are
 * confined to this package; the mapper translates them to NormalisedSignal
 * before anything leaves the adapter boundary.
 *
 * Score → strength: Exa returns a neural relevance `score` that is nominally
 * 0..1 but may exceed 1 for highly ranked results. We clamp to [0, 1] in the
 * mapper. No additional scaling is applied — the orchestration layer owns decay.
 *
 * Date handling: results without `publishedDate` are silently dropped. Inventing
 * a timestamp would corrupt the signal-decay model; emitting `unknown` is the
 * safer choice (brief §2.4).
 *
 * Cost accounting: one CostRecord is emitted per search call via ctx.recordCost.
 * If ctx.recordCost is absent (e.g. in lightweight call sites) no error is thrown.
 */
export class ExaAdapter implements SignalProvider {
  readonly name = "exa";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: ExaAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "search",
      units: 1,
      costUsd: COST_PER_SEARCH_USD,
      at: new Date(),
    };
  }

  async fetchSignals(query: SignalQuery, ctx: AdapterContext): Promise<NormalisedSignal[]> {
    if (!query.companyDomain) return [];

    const searchQuery = buildSearchQuery(query.companyDomain, query.since);

    const requestBody: Record<string, unknown> = {
      query: searchQuery,
      type: "neural",
      numResults: 10,
      contents: { text: true },
    };
    if (query.since) {
      requestBody["startPublishedDate"] = query.since.toISOString();
    }

    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: EXA_SEARCH_ENDPOINT,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify(requestBody),
        },
        ctx.signal,
      ),
    );

    const parsed = exaSearchResponse.parse(raw);
    ctx.recordCost?.(this.cost());

    const signals: NormalisedSignal[] = [];
    for (const item of parsed.results) {
      const signal = exaResultToSignal(item, query.companyDomain);
      if (signal !== null) signals.push(signal);
    }
    return signals;
  }
}

/**
 * Build the neural search query for a given company domain.
 * The query biases towards commercially significant signals (hiring, funding,
 * expansion) whilst keeping the scope broad enough to surface general news.
 */
function buildSearchQuery(companyDomain: string, since?: Date): string {
  const sinceHint = since ? ` after:${since.toISOString().slice(0, 10)}` : "";
  return `news about ${companyDomain} hiring OR funding OR expansion OR partnership OR launch${sinceHint}`;
}
