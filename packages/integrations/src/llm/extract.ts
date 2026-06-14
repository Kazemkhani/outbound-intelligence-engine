import { z } from "zod";
import { AdapterError } from "../base/errors";
import type { LlmClient } from "./client";
import { MODEL_IDS } from "./client";

/**
 * Structured company facts extracted from free-form source text.
 *
 * Every field that cannot be grounded in the source text is emitted as null
 * (brief §8: "emit unknown rather than guess, never fabricate a data point").
 * Provenance records the span of source text that supported each field.
 */
export interface CompanyFacts {
  name: string | null;
  domain: string | null;
  industry: string | null;
  employeeCount: number | null;
  country: string | null;
  region: string | null;
  techStack: string[];
  fundingRound: string | null;
  fundingAmountUsd: number | null;
  /** Field-level provenance: maps field name to the quoted source span. */
  provenance: Record<string, string>;
}

// ── Zod schema for the structured LLM output ────────────────────────────────

const companyFactsSchema = z.object({
  name: z.string().nullable(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  employeeCount: z.number().int().positive().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  techStack: z.array(z.string()),
  fundingRound: z.string().nullable(),
  fundingAmountUsd: z.number().positive().nullable(),
  provenance: z.record(z.string()),
});

// ── Tool definition ──────────────────────────────────────────────────────────

const EXTRACT_TOOL = {
  name: "emit_company_facts",
  description:
    "Emit structured company facts extracted from the source text. Use null for any field not clearly evidenced in the source. Never guess or invent.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: ["string", "null"], description: "Company legal or trading name." },
      domain: {
        type: ["string", "null"],
        description: "Primary web domain, e.g. acme.com. Omit https:// and trailing slashes.",
      },
      industry: { type: ["string", "null"], description: "Industry or sector." },
      employeeCount: {
        type: ["integer", "null"],
        description: "Number of employees as an integer. Null if not stated.",
      },
      country: { type: ["string", "null"], description: "Country of headquarters." },
      region: {
        type: ["string", "null"],
        description: "State, emirate, or region of headquarters.",
      },
      techStack: {
        type: "array",
        items: { type: "string" },
        description: "Technology products or platforms mentioned. Empty array if none evidenced.",
      },
      fundingRound: {
        type: ["string", "null"],
        description: "Most recent funding round label, e.g. Series A. Null if not mentioned.",
      },
      fundingAmountUsd: {
        type: ["number", "null"],
        description: "Funding amount in USD as a number. Null if not stated.",
      },
      provenance: {
        type: "object",
        additionalProperties: { type: "string" },
        description:
          "For each non-null field, the verbatim quote from the source text that supports it. Keys match the field names above.",
      },
    },
    required: [
      "name",
      "domain",
      "industry",
      "employeeCount",
      "country",
      "region",
      "techStack",
      "fundingRound",
      "fundingAmountUsd",
      "provenance",
    ],
  },
} as const;

// ── System prompt (stable, versioned here alongside the eval set) ────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a precise information extraction engine.

Rules you must follow without exception:
1. Extract only facts that are EXPLICITLY stated in the source text provided by the user.
2. If a fact is not clearly present in the source, emit null for that field (or an empty array for techStack).
3. Never infer, guess, or interpolate. Absence of evidence is not evidence of a value.
4. Never emit a score, rating, or ranking of any kind.
5. For every non-null field, record the verbatim quote from the source that supports it in the provenance map.
6. Domain: strip protocol (https://) and trailing slashes. Return only the hostname.
7. Employee counts: convert ranges (e.g. "50-100 employees") to the lower bound as an integer.
8. Funding amounts: convert to USD as a plain number. If currency is unclear, emit null.`;

// ── Main extraction function ─────────────────────────────────────────────────

/**
 * Extract structured company facts from free-form source text.
 *
 * Uses claude-haiku-4-5 (brief addendum §7: Haiku for high-volume parsing).
 * Grounds every field in the source; emits null rather than guessing.
 * Validates with Zod at the boundary; throws a typed AdapterError on failure.
 */
export async function extractCompanyFacts(
  client: LlmClient,
  sourceText: string,
): Promise<CompanyFacts> {
  if (!sourceText.trim()) {
    return emptyFacts();
  }

  const userPrompt = buildExtractionPrompt(sourceText);

  const result = await client.complete({
    model: MODEL_IDS.parse,
    maxTokens: 1024,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    tools: [EXTRACT_TOOL],
  });

  const rawInput: unknown = result.toolInput ?? tryParseJson(result.text);

  if (rawInput === null) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message:
        "extractCompanyFacts: model did not call emit_company_facts tool and response was not parseable JSON",
      retryable: false,
    });
  }

  const parsed = companyFactsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message: `extractCompanyFacts: structured output failed validation — ${parsed.error.message}`,
      retryable: false,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildExtractionPrompt(sourceText: string): string {
  return `<instructions>
Extract company facts from the source text below. For every field that is not explicitly present in the source, emit null. Never fabricate. Record provenance for every non-null field.
</instructions>

<input>
${sourceText}
</input>

<output_format>
Call the emit_company_facts tool with the extracted facts. Every non-null field must have a corresponding provenance entry quoting the source span that supports it.
</output_format>`;
}

function emptyFacts(): CompanyFacts {
  return {
    name: null,
    domain: null,
    industry: null,
    employeeCount: null,
    country: null,
    region: null,
    techStack: [],
    fundingRound: null,
    fundingAmountUsd: null,
    provenance: {},
  };
}

function tryParseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
