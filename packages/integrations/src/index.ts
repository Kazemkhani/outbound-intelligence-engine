export * from "./contracts/index";
export * from "./base/errors";
export * from "./base/retry";
export * from "./base/idempotency";
export * from "./base/http";

// Enrichment / discovery adapters (anti-corruption layer). Only the public
// adapter classes are surfaced; vendor mappers stay internal to their folder.
export { PlacesAdapter } from "./places/index";
export { SearchApiAdapter } from "./searchapi/index";
export { ApolloAdapter } from "./apollo/index";
export { ClayAdapter, parseClayWebhook } from "./clay/index";
export { ExploriumAdapter } from "./explorium/index";

// Signal / intent adapters (SignalProvider).
export { TheirStackAdapter } from "./theirstack/index";
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
  buildPersonalisationPrompt,
  extractCompanyFacts,
} from "./llm/index";
