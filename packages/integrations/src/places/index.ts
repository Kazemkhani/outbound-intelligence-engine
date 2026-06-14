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
import { placeToCompany, placesSearchResponse } from "./mapper";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.websiteUri,places.nationalPhoneNumber,places.rating";
/** Indicative Text Search (Pro) SKU cost per request; operator-tunable. */
const COST_PER_SEARCH_USD = 0.032;

export interface PlacesAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Google Places adapter — local-business discovery for the door-to-door / SMB
 * motion (brief §2.2). Implements EnrichmentProvider; Places has no people data
 * so enrichContact is a no-op. Vendor payloads never leave the mapper.
 */
export class PlacesAdapter implements EnrichmentProvider {
  readonly name = "places";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: PlacesAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(): CostRecord {
    return {
      provider: this.name,
      task: "searchText",
      units: 1,
      costUsd: COST_PER_SEARCH_USD,
      at: new Date(),
    };
  }

  /** Pure transport call — callers own cost accounting to avoid double counting. */
  private async searchText(textQuery: string, ctx: AdapterContext): Promise<NormalisedCompany[]> {
    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: PLACES_ENDPOINT,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
          body: JSON.stringify({ textQuery }),
        },
        ctx.signal,
      ),
    );
    return placesSearchResponse.parse(raw).places.map(placeToCompany);
  }

  async discoverCompanies(query: CompanyQuery, ctx: AdapterContext): Promise<NormalisedCompany[]> {
    const textQuery = query.text ?? query.name ?? query.domain;
    if (!textQuery) return [];
    const companies = await this.searchText(textQuery, ctx);
    ctx.recordCost?.(this.cost());
    return companies;
  }

  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    const textQuery = query.name ?? query.text ?? query.domain;
    if (!textQuery) return { provider: this.name, matched: false, data: null };
    const companies = await this.searchText(textQuery, ctx);
    const data = companies[0] ?? null;
    // Cost is carried on the result; the waterfall records it once.
    return { provider: this.name, matched: data !== null, data, cost: this.cost() };
  }

  async enrichContact(
    _query: ContactQuery,
    _ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    // Places is not a people-data source.
    return { provider: this.name, matched: false, data: null };
  }
}
