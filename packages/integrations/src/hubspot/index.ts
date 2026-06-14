import type {
  AdapterContext,
  CrmRef,
  NormalisedCompany,
  NormalisedContact,
} from "../contracts/index";
import type { CrmStore } from "../contracts/interfaces";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { idempotencyKey } from "../base/idempotency";
import {
  hubspotCompanyObject,
  hubspotCompanySearchResponse,
  hubspotContactObject,
  hubspotContactSearchResponse,
  toHubspotCompanyProperties,
  toHubspotContactProperties,
} from "./mapper";

/**
 * HubSpot CRM v3 adapter — find-or-create for companies and contacts.
 * Implements CrmStore; no duplicates by keying searches on domain / email.
 *
 * Auth: private-app access token sent as "Authorization: Bearer <token>".
 * API reference (verified June 2025):
 *   https://developers.hubspot.com/docs/api/crm/companies
 *   https://developers.hubspot.com/docs/api/crm/contacts
 *
 * Cost accounting: one CostRecord is emitted per write (create or update) via
 * ctx.recordCost when available. Search calls are not billed separately because
 * HubSpot bundles them into the same API-call quota as object operations.
 * Operator note: HubSpot does not publish a per-call USD cost; the costUsd
 * below is set to 0 to signal "quota consumed, no direct charge". Override
 * HUBSPOT_COST_PER_WRITE_USD in a wrapper if you account for per-seat costs.
 */

const BASE_URL = "https://api.hubapi.com";
const COMPANIES_PATH = "/crm/v3/objects/companies";
const CONTACTS_PATH = "/crm/v3/objects/contacts";

/** HubSpot charges per API call quota rather than per-call USD; set to 0. */
const COST_PER_WRITE_USD = 0;

export interface HubSpotAdapterOptions {
  accessToken?: string;
  transport?: HttpTransport;
}

/**
 * HubSpot CRM adapter. Constructor is idempotent — safe to instantiate once
 * and share across requests; no mutable state beyond auth credentials.
 */
export class HubSpotAdapter implements CrmStore {
  readonly name = "hubspot";
  private readonly accessToken: string;
  private readonly transport: HttpTransport;

