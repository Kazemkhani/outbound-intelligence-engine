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
import { resultToCompany, searchApiResponse } from "./mapper";

const SEARCHAPI_ENDPOINT = "https://www.searchapi.io/api/v1/search";
/** Indicative per-search cost; operator-tunable (SearchApi.io bills per query). */
const COST_PER_SEARCH_USD = 0.005;

export interface SearchApiAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
  costPerSearchUsd?: number;
}

/**
 * SearchApi.io adapter — local-business discovery via the Google Maps engine,
 * an alternative to the native Google Places adapter that needs no Google Cloud
 * billing setup and returns the business phone inline. Implements
 * EnrichmentProvider; SearchApi Maps has no people data so enrichContact is a
 * no-op. Vendor payloads never leave the mapper.
 *
 * Auth: Bearer token in the `Authorization` header.
 */
export class SearchApiAdapter implements EnrichmentProvider {
  readonly name = "searchapi";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;
  private readonly costPerSearchUsd: number;

  constructor(options: SearchApiAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
    this.costPerSearchUsd = options.costPerSearchUsd ?? COST_PER_SEARCH_USD;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "googleMaps",
      units: 1,
      costUsd: this.costPerSearchUsd,
      at: new Date(),
    };
  }

  /** Pure transport call — callers own cost accounting to avoid double counting. */
  private async search(textQuery: string, ctx: AdapterContext): Promise<NormalisedCompany[]> {
    const url = `${SEARCHAPI_ENDPOINT}?engine=google_maps&q=${encodeURIComponent(textQuery)}`;
    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url,
          method: "GET",
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
        ctx.signal,
      ),
    );
    return searchApiResponse.parse(raw).local_results.map(resultToCompany);
  }

  async discoverCompanies(query: CompanyQuery, ctx: AdapterContext): Promise<NormalisedCompany[]> {
    const textQuery = query.text ?? query.name ?? query.domain;
    if (!textQuery) return [];
    const companies = await this.search(textQuery, ctx);
    ctx.recordCost?.(this.cost());
    return companies;
  }

  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    const textQuery = query.name ?? query.text ?? query.domain;
    if (!textQuery) return { provider: this.name, matched: false, data: null };
    const companies = await this.search(textQuery, ctx);
    const data = companies[0] ?? null;
    return { provider: this.name, matched: data !== null, data, cost: this.cost() };
  }

  async enrichContact(
    _query: ContactQuery,
    _ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    // SearchApi Maps is not a people-data source.
    return { provider: this.name, matched: false, data: null };
  }
}
