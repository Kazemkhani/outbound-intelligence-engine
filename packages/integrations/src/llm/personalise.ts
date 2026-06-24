import { z } from "zod";
import { AdapterError } from "../base/errors";
import type { NormalisedCompany, NormalisedContact, NormalisedSignal } from "../contracts/model";
import type { LlmClient } from "./client";
import { MODEL_IDS } from "./client";

/**
 * Input to the personalisation step. The `signal` must be the SPECIFIC buying
 * signal detected for this prospect — the opener is required to reference it
 * verbatim (brief §8: "personalisation must use the EXACT signal").
 */
export interface PersonalisationInput {
  contact: NormalisedContact;
  company: NormalisedCompany;
  /** The specific signal driving this outreach — never generic. */
  signal: NormalisedSignal;
  /** Maximum character length for the opener (default: 300). */
  maxChars?: number;
}

/** Validated output from the personalisation step. */
export interface PersonalisedOpener {
  /** The opening line to use in the outreach message. */
  opener: string;
  /** The exact signal evidence the opener references, for audit tracing. */
  citedSignal: string;
}

// ── Zod schema for the structured LLM output ────────────────────────────────

const openerOutputSchema = z.object({
  opener: z.string().min(1).max(600),
  citedSignal: z.string().min(1),
});

// ── Tool definition for structured output ───────────────────────────────────

const PERSONALISE_TOOL = {
  name: "emit_opener",
  description: "Emit the personalised opening line and the exact signal phrase you cited in it.",
  input_schema: {
    type: "object",
    properties: {
      opener: {
        type: "string",
        description:
          "The personalised opening line referencing the specific signal. Must not be generic.",
      },
      citedSignal: {
        type: "string",
        description: "The exact phrase or evidence from the signal that appears in the opener.",
      },
    },
    required: ["opener", "citedSignal"],
  },
} as const;

// ── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Build the personalisation prompt using XML structure tags per brief §8.
 * The signal evidence is placed in its own <signal> block so the model cannot
 * confuse it with generic context, and the output_format block enforces the
 * requirement to cite the exact signal text.
 *
 * Long inputs (context) come before instructions, following Anthropic's
 * guidance on prompt construction.
 */
export function buildPersonalisationPrompt(input: PersonalisationInput): string {
  const { contact, company, signal, maxChars = 300 } = input;

  const signalEvidence = formatSignalEvidence(signal);
  const contactDescription = formatContact(contact);
  const companyDescription = formatCompany(company);

  return `<context>
<company>
${companyDescription}
</company>
<contact>
${contactDescription}
</contact>
</context>

<signal>
Signal type: ${signal.type}
Detected: ${signal.detectedAt.toISOString()}
Evidence: ${signalEvidence}
Source URL: ${signal.sourceUrl ?? "not available"}
</signal>

<instructions>
You are writing the opening line of a cold outreach message on behalf of a sales professional.

Your task:
1. Write a single, natural opening line (the "opener") that references the SPECIFIC signal above.
2. The opener MUST mention the exact activity described in the signal — for example, if the signal is about hiring SDRs, the opener must say something like "noticed you're hiring SDRs" or "saw you're building out your sales team with SDR roles". Do not paraphrase vaguely.
3. The opener must be under ${maxChars} characters.
4. Do NOT fabricate any detail not present in the signal or context above. If you are unsure of a fact, omit it.
5. Do NOT use generic phrases such as "I hope this finds you well", "reaching out to connect", "I came across your profile", or similar filler.
6. Write in British English. Confident, plain, professional tone. No emojis.
7. Address the contact by first name if available.
</instructions>

<output_format>
Call the emit_opener tool with:
- opener: the opening line you have written
- citedSignal: the EXACT phrase or evidence from the <signal> block that you referenced in the opener

You MUST use the tool. Never emit a score or a number. Never fabricate a data point.
</output_format>`;
}

// ── Main personalisation function ────────────────────────────────────────────

