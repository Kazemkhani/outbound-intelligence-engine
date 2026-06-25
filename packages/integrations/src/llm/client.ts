import { z } from "zod";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { AdapterError } from "../base/errors";
import type { CostRecord } from "../contracts/model";

/**
 * Model tier identifiers (brief addendum §7 — June 2026 verified IDs).
 * Opus for hard judgement; Sonnet for personalisation and scoring rationale;
 * Haiku for high-volume parsing and classification.
 */
export const MODEL_IDS = {
  hard: "claude-opus-4-8",
  personalise: "claude-sonnet-4-6",
  parse: "claude-haiku-4-5",
} as const satisfies Record<string, string>;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

// ── Anthropic Messages API wire shapes ──────────────────────────────────────

const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  }),
]);

/** Zod schema for the Anthropic Messages API response (POST /v1/messages). */
const messagesResponseSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  role: z.literal("assistant"),
  content: z.array(contentBlockSchema),
  model: z.string(),
  stop_reason: z.enum(["end_turn", "max_tokens", "stop_sequence", "tool_use"]).nullable(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

type MessagesResponse = z.infer<typeof messagesResponseSchema>;

// ── Public types ─────────────────────────────────────────────────────────────

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CompleteOptions {
  system: string;
  messages: Message[];
  model: ModelId;
  maxTokens: number;
  tools?: ToolDefinition[];
}

export interface CompleteResult {
  /** Raw text from the first text content block. Null when the model used a tool. */
  text: string | null;
  /** Parsed tool input when the model responded via tool_use. */
  toolInput: Record<string, unknown> | null;
  /** Full Anthropic response for provenance / debugging. */
  raw: MessagesResponse;
  /** Cost record for this call — the caller must record it. */
  cost: CostRecord;
}

export interface LlmClientOptions {
  apiKey?: string;
  transport?: HttpTransport;
  /**
   * Optional telemetry sink (NX7 observability spine). Fired once per successful
   * complete() with timing, token, and cost data. Default: none (a true no-op).
   * The web layer wires this to Sentry; the integrations package stays free of any
   * observability vendor, preserving the anti-corruption boundary.
   */
  onTelemetry?: (t: LlmTelemetry) => void;
}

export interface LlmTelemetry {
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
}

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const PROVIDER = "anthropic";

/**
 * LlmClient — a thin adapter over the Anthropic Messages REST API.
 *
 * Uses the project's HttpTransport seam so integration tests can replay
 * recorded fixtures (no live calls in CI, brief §2.4). Does NOT depend on the
 * @anthropic-ai/sdk package; the SDK is not in our dependency graph (brief).
 *
 * Cost per call is estimated from the usage object using approximate public
 * pricing and returned on every result so the orchestration layer can write it
 * to ProviderCost (brief §10.2).
 */
export class LlmClient {
  private readonly apiKey: string;
  private readonly transport: HttpTransport;
  private readonly onTelemetry?: (t: LlmTelemetry) => void;

  constructor(options: LlmClientOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
    this.onTelemetry = options.onTelemetry;
  }

  /** Returns true when an API key is present. Used by the orchestration layer
   *  to decide whether to attempt a live call or skip to a fallback. */
  isConfigured(): boolean {
    return this.apiKey.trim() !== "";
  }

  /**
   * Send a request to the Anthropic Messages API and return the parsed result.
   * Validates the response with Zod at the boundary; throws a typed AdapterError
   * on auth failures, rate limits, or response-shape violations so callers always
   * have a typed failure path (brief §7 — no empty catch).
   */
  async complete(options: CompleteOptions): Promise<CompleteResult> {
    const startedAt = Date.now();
    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens,
      system: options.system,
      messages: options.messages,
    };
    if (options.tools && options.tools.length > 0) {
      body["tools"] = options.tools;
    }

    const raw = await withRetry(() =>
      httpJson<unknown>(this.transport, PROVIDER, {
        url: ANTHROPIC_ENDPOINT,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      }),
    );

    // Validate the Anthropic response shape at the boundary.
    const parsed = messagesResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AdapterError({
        kind: "invalid_request",
        provider: PROVIDER,
        message: `Anthropic response failed Zod validation: ${parsed.error.message}`,
        retryable: false,
        cause: parsed.error,
      });
    }

    const response = parsed.data;

    // Extract text or tool_use content.
    const textBlock = response.content.find((b) => b.type === "text");
    const toolBlock = response.content.find((b) => b.type === "tool_use");

    const text = textBlock?.type === "text" ? textBlock.text : null;
    const toolInput = toolBlock?.type === "tool_use" ? toolBlock.input : null;

    const cost = estimateCost(
      options.model,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    this.onTelemetry?.({
      model: options.model,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: cost.costUsd,
      ok: true,
    });

    return { text, toolInput, raw: response, cost };
  }
}

// ── Cost estimation ──────────────────────────────────────────────────────────

/**
 * Approximate pricing per million tokens (USD, as of June 2026 public pricing).
 * The orchestration layer must write the returned CostRecord to ProviderCost;
 * actual billing is per Anthropic's invoice.
 */
const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): CostRecord {
  const pricing = PRICE_PER_M[model] ?? { input: 3.0, output: 15.0 };
  const costUsd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

  return {
    provider: PROVIDER,
    task: model,
    units: inputTokens + outputTokens,
    costUsd,
    at: new Date(),
  };
}