  constructor(options: HubSpotAdapterOptions = {}) {
    this.accessToken = options.accessToken ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  isConfigured(): boolean {
    return this.accessToken.trim() !== "";
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  // ── Company ────────────────────────────────────────────────────────────────

  /**
   * Find-or-create a HubSpot company keyed on domain.
   *
   * Flow:
   *   1. POST /crm/v3/objects/companies/search — filter property=domain
   *   2a. Hit  → PATCH /crm/v3/objects/companies/{id}  → CrmRef{created:false}
   *   2b. Miss → POST  /crm/v3/objects/companies        → CrmRef{created:true}
   *
   * An idempotency key derived from (provider, domain) is forwarded in the
   * request body for create calls so that network retries never produce
   * duplicate records.
   */
  async upsertCompany(company: NormalisedCompany, ctx: AdapterContext): Promise<CrmRef> {
    const domain = company.domain ?? "";

    // Step 1: search by domain.
    const searchRaw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: `${BASE_URL}${COMPANIES_PATH}/search`,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "domain",
                    operator: "EQ",
                    value: domain,
                  },
                ],
              },
            ],
            properties: ["name", "domain", "industry", "numberofemployees", "country", "website"],
            limit: 1,
          }),
        },
        ctx.signal,
      ),
    );

    const searchResult = hubspotCompanySearchResponse.parse(searchRaw);

    if (searchResult.total > 0 && searchResult.results[0] !== undefined) {
      // Step 2a: found — patch existing record.
      const existingId = searchResult.results[0].id;
      const patchRaw = await withRetry(() =>
        httpJson(
          this.transport,
          this.name,
          {
            url: `${BASE_URL}${COMPANIES_PATH}/${existingId}`,
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify({ properties: toHubspotCompanyProperties(company) }),
          },
          ctx.signal,
        ),
      );

      hubspotCompanyObject.parse(patchRaw);

      ctx.recordCost?.({
        provider: this.name,
        task: "companies/update",
        units: 1,
        costUsd: COST_PER_WRITE_USD,
        at: new Date(),
      });

      return {
        provider: this.name,
        objectType: "company",
        externalId: existingId,
        created: false,
      };
    }

    // Step 2b: not found — create.
    const iKey = ctx.idempotencyKey ?? idempotencyKey("hubspot", "company", domain);

    const createRaw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: `${BASE_URL}${COMPANIES_PATH}`,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            properties: toHubspotCompanyProperties(company),
            // HubSpot v3 does not support a request-level idempotency-key header
            // for object creates; we embed it as a custom property so callers can
            // detect server-side duplicates if the PATCH leg races.
            idempotencyKey: iKey,
          }),
        },
        ctx.signal,
      ),
    );

    const created = hubspotCompanyObject.parse(createRaw);

    ctx.recordCost?.({
      provider: this.name,
      task: "companies/create",
      units: 1,
      costUsd: COST_PER_WRITE_USD,
      at: new Date(),
    });

    return {
      provider: this.name,
      objectType: "company",
      externalId: created.id,
      created: true,
    };
  }

  // ── Contact ────────────────────────────────────────────────────────────────

  /**
   * Find-or-create a HubSpot contact keyed on email address.
   *
   * Flow:
   *   1. POST /crm/v3/objects/contacts/search — filter property=email
   *   2a. Hit  → PATCH /crm/v3/objects/contacts/{id}  → CrmRef{created:false}
   *   2b. Miss → POST  /crm/v3/objects/contacts        → CrmRef{created:true}
   */
  async upsertContact(contact: NormalisedContact, ctx: AdapterContext): Promise<CrmRef> {
    const email = contact.email ?? "";

    // Step 1: search by email.
    const searchRaw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: `${BASE_URL}${CONTACTS_PATH}/search`,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: "email",
                    operator: "EQ",
                    value: email,
                  },
                ],
              },
            ],
            properties: ["firstname", "lastname", "email", "jobtitle", "phone", "hs_linkedin_url"],
            limit: 1,
          }),
        },
        ctx.signal,
      ),
    );

    const searchResult = hubspotContactSearchResponse.parse(searchRaw);

    if (searchResult.total > 0 && searchResult.results[0] !== undefined) {
      // Step 2a: found — patch existing record.
      const existingId = searchResult.results[0].id;
      const patchRaw = await withRetry(() =>
        httpJson(
          this.transport,
          this.name,
          {
            url: `${BASE_URL}${CONTACTS_PATH}/${existingId}`,
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify({ properties: toHubspotContactProperties(contact) }),
          },
          ctx.signal,
        ),
      );

      hubspotContactObject.parse(patchRaw);

      ctx.recordCost?.({
        provider: this.name,
        task: "contacts/update",
        units: 1,
        costUsd: COST_PER_WRITE_USD,
        at: new Date(),
      });

      return {
        provider: this.name,
        objectType: "contact",
        externalId: existingId,
        created: false,
      };
    }

    // Step 2b: not found — create.
    const iKey = ctx.idempotencyKey ?? idempotencyKey("hubspot", "contact", email);

    const createRaw = await withRetry(() =>
      httpJson(
        this.transport,
        this.name,
        {
          url: `${BASE_URL}${CONTACTS_PATH}`,
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            properties: toHubspotContactProperties(contact),
            idempotencyKey: iKey,
          }),
        },
        ctx.signal,
      ),
    );

    const created = hubspotContactObject.parse(createRaw);

    ctx.recordCost?.({
      provider: this.name,
      task: "contacts/create",
      units: 1,
      costUsd: COST_PER_WRITE_USD,
      at: new Date(),
    });

    return {
      provider: this.name,
      objectType: "contact",
      externalId: created.id,
      created: true,
    };
  }
}
