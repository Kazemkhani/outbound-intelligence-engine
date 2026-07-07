export * from "./contracts/index";
export * from "./compliance/index";
export * from "./base/errors";
export * from "./base/retry";
export * from "./base/idempotency";
export * from "./base/http";

// Enrichment / discovery adapters (anti-corruption layer). Only the public
// adapter classes are surfaced; vendor mappers stay internal to their folder.
export { PlacesAdapter } from "./places/index";
export { SearchApiAdapter } from "./searchapi/index";
export { ApolloAdapter } from "./apollo/index";
export {
  apolloPeopleResponse,
  apolloOrganizationResponse,
  personToContact,
  organizationToCompany,
  mapSeniority,
  mapEmailStatus,
} from "./apollo/mapper";
export { ClayAdapter, parseClayWebhook } from "./clay/index";
export { ExploriumAdapter } from "./explorium/index";

// Signal / intent adapters (SignalProvider).
export { TheirStackAdapter } from "./theirstack/index";
export { DLDAdapter } from "./dld/index";
// Real DLD raw-transactions ingest: aggregate official dld_transactions-open rows
// into intent signals (transaction_spike + off_plan_launch) via the tested mapper.
export { aggregateTransactions, rawTransactionsToSignals, dldRawRow, type DldRawRow } from "./dld/raw";
export { DGISAdapter } from "./dgis/index";
export { PredictLeadsAdapter } from "./predictleads/index";
export { ExaAdapter } from "./exa/index";

// CRM (CrmStore).
export { HubSpotAdapter } from "./hubspot/index";

// Sending infrastructure (EmailSender) — honours ctx.dryRun.
export { SmartleadAdapter } from "./smartlead/index";
export { ResendAdapter } from "./resend/index";

// Messaging rails (MessagingChannel) — gated, off by default, honours ctx.dryRun.
export { UnipileAdapter, parseUnipileWebhook } from "./unipile/index";

// LLM reasoning/personalisation/extraction (never computes a score).
export {
  LlmClient,
  MODEL_IDS,
  personaliseOpener,
  personaliseColdOpener,
  buildPersonalisationPrompt,
  extractCompanyFacts,
} from "./llm/index";
