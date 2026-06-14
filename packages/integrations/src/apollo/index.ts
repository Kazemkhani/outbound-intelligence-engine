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
import {
  apolloOrganizationResponse,
  apolloPeopleResponse,
  organizationToCompany,
  personToContact,
} from "./mapper";

const ORG_ENRICH_ENDPOINT = "https://api.apollo.io/v1/organizations/enrich";
const PEOPLE_SEARCH_ENDPOINT = "https://api.apollo.io/v1/mixed_people/search";
/** Indicative per-call credit cost; operator-tunable. */
const COST_PER_ORG_ENRICH_USD = 0.02;
const COST_PER_PEOPLE_SEARCH_USD = 0.04;

export interface ApolloAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Apollo.io adapter — company + contact enrichment for the digital outbound
 * motion. Implements EnrichmentProvider; vendor payloads never leave the mapper.
 * Cost is carried on each EnrichmentResult so the waterfall records it once
 * (no ctx.recordCost here — mirrors PlacesAdapter to avoid double counting).
 */
export class ApolloAdapter implements EnrichmentProvider {
  readonly name = "apollo";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: ApolloAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  private cost(task: string, costUsd: number): CostRecord {
    return { provider: this.name, task, units: 1, costUsd, at: new Date() };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Key": this.apiKey,
    };
  }

  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    const domain = query.domain;
    if (!domain) return { provider: this.name, matched: false, data: null };

    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: `${ORG_ENRICH_ENDPOINT}?domain=${encodeURIComponent(domain)}`,
          method: "GET",
          headers: this.headers(),
        },
        ctx.signal,
      ),
    );

    const org = apolloOrganizationResponse.parse(raw).organization;
    const data = org ? organizationToCompany(org) : null;
    // Cost is carried on the result; the waterfall records it once.
    return {
      provider: this.name,
      matched: data !== null,
      data,
      cost: this.cost("organizations/enrich", COST_PER_ORG_ENRICH_USD),
    };
  }

  async enrichContact(
    query: ContactQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    const domain = query.companyDomain;
    if (!domain) return { provider: this.name, matched: false, data: null };

    const raw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: PEOPLE_SEARCH_ENDPOINT,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            q_organization_domains: domain,
            person_titles: query.titles ?? [],
          }),
        },
        ctx.signal,
      ),
    );

    const person = apolloPeopleResponse.parse(raw).people[0];
    const data = person ? personToContact(person) : null;
    // Cost is carried on the result; the waterfall records it once.
    return {
      provider: this.name,
      matched: data !== null,
      data,
      cost: this.cost("mixed_people/search", COST_PER_PEOPLE_SEARCH_USD),
    };
  }
}
