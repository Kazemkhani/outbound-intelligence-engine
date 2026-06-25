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

/**
 * Compliance rails for live voice + messaging (UAE PDPL + TDRA). These are NEW
 * seams added ahead of the Next-gated live-calling work (see VOICE-ACTIVATION.md +
 * COMPLIANCE.md). They are FAIL-CLOSED by contract: a missing record, an unknown
 * status, or an unconfigured provider must NEVER read as permission. Only an
 * explicit "allowed" permits contact; everything else is "blocked" or "unknown",
 * and the policy (see ./compliance) treats anything other than "allowed" as
 * not-contactable. They sit behind the same anti-corruption boundary as every
 * other rail: vendor shapes never leak past the adapter.
 */
export type ComplianceVerdict = "allowed" | "blocked" | "unknown";

export interface ComplianceDecision {
  verdict: ComplianceVerdict;
  /** Human-readable reason, safe to log (never contains secrets or full PII). */
  reason: string;
}

/** Do-Not-Call Registry screening (UAE DNCR). Fail-closed: unknown is not clear. */
export interface DncrProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Screen an E.164 number. "allowed" only if positively confirmed not-listed. */
  screen(e164: string, ctx: AdapterContext): Promise<ComplianceDecision>;
}

/** Consent ledger. Fail-closed: no record means no consent ("blocked"/"unknown"). */
export interface ConsentStore {
  readonly name: string;
  isConfigured(): boolean;
  /** Whether this subject has consented to be contacted on this channel. */
  check(subjectId: string, channel: ChannelRef, ctx: AdapterContext): Promise<ComplianceDecision>;
  /** Record a consent grant or withdrawal. */
  record(grant: ConsentGrant, ctx: AdapterContext): Promise<void>;
}

export type ChannelRef = "voice" | "whatsapp" | "linkedin" | "email";

export interface ConsentGrant {
  subjectId: string;
  channel: ChannelRef;
  granted: boolean;
  basis: string; // e.g. "explicit_optin", "made_public", "withdrawn"
  sourceUrl?: string;
  at: Date;
}

/** Tamper-evident audit logging for compliance-relevant actions. */
export interface AuditSink {
  readonly name: string;
  isConfigured(): boolean;
  record(event: AuditEvent, ctx: AdapterContext): Promise<void>;
}

export interface AuditEvent {
  actor: string; // who/what took the action, e.g. "system:nova-call"
  action: string; // e.g. "voice.place_call", "consent.withdraw"
  entity: string; // the affected entity type/id
  at: Date;
  payload?: Record<string, unknown>; // must be PII-minimised by the caller
}
