import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  scoreLead,
  icpProfile,
  signalType,
  signalTypeValues,
  seniority,
  SCORING_MODEL_VERSION,
  type ScoringSubject,
  type ScoreResult,
} from "@oie/core";

/**
 * Read-only MCP tools for Outbound Intelligence Engine.
 *
 * These expose the engine's DETERMINISTIC scoring (the crown jewel) to operator
 * and Claude agents over MCP, without re-implementing scoring in the agent and
 * without ever letting an LLM compute the number. The server is read/compute
 * only: it touches no database, no secrets, no network, and is NEVER on the
 * send-path (no email/LinkedIn/WhatsApp/voice). Agent/runtime surface = MCP;
 * the production send pipeline stays REST + webhooks (CLAUDE.md).
 *
 * All input is validated with Zod at the boundary (anti-corruption): agent JSON
 * in -> typed ScoringSubject -> the same code scorer the product runs.
 */

// ── Input schemas (the MCP boundary) ────────────────────────────────────────

const companyFacts = z.object({
  industry: z.string().nullish(),
  employeeCount: z.number().nullish(),
  revenueBand: z.string().nullish(),
  country: z.string().nullish(),
  region: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  localCategory: z.string().nullish(),
  techStack: z.array(z.string()).nullish(),
});

const contactFacts = z.object({
  title: z.string().nullish(),
  seniority: seniority.nullish(),
  department: z.string().nullish(),
});

const signalFact = z.object({
  type: signalType,
  strength: z.number(),
  // Dates arrive as ISO strings over MCP/JSON; coerce at the boundary.
  detectedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullish(),
  evidence: z.record(z.unknown()).optional(),
});

/** ZodRawShape for the score_prospect tool (registerTool inputSchema). */
export const scoreProspectInput = {
  company: companyFacts,
  contact: contactFacts,
  signals: z.array(signalFact).default([]),
  icp: icpProfile,
} as const;

/** Full Zod validator for score_prospect args (exported for consumers/tests). */
export const scoreProspectArgs = z.object(scoreProspectInput);
export type ScoreProspectArgs = z.infer<typeof scoreProspectArgs>;

// ── Pure compute (testable without the transport) ───────────────────────────

/**
 * Build a ScoringSubject from validated args and run the deterministic engine.
 * `now` is injected (never read from the clock inside the engine), so the result
 * is reproducible for a given (subject, icp, now).
 */
export function computeScore(args: ScoreProspectArgs, now: Date): ScoreResult {
  const subject: ScoringSubject = {
    company: args.company,
    contact: args.contact,
    signals: args.signals.map((s) => ({
      type: s.type,
      strength: s.strength,
      detectedAt: s.detectedAt,
      expiresAt: s.expiresAt ?? null,
      evidence: s.evidence,
    })),
  };
  return scoreLead(subject, args.icp, now);
}

/** Static engine reference, for agents that want to interpret a score. */
export function engineReference(): {
  modelVersion: string;
  signalTypes: readonly string[];
  tiers: string;
  composite: string;
} {
  return {
    modelVersion: SCORING_MODEL_VERSION,
    signalTypes: signalTypeValues,
    tiers:
      "Tier from the active ICP tierThresholds (seed: A>=80, B>=65, C>=50, else D). " +
      "Computed by code, never by an LLM.",
    composite:
      "composite = blend.fit * fit + blend.intent * intent (blend sums to 1; seed 0.6/0.4). " +
      "fit and intent are each 0-100; intent decays to zero at a signal's expiresAt.",
  };
}

const textResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

// ── Registration ────────────────────────────────────────────────────────────

/**
 * Register every read-only tool on the given server. `clock` is injectable so
 * the scoring "now" is deterministic in tests; defaults to wall-clock at call
 * time in production (the request boundary supplies `now`, not the engine).
 */
export function registerReadOnlyTools(
  server: McpServer,
  clock: () => Date = () => new Date(),
): void {
  server.registerTool(
    "score_prospect",
    {
      title: "Score a prospect (deterministic)",
      description:
        "Compute a deterministic fit/intent/composite score and tier for a prospect " +
        "(company + contact + signals) against an ICP profile. Returns the same number the product " +
        "computes, with a full rationale. The LLM never computes this score; code does.",
      inputSchema: scoreProspectInput,
    },
    (args) => textResult(computeScore(args as ScoreProspectArgs, clock())),
  );

  server.registerTool(
    "describe_engine",
    {
      title: "Describe the scoring engine",
      description:
        "Return the scoring model version, the known signal types, and how tiers and the composite " +
        "blend are computed, so an agent can interpret a score correctly.",
    },
    () => textResult(engineReference()),
  );

  server.registerTool(
    "validate_icp",
    {
      title: "Validate an ICP profile",
      description:
        "Validate a candidate ICP profile against the engine's schema before scoring against it. " +
        "Returns { valid: true } or the list of validation issues. Never mutates anything.",
      inputSchema: { icp: z.unknown() },
    },
    (args) => {
      const parsed = icpProfile.safeParse((args as { icp: unknown }).icp);
      if (parsed.success) return textResult({ valid: true });
      return textResult({
        valid: false,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    },
  );
}
