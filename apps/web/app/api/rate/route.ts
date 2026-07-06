import { z } from "zod";
import { ask } from "@/lib/llm";

/**
 * Auto-rate an outreach message 1-5 stars using the LLM.
 * POST { body, subject?, channel, contactName, companyName }
 * Returns { stars: number, reasoning: string }
 *
 * Uses Haiku tier (fast, cheap) since this is a structured classification task
 * with a small output — not a hard judgement call.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  body: z.string().min(1).max(5000),
  subject: z.string().max(300).optional(),
  channel: z.string(),
  contactName: z.string(),
  companyName: z.string(),
});

const SYSTEM = `You are an expert B2B outbound copywriter reviewing cold outreach messages for GenRiver (AI-native outbound for B2B meetings).

Rate the message quality on a scale of 1-5 stars using these criteria:
- Personalisation: does it reference specific details about the company or person?
- Clarity and brevity: concise, easy to read, no fluff?
- Value proposition: clear benefit stated for the recipient?
- Call to action: low-commitment, specific ask?
- Tone: professional but human — not salesy, spammy, or templated?

Scoring guide:
5 stars = excellent on all five criteria
4 stars = strong, one minor gap
3 stars = decent, two noticeable gaps or one major one
2 stars = weak personalisation or vague value prop
1 star = generic, spammy, or confusing

Respond with ONLY valid JSON — no markdown, no explanation outside the JSON:
{"stars": <integer 1-5>, "reasoning": "<2-3 sentences citing specific strengths and weaknesses>"}`;

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return new Response("Invalid request body.", { status: 400 });
  }

  const { body, subject, channel, contactName, companyName } = parsed.data;

  const user = [
    `Channel: ${channel}`,
    subject ? `Subject line: ${subject}` : null,
    `Recipient: ${contactName} at ${companyName}`,
    ``,
    `Message:`,
    body,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await ask({ system: SYSTEM, user, maxTokens: 300 });
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error("Model did not return JSON.");
    const result = JSON.parse(match[0]) as { stars: unknown; reasoning: unknown };
    const stars = Number(result.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new Error("Invalid stars value in model response.");
    }
    return Response.json({ stars, reasoning: String(result.reasoning ?? "") });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return new Response(detail.slice(0, 300), { status: 500 });
  }
}
