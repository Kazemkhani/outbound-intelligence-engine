export { LlmClient, MODEL_IDS } from "./client";
export type {
  CompleteOptions,
  CompleteResult,
  LlmClientOptions,
  Message,
  ModelId,
  ToolDefinition,
} from "./client";

export { personaliseOpener, personaliseColdOpener, buildPersonalisationPrompt } from "./personalise";
export type {
  PersonalisationInput,
  PersonalisedOpener,
  ColdOpenerInput,
  ColdOpener,
} from "./personalise";

export { extractCompanyFacts } from "./extract";
export type { CompanyFacts } from "./extract";
