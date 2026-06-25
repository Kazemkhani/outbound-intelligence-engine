import type {
  AdapterContext,
  CostRecord,
  EnrichmentResult,
  NormalisedCompany,
  NormalisedContact,
} from "../contracts/model";
import type {
  CompanyQuery,
  ContactQuery,
  EnrichmentProvider,
} from "../contracts/interfaces";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { dgisItemToCompany, dgisItemsResponse } from "./mapper";

const DGIS_ITEMS_ENDPOINT = "https://catalog.api.2gis.com/3.0/items";
const FIELDS = "items.point,items.contact_groups,items.rubrics,items.address";

/**
 * 2GIS (DGIS) adapter: a UAE-native EnrichmentProvider over the 2GIS Catalog
 * directory. Strong Dubai/Abu Dhabi/Sharjah business coverage WITH phone numbers,
 * which slots into the enrichment waterfall as a phone-first UAE source alongside
 * Places/SearchApi. The API key is read from config (DGIS_API_KEY), never
 * hardcoded; the key is a subscription/quota-limited credential, so the adapter
 * is fixture-tested offline and only calls live when configured.
 *
 * Anti-corruption: all 2GIS shapes are confined to ./mapper; only NormalisedCompany
 * leaves the boundary. The waterfall/fallback logic lives in our orchestration.
 */
export interface DgisAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

export class DGISAdapter implements EnrichmentProvider {
  readonly name = "2gis";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: DgisAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    // 2GIS is subscription/quota-based rather than per-call priced; record a unit
    // for quota accounting (cost 0 here, true spend is the plan).
    return { provider: this.name, task: "items", units: 1, costUsd: 0, at: new Date() };
  }

  private async search(q: string, ctx: AdapterContext, pageSize: number): Promise<NormalisedCompany[]> {
    if (!this.isConfigured() || q.trim() === "") return [];

    const params = new URLSearchParams({
      q,
      key: this.apiKey,
      fields: FIELDS,
      page_size: String(pageSize),
    });

    const raw = await withRetry(() =>
      httpJson<unknown>(
        this.transport,
        this.name,
        { url: `${DGIS_ITEMS_ENDPOINT}?${params.toString()}`, method: "GET" },
        ctx.signal,
      ),
    );

    const parsed = dgisItemsResponse.parse(raw);
    ctx.recordCost?.(this.cost());
    return (parsed.result?.items ?? []).map(dgisItemToCompany);
  }

  /** Discover UAE businesses by free-text query (e.g. "real estate agency Dubai"). */
  async discoverCompanies(query: CompanyQuery, ctx: AdapterContext): Promise<NormalisedCompany[]> {
    const q = query.text ?? query.name ?? query.domain ?? "";
    return this.search(q, ctx, 10);
  }

  /** Enrich a known company by name; returns the first match with its 2GIS phone. */
  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    const q = query.name ?? query.text ?? query.domain ?? "";
    const items = await this.search(q, ctx, 1);
    const data = items[0] ?? null;
    return { provider: this.name, matched: data !== null, data, cost: this.cost() };
  }

  /** 2GIS is a place/firm directory, not a person source. */
  async enrichContact(
    _query: ContactQuery,
    _ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    return { provider: this.name, matched: false, data: null };
  }
}
