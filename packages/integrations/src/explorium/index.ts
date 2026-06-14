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
  businessEnrichResponse,
  businessMatchResponse,
  businessToCompany,
  firstBusinessId,
  firstProspectId,
  prospectEnrichResponse,
  prospectMatchResponse,
  prospectToContact,
} from "./mapper";

const BUSINESS_MATCH_ENDPOINT = "https://api.explorium.ai/v1/businesses/match";
const BUSINESS_ENRICH_ENDPOINT = "https://api.explorium.ai/v1/businesses/enrich";
const PROSPECT_MATCH_ENDPOINT = "https://api.explorium.ai/v1/prospects/match";
const PROSPECT_ENRICH_ENDPOINT = "https://api.explorium.ai/v1/prospects/enrich";

/**
 * Explorium charges from a single shared credit pool. A match→enrich flow spends
 * one credit on the match and one on the enrich; we cost the round-trip as two
 * units. Operator-tunable, indicative USD per credit.
 */
const COST_PER_CREDIT_USD = 0.02;

export interface ExploriumAdapterOptions {
  apiKey?: string;
  transport?: HttpTransport;
}

/**
 * Explorium adapter — firmographic + prospect enrichment for the inbound/ABM
 * motion (brief §2.2). Explorium is MCP-native at runtime, but the PRODUCTION
 * pipeline must go through this REST adapter, never the MCP. Synchronous
 * match→enrich; vendor payloads never leave the mapper.
 */
export class ExploriumAdapter implements EnrichmentProvider {
  readonly name = "explorium";
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: ExploriumAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  /** Cost for a single match→enrich round-trip (two credits from the pool). */
  private cost(task: string, units: number): CostRecord {
    return {
      provider: this.name,
      task,
      units,
      costUsd: units * COST_PER_CREDIT_USD,
      at: new Date(),
    };
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /** Pure transport call wrapped in bounded, jittered retry. */
  private post(url: string, body: unknown, ctx: AdapterContext): Promise<unknown> {
    return withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(body),
        },
        ctx.signal,
      ),
    );
  }

  async enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>> {
    const domain = query.domain;
    if (!domain) return { provider: this.name, matched: false, data: null };

    // Step 1 — match the business by domain to obtain a business_id.
    const matchRaw = await this.post(BUSINESS_MATCH_ENDPOINT, { domain }, ctx);
    const businessId = firstBusinessId(businessMatchResponse.parse(matchRaw));
    if (businessId === null) {
      // No match — short-circuit WITHOUT spending an enrich credit.
      return {
        provider: this.name,
        matched: false,
        data: null,
        cost: this.cost("business_match", 1),
      };
    }

    // Step 2 — enrich the matched business for firmographics.
    const enrichRaw = await this.post(BUSINESS_ENRICH_ENDPOINT, { business_id: businessId }, ctx);
    const data = businessToCompany(businessEnrichResponse.parse(enrichRaw).data);
    // Cost is carried on the result; the waterfall records it once (mirrors Places).
    return { provider: this.name, matched: true, data, cost: this.cost("business_enrich", 2) };
  }

  async enrichContact(
    query: ContactQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>> {
    const hasSelector =
      Boolean(query.email) || Boolean(query.linkedinUrl) || Boolean(query.fullName);
    if (!hasSelector) return { provider: this.name, matched: false, data: null };

    // Step 1 — match the prospect to obtain a prospect_id.
    const matchBody: Record<string, unknown> = {};
    if (query.email) matchBody.email = query.email;
    if (query.linkedinUrl) matchBody.linkedin = query.linkedinUrl;
    if (query.fullName) matchBody.full_name = query.fullName;
    if (query.companyDomain) matchBody.company_domain = query.companyDomain;

    const matchRaw = await this.post(PROSPECT_MATCH_ENDPOINT, matchBody, ctx);
    const prospectId = firstProspectId(prospectMatchResponse.parse(matchRaw));
    if (prospectId === null) {
      return {
        provider: this.name,
        matched: false,
        data: null,
        cost: this.cost("prospect_match", 1),
      };
    }

    // Step 2 — enrich the matched prospect.
    const enrichRaw = await this.post(PROSPECT_ENRICH_ENDPOINT, { prospect_id: prospectId }, ctx);
    const data = prospectToContact(
      prospectEnrichResponse.parse(enrichRaw).data,
      query.companyDomain ?? null,
    );
    return { provider: this.name, matched: true, data, cost: this.cost("prospect_enrich", 2) };
  }
}
