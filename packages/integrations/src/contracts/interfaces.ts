import type {
  AdapterContext,
  CrmRef,
  EnrichmentResult,
  NormalisedCompany,
  NormalisedContact,
  NormalisedSignal,
  OutboundEmail,
  OutboundMessage,
  SendResult,
} from "./model";

/**
 * The five stable internal interfaces every bought rail is wrapped behind
 * (brief §2.4). Swapping a provider must not touch the core — only its adapter.
 * The waterfall and provider-fallback logic live in OUR orchestration, calling
 * these adapters in priority order; the adapter only knows its own vendor.
 */

export interface CompanyQuery {
  domain?: string;
  name?: string;
  /** Free-text/local query, e.g. "jewellery stores in Dubai" for Places. */
  text?: string;
}

export interface ContactQuery {
  companyDomain?: string;
  fullName?: string;
  email?: string;
  linkedinUrl?: string;
  titles?: string[];
}

export interface SignalQuery {
  companyDomain?: string;
  types?: string[];
  since?: Date;
}

/** Enrichment + discovery (Clay, Apollo, Explorium, Places). */
export interface EnrichmentProvider {
  readonly name: string;
  /** Whether the provider's credentials are present (drives live-vs-fixture). */
  isConfigured(): boolean;
  discoverCompanies?(query: CompanyQuery, ctx: AdapterContext): Promise<NormalisedCompany[]>;
  enrichCompany(
    query: CompanyQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedCompany>>;
  enrichContact(
    query: ContactQuery,
    ctx: AdapterContext,
  ): Promise<EnrichmentResult<NormalisedContact>>;
}

/** Buying signals / intent (TheirStack, PredictLeads, Exa). */
export interface SignalProvider {
  readonly name: string;
  isConfigured(): boolean;
  fetchSignals(query: SignalQuery, ctx: AdapterContext): Promise<NormalisedSignal[]>;
}

/** Email sending infrastructure (Smartlead). MUST honour ctx.dryRun. */
export interface EmailSender {
  readonly name: string;
  isConfigured(): boolean;
  send(message: OutboundEmail, ctx: AdapterContext): Promise<SendResult>;
}

/** Authenticated messaging rails (Unipile: LinkedIn + WhatsApp). MUST honour ctx.dryRun. */
export interface MessagingChannel {
  readonly name: string;
  readonly channel: "linkedin" | "whatsapp";
  isConfigured(): boolean;
  send(message: OutboundMessage, ctx: AdapterContext): Promise<SendResult>;
}

/** CRM system of record (HubSpot). Find-or-create; no duplicates. */
export interface CrmStore {
  readonly name: string;
  isConfigured(): boolean;
  upsertCompany(company: NormalisedCompany, ctx: AdapterContext): Promise<CrmRef>;
  upsertContact(contact: NormalisedContact, ctx: AdapterContext): Promise<CrmRef>;
}