/**
 * Generate a personalised outreach opener grounded in the specific signal.
 *
 * Uses claude-sonnet-4-6 (brief addendum §7: Sonnet for personalisation).
 * Validates the LLM's structured output with Zod at the boundary (brief §8).
 * Throws a typed AdapterError on parse failure — never fabricates (brief §8).
 */
export async function personaliseOpener(
  client: LlmClient,
  input: PersonalisationInput,
): Promise<PersonalisedOpener> {
  const userPrompt = buildPersonalisationPrompt(input);

  const result = await client.complete({
    model: MODEL_IDS.personalise,
    maxTokens: 512,
    system:
      "You are a concise, factual copywriter. You write opening lines that reference specific, verified buying signals. You never fabricate data points and you never emit scores or numbers as outputs. Never use em dashes (—); use commas, periods, or colons instead.",
    messages: [{ role: "user", content: userPrompt }],
    tools: [PERSONALISE_TOOL],
  });

  // The model should have called the tool; fall back to parsing text if not.
  const rawInput: unknown = result.toolInput ?? tryParseJson(result.text);

  if (rawInput === null) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message:
        "personaliseOpener: model did not call emit_opener tool and response was not parseable JSON",
      retryable: false,
    });
  }

  const parsed = openerOutputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message: `personaliseOpener: structured output failed validation — ${parsed.error.message}`,
      retryable: false,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

// ── Cold opener (no buying signal) ───────────────────────────────────────────

/**
 * Input to the cold-opener step — used when there is NO specific buying signal
 * (the phone-first local motion). Instead of faking a signal (the weak
 * "congrats on your job" trap), the opener is grounded in what we genuinely
 * know: the prospect's vertical, locale, and size, tied to the product's value.
 */
export interface ColdOpenerInput {
  company: NormalisedCompany;
  contact: NormalisedContact;
  /** What we are selling — kept generic so the engine stays product-agnostic. */
  product: { name: string; oneLiner: string; proofPoints?: string[] };
  /** Where the line will be used — shapes tone/length. */
  channel?: "whatsapp" | "call";
  /** City/locale we are confident about (e.g. "Dubai, UAE"). */
  locale?: string;
  maxChars?: number;
}

export interface ColdOpener {
  /** The opening line to use. */
  opener: string;
  /** The honest personalisation hook the opener leans on, for audit. */
  angle: string;
}

const coldOpenerSchema = z.object({
  opener: z.string().min(1).max(600),
  angle: z.string().min(1),
});

const COLD_OPENER_TOOL = {
  name: "emit_cold_opener",
  description: "Emit the cold opening line and the honest personalisation angle it leans on.",
  input_schema: {
    type: "object",
    properties: {
      opener: { type: "string", description: "The personalised opening line. Must not be generic." },
      angle: {
        type: "string",
        description: "The honest, fact-grounded hook used (vertical/locale/size) — never a fabricated detail.",
      },
    },
    required: ["opener", "angle"],
  },
} as const;

/**
 * Generate a cold opener grounded in the prospect's vertical, locale and size
 * (NOT a fabricated buying signal). For the phone-first motion where most leads
 * have no detectable intent signal. Same anti-fabrication guarantees as
 * {@link personaliseOpener}; never emits a score; Zod-validated at the boundary.
 */
