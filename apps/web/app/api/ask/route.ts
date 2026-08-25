import { z } from "zod";
import { streamAsk } from "@/lib/llm";
import { grounding } from "@/lib/canon";

/**
 * Streaming Knowledge endpoint (NX6). POST { question } returns a plain-text
 * stream of a canon-grounded answer. Auth-gated by middleware (not in the public
 * allowlist), so only the signed-in operator reaches it. The system prompt mirrors
 * app/knowledge/actions.ts: answer only from the canon, cite a framework, emit
 * <CONFIRM> for unknown product specifics. The LLM never computes a score.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const SYSTEM = (canon: string): string =>
  [
    "You are the configured product sales knowledge assistant for the operator selling the configured product (AI-native outbound systems for B2B meetings).",
    "Answer the operator's question using ONLY the sales canon below. Ground every answer in a named framework; do not give generic LLM advice.",
    "Never invent a configured product price, metric, customer name, or proof point. Where a specific is unknown, write the literal token <CONFIRM>.",
    "Be concrete and skimmable. No em dashes (use a colon, comma, or period).",
    "",
    "SALES CANON (your only source):",
    canon,
  ].join("\n");

const requestSchema = z.object({ question: z.string() });

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return new Response("Body must be { question: string }.", { status: 400 });
  }
  const question = parsed.data.question.trim();
  if (question.length < 3) {
    return new Response("Ask a question (at least a few words).", { status: 400 });
  }
  if (question.length > 2000) {
    return new Response("That question is too long. Trim it to under 2000 characters.", {
      status: 400,
    });
  }

  try {
    return streamAsk({ system: SYSTEM(grounding(ALL_CANON)), user: question, maxTokens: 1600 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Something went wrong reaching the model.";
    return new Response(detail, { status: 500 });
  }
}
