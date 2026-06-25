/**
 * Server-only LLM helper for the Close Room (the ported APEX sales cockpit).
 *
 * This is the single chokepoint every closing-tool server action calls. It
 * wraps the engine's @oie/integrations LlmClient so the control plane has ONE
 * Anthropic client, ONE set of model ids, and ONE place that reads the key.
 *
 * Mirrors the APEX app/llm.py contract: a cached system prompt carrying the
 * grounding canon, a default (Sonnet) tier and a deep (Opus) tier, and a clear
 * error when the key is missing. Scores are never computed here; the engine's
 * deterministic scoring owns that. This file only does reasoning and copy.
 *
 * IMPORTANT: server-only. Never import this into a "use client" module.
 */

import * as Sentry from "@sentry/nextjs";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { LlmClient, MODEL_IDS } from "@oie/integrations";

/**
 * Model tiers, matching APEX: DEFAULT_MODEL claude-sonnet-4-6 for prep /
 * outreach / coach, DEEP_MODEL claude-opus-4-8 for deep post-call review.
 * Sourced from the engine's verified MODEL_IDS so the ids stay in lockstep.
 */
const DEFAULT_MODEL = MODEL_IDS.personalise; // claude-sonnet-4-6
const DEEP_MODEL = MODEL_IDS.hard; // claude-opus-4-8

export interface AskOptions {
  /** System prompt: the instruction template plus the injected grounding canon. */
  system: string;
  /** The user turn: the prospect details, transcript, or numbers to reason over. */
  user: string;
  /** Route to the deep (Opus) tier for hard judgement / post-call review. */
  deep?: boolean;
  /** Output ceiling. Defaults to a generous 2000, matching APEX. */
  maxTokens?: number;
}

/**
 * Read the Anthropic key from the web env. apps/web/.env.local symlinks the
 * engine env, so ANTHROPIC_API_KEY is present at runtime. We read it lazily
 * (per call) rather than at module load so a missing key surfaces as a clean,
 * actionable error at the moment a feature is used, not as a build-time crash.
 */
function apiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim();
}

/**
 * Call Claude with a grounded system prompt and a single user turn; return the
 * model's text.
 *
 * Throws a clear Error if ANTHROPIC_API_KEY is missing, or if the upstream call
 * fails or returns no text (e.g. the model emitted a tool call instead). The
 * caller (a server action) catches this and surfaces { ok:false, error } to the
 * UI, so the operator gets an actionable message rather than a raw 500.
 */
export async function ask(opts: AskOptions): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "AI features need ANTHROPIC_API_KEY. Add it to apps/web/.env.local and restart the dev server.",
    );
  }

  const client = new LlmClient({ apiKey: key });

  let result: Awaited<ReturnType<LlmClient["complete"]>>;
  try {
    result = await client.complete({
      model: opts.deep ? DEEP_MODEL : DEFAULT_MODEL,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      maxTokens: opts.maxTokens ?? 2000,
    });
  } catch (err) {
    // Capture the failure for observability before the caller swallows it into a
    // UI message. captureException is a no-op when no SENTRY_DSN is configured, so
    // this is safe with or without Sentry connected. Never includes the API key.
    Sentry.captureException(err, {
      tags: { area: "llm", tier: opts.deep ? "deep" : "default" },
    });
    // Surface the upstream message (rate limit, overload, credit balance) so the
    // operator gets something actionable. The message never contains the key.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Anthropic call failed: ${detail}`.slice(0, 300));
  }

  const text = result.text?.trim();
  if (!text) {
    Sentry.captureMessage("LLM returned no text", {
      level: "warning",
      tags: { area: "llm", tier: opts.deep ? "deep" : "default" },
    });
    throw new Error("The model returned no text. Try again, or simplify the request.");
  }
  return text;
}

/**
 * Streaming variant of ask() for the AI surfaces (NX6). Returns a plain-text
 * streaming Response so the operator sees the answer build token by token. Same
 * grounding contract as ask(): the caller supplies the canon-grounded system
 * prompt; the LLM only reasons over text, it never computes a score. Uses the
 * Vercel AI SDK over the Anthropic provider; the key is read lazily, never logged.
 */
export function streamAsk(opts: AskOptions): Response {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "AI features need ANTHROPIC_API_KEY. Add it to apps/web/.env.local and restart the dev server.",
    );
  }
  const anthropic = createAnthropic({ apiKey: key });
  const result = streamText({
    model: anthropic(opts.deep ? DEEP_MODEL : DEFAULT_MODEL),
    system: opts.system,
    prompt: opts.user,
    maxOutputTokens: opts.maxTokens ?? 2000,
    onError: ({ error }) => {
      Sentry.captureException(error, {
        tags: { area: "llm", tier: opts.deep ? "deep" : "default", mode: "stream" },
      });
    },
  });
  return result.toTextStreamResponse();
}
