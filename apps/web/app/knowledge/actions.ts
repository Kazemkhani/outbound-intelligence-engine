"use server";

/**
 * Knowledge Q&A server action: a grounded assistant over the distilled sales
 * canon (lib/canon). The operator asks a question; the model answers ONLY from
 * the canon (frameworks, objection handling, Voss, personalization, the Dubai/UAE
 * playbook, discovery, closing, and configured product/competitive facts) and
 * names the framework it draws on. This is the port of the operator assistant's grounded knowledge
 * mode into the control plane so OIE can retire.
 *
 * Like every AI surface here: the LLM reasons over text, it never computes a
 * score, and it never invents a configured product price/metric/proof point (those are
 * emitted as the literal token <CONFIRM>). It is a "use server" module.
 */

import { ask } from "@/lib/llm";
import { grounding } from "@/lib/canon";

export interface KnowledgeResult {
  ok: boolean;
  question: string;
  answer: string;
  error?: string;
}

// The full canon. A knowledge question can touch any area, so we ground on all
// blocks rather than guessing which the operator needs.
const ALL_CANON = [
  "frameworks",
  "objections",
  "voss",
  "personalization",
  "dubai",
  "discovery",
  "closing",
  "product",
];

const KNOWLEDGE_SYSTEM = (canon: string): string =>
  [
    "You are the configured product sales knowledge assistant for the operator selling the configured product (AI-native outbound systems for B2B meetings).",
    "Answer the operator's question using ONLY the sales canon below. The canon is your single source of truth for methodology and for every configured product/competitive fact.",
    "",
    "Rules:",
    "- Ground every answer in a named framework or canon section. Do not give generic LLM advice.",
    "- Never invent a configured product price, metric, customer name, or proof point. Where a specific is unknown, write the literal token <CONFIRM> and say what the operator must confirm.",
    "- If the canon does not cover the question, say so plainly in one line, then give the closest principle the canon does support. Do not pad.",
    "- Be concrete and operator-ready: short, skimmable markdown (## headings, tight bullets, a table only when it genuinely helps). Lead with the answer, not preamble.",
    "- When useful, end with a one-line 'Say it like this:' example the operator could use on a call or in a message.",
    "",
    "SALES CANON (your only source):",
    canon,
  ].join("\n");

/** Answer one knowledge question, grounded in the canon. */
export async function askKnowledge(questionRaw: string): Promise<KnowledgeResult> {
  const question = (questionRaw ?? "").trim();

  // Validate the operator input at the boundary (cheap guard, not Zod: this is a
  // single free-text field, not an external/vendor payload).
  if (question.length < 3) {
    return { ok: false, question, answer: "", error: "Ask a question (at least a few words)." };
  }
  if (question.length > 2000) {
    return {
      ok: false,
      question: question.slice(0, 2000),
      answer: "",
      error: "That question is too long. Trim it to under 2000 characters.",
    };
  }

  try {
    const answer = await ask({
      system: KNOWLEDGE_SYSTEM(grounding(ALL_CANON)),
      user: question,
      maxTokens: 1600,
    });
    return { ok: true, question, answer };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Something went wrong reaching the model.";
    return { ok: false, question, answer: "", error: detail };
  }
}
