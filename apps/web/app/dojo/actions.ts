"use server";

/**
 * Voice Dojo server actions: interactive sales roleplay + scoring, grounded in
 * the sales canon. The model plays a realistic UAE real-estate prospect (in
 * character, raising canon-true objections); when the operator ends the session
 * it scores their technique against the frameworks. This is the port of APEX's
 * practice mode into the control plane.
 *
 * As everywhere here: the LLM reasons over text, it never computes a lead score
 * (the dojo "score" is qualitative coaching, not the deterministic ICP score),
 * and it never invents a GenRiver price/metric (those are <CONFIRM>). "use server".
 */

import { ask } from "@/lib/llm";
import { grounding } from "@/lib/canon";
import { findScenario, type DojoTurn } from "./scenarios";
import { sanitizeHistory, transcript } from "./sanitize";

export interface ProspectResult {
  ok: boolean;
  reply: string;
  error?: string;
}

export interface ScoreResult {
  ok: boolean;
  body: string;
  error?: string;
}

const PROSPECT_SYSTEM = (persona: string, canon: string): string =>
  [
    "You are roleplaying as a sales PROSPECT so the operator can practise selling GenRiver (AI-native outbound systems for B2B meetings). Stay fully in character.",
    "",
    "WHO YOU ARE:",
    persona,
    "",
    "HOW TO PLAY:",
    "- Reply ONLY as the prospect would speak, in first person. 1 to 4 sentences. No narration, no stage directions, no labels.",
    "- Be realistic and human: busy, a little distracted, not a pushover. Use the objections in your persona when they fit.",
    "- React to what the operator actually says. Reward good technique (specific implication tied to your numbers, sharp discovery questions, calibrated questions) by gradually opening up. Punish weak moves (generic compliments, feature dumps, pitching before understanding, caving on price) by staying guarded or getting impatient.",
    "- Never coach the operator or break character. Never describe what you are doing. If they earn a clear next step, you may agree to it, but only if genuinely earned.",
    "- Keep GenRiver claims realistic; you are the buyer, you do not assert GenRiver facts.",
    "",
    "Use the canon below only to make your objections and buying behaviour realistic, never to help the operator.",
    "",
    "SALES CANON (context for realism):",
    canon,
  ].join("\n");

/** The prospect's next line, in character, given the conversation so far. */
export async function prospectReply(scenarioId: string, history: DojoTurn[]): Promise<ProspectResult> {
  const scenario = findScenario(scenarioId);
  if (!scenario) return { ok: false, reply: "", error: "Unknown scenario." };

  const clean = sanitizeHistory(history);
  if (!clean) return { ok: false, reply: "", error: "The conversation could not be read. Restart the scenario." };
  if (clean[clean.length - 1]?.role !== "operator") {
    return { ok: false, reply: "", error: "It is not the prospect's turn." };
  }

  try {
    const canon = grounding(["OBJECTIONS", "VOSS", "DUBAI_PLAYBOOK", "HUSCRIBE_FACTS"]);
    const reply = await ask({
      system: PROSPECT_SYSTEM(scenario.persona, canon),
      user: `Conversation so far:\n${transcript(clean)}\n\nReply as the prospect's next line only.`,
      maxTokens: 350,
    });
    return { ok: true, reply };
  } catch (err) {
    return {
      ok: false,
      reply: "",
      error: err instanceof Error ? err.message : "The prospect could not respond. Try again.",
    };
  }
}

const SCORE_SYSTEM = (canon: string): string =>
  [
    "You are the operator's Voice Dojo coach. You just observed a PRACTICE roleplay where the operator sold Huscribe to a simulated prospect. Score the OPERATOR's technique (not the prospect).",
    "",
    "Return two things in order.",
    "First, a JSON scorecard in a single ```json fenced block with exactly these keys:",
    '{ "discovery_depth": 1-5, "implication_first": true/false, "objection_handling": 1-5, "calibrated_questions_used": 1-5, "close_or_next_step": true/false, "strongest_moment": "...", "biggest_leak": "...", "three_fixes": ["...","...","..."], "verdict": "one line" }',
    "",
    "Judge against the canon: implication-first over compliment-first; SPIN sequencing with most weight on Implication and Need-payoff; isolating an objection before answering it (Voss calibrated questions, labels); quantifying pain in the prospect's own numbers; and whether a clear next step was earned.",
    "",
    "Then a markdown section '## What to do next' with: the single highest-leverage habit to fix, and one specific line the operator could have used at the moment they lost the most ground (quote what they actually said, then the better version).",
    "",
    "Be specific to what actually happened in this transcript. Praise sparingly, lead with the costliest leak. Do not invent turns that did not happen. Never invent GenRiver specifics; use <CONFIRM>.",
    "",
    "SALES CANON (your only source of methodology and benchmarks):",
    canon,
  ].join("\n");

/** Score the operator's performance across the roleplay. */
export async function scoreRoleplay(scenarioId: string, history: DojoTurn[]): Promise<ScoreResult> {
  const scenario = findScenario(scenarioId);
  if (!scenario) return { ok: false, body: "", error: "Unknown scenario." };

  const clean = sanitizeHistory(history);
  if (!clean) return { ok: false, body: "", error: "The conversation could not be read." };
  const operatorTurns = clean.filter((t) => t.role === "operator").length;
  if (operatorTurns < 2) {
    return { ok: false, body: "", error: "Play a few turns before scoring (at least two of your lines)." };
  }

  try {
    const canon = grounding(["FRAMEWORKS", "OBJECTIONS", "VOSS", "DISCOVERY", "CLOSING"]);
    const body = await ask({
      system: SCORE_SYSTEM(canon),
      user: [
        `Scenario: ${scenario.name} (${scenario.difficulty}).`,
        "",
        "Roleplay transcript to score:",
        transcript(clean),
      ].join("\n"),
      deep: true,
      maxTokens: 2000,
    });
    return { ok: true, body };
  } catch (err) {
    return {
      ok: false,
      body: "",
      error: err instanceof Error ? err.message : "Scoring failed. Try again.",
    };
  }
}