export async function personaliseColdOpener(
  client: LlmClient,
  input: ColdOpenerInput,
): Promise<ColdOpener> {
  const { company, contact, product, channel = "whatsapp", locale, maxChars = 320 } = input;

  const known: string[] = [];
  if (company.name) known.push(`Company: ${company.name}`);
  if (company.localCategory) known.push(`What they do: ${company.localCategory}`);
  if (company.industry) known.push(`Industry: ${company.industry}`);
  if (company.employeeCount) known.push(`Approx. team size: ${company.employeeCount}`);
  if (locale) known.push(`Location: ${locale}`);
  if (contact.fullName && !contact.fullName.startsWith("Decision-maker (unconfirmed)")) {
    known.push(`Contact: ${contact.fullName}${contact.title ? ` (${contact.title})` : ""}`);
  }

  const channelGuidance =
    channel === "whatsapp"
      ? "This is the FIRST line of a cold WhatsApp message. Conversational, mobile-readable, one or two short sentences."
      : "This is the FIRST 10 seconds of a cold phone call. Spoken-natural, easy to say out loud, no jargon.";

  const userPrompt = `<context>
<prospect>
${known.join("\n") || "No prospect details available"}
</prospect>
<product>
Name: ${product.name}
What it does: ${product.oneLiner}
${(product.proofPoints ?? []).map((p) => `- ${p}`).join("\n")}
</product>
</context>

<instructions>
You are writing the opening line of a cold outreach message for a sales professional. There is NO specific buying signal for this prospect — do not invent one.

${channelGuidance}

Your task:
1. Open with a hook grounded ONLY in the verified facts above: their vertical (e.g. a real-estate developer), their locale, and their size. Make it feel written for THEM, not a mass blast.
2. Connect that reality to a concrete, plausible operational pain the product solves (e.g. inbound property enquiries arriving after hours, slow speed-to-lead losing buyers to faster competitors). Do not state specific numbers, project names, or facts you were not given.
3. Do NOT fabricate any detail — no made-up signals, awards, projects, headcounts, or "I saw that you…" claims.
4. Do NOT use filler: no "I hope this finds you well", "reaching out to connect", "I came across your company", "congratulations on…", or similar.
5. Address the contact by first name only if a real name is given above (ignore any "Decision-maker (unconfirmed)" placeholder).
6. British English. Confident, plain, respectful. Under ${maxChars} characters. No emojis.
</instructions>

<output_format>
Call the emit_cold_opener tool with:
- opener: the opening line
- angle: the honest, fact-grounded hook you leaned on (e.g. "Dubai real-estate developer, after-hours enquiry leakage")

You MUST use the tool. Never emit a score or a number as the output. Never fabricate a data point.
</output_format>`;

  const result = await client.complete({
    model: MODEL_IDS.personalise,
    maxTokens: 512,
    system:
      "You are a concise, factual copywriter for cold outreach. You ground every opener in verified facts about the prospect's vertical, locale and size. You never fabricate signals or details, and you never emit scores or numbers as outputs. Never use em dashes (—); use commas, periods, or colons instead.",
    messages: [{ role: "user", content: userPrompt }],
    tools: [COLD_OPENER_TOOL],
  });

  const rawInput: unknown = result.toolInput ?? tryParseJson(result.text);
  if (rawInput === null) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message: "personaliseColdOpener: model did not call emit_cold_opener tool and response was not parseable JSON",
      retryable: false,
    });
  }
  const parsed = coldOpenerSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AdapterError({
      kind: "invalid_request",
      provider: "anthropic",
      message: `personaliseColdOpener: structured output failed validation — ${parsed.error.message}`,
      retryable: false,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSignalEvidence(signal: NormalisedSignal): string {
  if (signal.evidence && Object.keys(signal.evidence).length > 0) {
    return JSON.stringify(signal.evidence);
  }
  return `${signal.type} signal with strength ${signal.strength}`;
}

function formatContact(contact: NormalisedContact): string {
  const parts: string[] = [];
  if (contact.fullName) parts.push(`Name: ${contact.fullName}`);
  if (contact.title) parts.push(`Title: ${contact.title}`);
  if (contact.department) parts.push(`Department: ${contact.department}`);
  if (contact.seniority) parts.push(`Seniority: ${contact.seniority}`);
  return parts.join("\n") || "No contact details available";
}

function formatCompany(company: NormalisedCompany): string {
  const parts: string[] = [];
  if (company.name) parts.push(`Company: ${company.name}`);
  if (company.industry) parts.push(`Industry: ${company.industry}`);
  if (company.employeeCount) parts.push(`Employees: ${company.employeeCount}`);
  if (company.country) parts.push(`Country: ${company.country}`);
  if (company.domain) parts.push(`Domain: ${company.domain}`);
  return parts.join("\n") || "No company details available";
}

/** Attempt to parse a text response as JSON; returns null on failure. */
function tryParseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
