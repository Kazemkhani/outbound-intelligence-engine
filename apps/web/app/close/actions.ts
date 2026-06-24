"use server";

/**
 * Close Room server actions: the APEX closing tools, folded into the OIE
 * control plane.
 *
 * Each action returns { ok, title, body, error? } where body is markdown the
 * client renders in a styled prose block. Every LLM call is grounded in the
 * distilled APEX sales canon (lib/canon) and routed through lib/llm.ask().
 *
 * Faithful ports of the APEX prompts:
 *   - generatePrep      <- prompts/prep.md          (battlecard, SPIN + Challenger)
 *   - generateOutreach  <- prompts/outreach.md      (implication-first outbound pack)
 *   - coachTranscript   <- prompts/coach.md         (scorecard + next action, deep)
 *   - computeRoi        <- prompts/roi_narrative.md  (deterministic math + Gap Selling narrative)
 *
 * This module must only ever run on the server (it loads the data layer and the
 * Anthropic-backed LLM client). It is a "use server" action file.
 */

import { ask } from "@/lib/llm";
import { grounding } from "@/lib/canon";
import { getLeads } from "@/lib/data";
import type { ScoredLead } from "@/lib/fixtures";
import { computeRoiMath, type RoiInput } from "./roi-math";

// Re-exported so existing importers of the ROI input type keep working; the math
// itself now lives in the pure, unit-tested ./roi-math module.
export type { RoiInput };

// ── Shared result contract ─────────────────────────────────────────────────────

export interface CloseResult {
  ok: boolean;
  title: string;
  body: string;
  error?: string;
}

// ── Lead helpers ────────────────────────────────────────────────────────────────

/** Load a single scored lead by id, or null when it cannot be found. */
async function findLead(leadId: string): Promise<ScoredLead | null> {
  const leads = await getLeads();
  return leads.find((l) => l.id === leadId) ?? null;
}

/** A compact, human-readable line for tier + composite. */
function scoreLine(lead: ScoredLead): string {
  const s = lead.score;
  return `Tier ${s.tier} (composite ${Math.round(s.composite)}, fit ${Math.round(
    s.fit,
  )}, intent ${Math.round(s.intent)})`;
}

/**
 * Render one signal as a readable line. We surface the evidence so the model
 * can reference the real, verifiable detail (implication-first), never invent.
 */
function signalLine(signal: ScoredLead["signals"][number]): string {
  const detail = Object.entries(signal.evidence)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("; ");
  const date = signal.detectedAt.toISOString().slice(0, 10);
  return `- ${signal.type} (strength ${signal.strength}, ${signal.provider}, ${date})${
    detail ? ` -> ${detail}` : ""
  }`;
}

/**
 * Build a compact, faithful brief of the lead for the model. We never editorialise
 * here; we just lay out the known facts so the prompt can stay grounded and the
 * model can flag thin context explicitly.
 */
function leadBrief(lead: ScoredLead): string {
  const c = lead.company;
  const p = lead.contact;
  const signals =
    lead.signals.length > 0
      ? lead.signals.map(signalLine).join("\n")
      : "- none detected yet (treat the buying signal as thin; say so, do not invent one)";

  return [
    "PROSPECT (from OIE, do not invent beyond this):",
    `- Company: ${c.name}${c.industry ? ` (${c.industry})` : ""}`,
    `- Region/Country: ${c.region || "unknown"}, ${c.country || "unknown"}`,
    `- Size: ${c.employeeCount ? `${c.employeeCount} employees` : "unknown"}`,
    c.localCategory ? `- Local category: ${c.localCategory}` : "",
    c.techStack.length ? `- Tech stack: ${c.techStack.join(", ")}` : "",
    c.website ? `- Website: ${c.website}` : "",
    `- Contact: ${p.fullName}${p.title ? `, ${p.title}` : ""} (${p.seniority}, ${
      p.department || "unknown dept"
    })`,
    `- OIE score: ${scoreLine(lead)}`,
    "- Detected buying signals:",
    signals,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── 1. Prep: battlecard (port of prompts/prep.md) ───────────────────────────────

const PREP_SYSTEM = (canon: string): string =>
  [
    "You are an elite B2B sales strategist preparing the operator to sell Huscribe to a specific prospect.",
    "You think in SPIN, Challenger, and Gap Selling. You never invent facts about the prospect: if context is thin, state your assumptions explicitly.",
    "Ground every Huscribe claim in the canon below; never fabricate features or pricing. Where a Huscribe metric is unknown, write the literal token <CONFIRM> rather than guessing.",
    "",
    "Given the prospect details, output exactly these sections in markdown, each under a ## heading:",
    "1. Value hypothesis: the gap you believe exists for this company and how Huscribe closes it, in their likely numbers (state assumptions).",
    "2. Teaching insight: one Challenger-style insight that reframes how they think about their lead and sales process.",
    "3. Discovery set: 6 to 8 questions sequenced SPIN-style (label each S, P, I, or N), tailored to this company.",
    "4. Likely objections: the 5 most probable, each with the real concern beneath it, a calibrated-question opener, and a gap or value reframe.",
    "5. Battlecard: a tight one-pager covering who they are, the wedge, the one-line pitch, the proof point to lead with, and the single next step to push for.",
    "",
    "Be specific to this prospect. No filler. No preamble before the first heading.",
    "",
    "SALES CANON (your only source of methodology and Huscribe facts):",
    canon,
  ].join("\n");

export async function generatePrep(leadId: string): Promise<CloseResult> {
  try {
    const lead = await findLead(leadId);
    if (!lead) {
      return {
        ok: false,
        title: "Prep",
        body: "",
        error: `Lead ${leadId} was not found.`,
      };
    }

    const canon = grounding([
      "FRAMEWORKS",
      "OBJECTIONS",
      "HUSCRIBE_FACTS",
      "DUBAI_PLAYBOOK",
      "DISCOVERY",
    ]);

    const body = await ask({
      system: PREP_SYSTEM(canon),
      user: leadBrief(lead),
      maxTokens: 2400,
    });

    return {
      ok: true,
      title: `Prep: ${lead.company.name} - ${lead.contact.fullName}`,
      body,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Prep",
      body: "",
      error: err instanceof Error ? err.message : "Failed to generate prep.",
    };
  }
}

// ── 2. Outreach: outbound copy pack (port of prompts/outreach.md) ───────────────

const OUTREACH_SYSTEM = (canon: string): string =>
  [
    "You are APEX's outbound copy operator. You draft the human layer of outbound copy on top of a buying signal OIE has already detected, for the operator to send while selling Huscribe.",
    "You think in Fanatical Prospecting (Blount), Cold Calling 2.0 (Ross), the Challenger teaching insight, Hormozi's value equation, and Dubai/UAE go-to-market norms. You write copy a busy developer actually replies to: short, signal-specific, one ask, never a pitch dump.",
    "This market is phone-, WhatsApp-, and voice-note-first. Email and LinkedIn exist but are de-emphasised: lead your effort on phone and WhatsApp.",
    "",
    "THE ONE RULE THAT OVERRIDES EVERYTHING: implication-first, never compliment-first.",
    "A recited fact is research-theatre; a compliment terminates the thought. What earns a reply is a non-obvious implication about THEIR business that opens a loop they want to close.",
    "Every artifact MUST follow this three-part spine: (1) OBSERVATION, one concrete signal-specific detail in their words, referenced never praised; (2) BUSINESS CONSEQUENCE, the non-obvious thing that follows, quantified in the developer's own P&L (a contact-rate gap, the after-hours window, leads paid-for-but-never-called, AED cost-per-head of tele-sales, a launch-week lead spike); an artifact that stops at the observation FAILS; (3) ONE QUESTION the prospect can answer in five seconds, a call to conversation, not a meeting demand.",
    "PREFER the prospect's own number (listing count, monthly lead volume, the figure in the signal) over a segment truth. If no account number was supplied, build the strongest segment-level consequence and flag in notes that one real account figure would sharpen it. The SHAPE of a consequence is always present.",
    "",
    "HARD BANS for the first clause of any artifact: Congrats/Congratulations on; Loved/Saw your post; Impressive; Exciting times; Hope this finds you well; I came across your profile; I wanted to reach out; Just following up / circling back / bumping this / touching base / checking in; solution-first opens. Test: if the first clause could be a LinkedIn comment, it is banned.",
    "",
    "GENERATION GATE: apply the 1,000-others test and the so-what test. Score the WhatsApp 0-2 on Specificity, Implication/so-what, Relevance/why-now, Brevity+one-ask, Feels-understood-not-researched-at (max 10). Any opener scoring 0 on Specificity or Implication, or total under 7/10, MUST be regenerated before you output it. Put the final WhatsApp self-score in Notes.",
    "",
    "Refuse to fabricate Huscribe specifics: use the token <CONFIRM> for any unknown Huscribe metric. Never write 'sounds completely human.' Prove by customer type and locality, never an invented name or stat.",
    "For the Arabic artifacts: natural Gulf register, the implication delivered as a respectful question, correct titles and courtesy; honour quiet hours, prayer times, and Ramadan; clumsy Arabic is worse than plain.",
    "Consent: phone is the lead motion; WhatsApp is earned after a reply or call; flag consent in Notes; no Friday, prayer, or Ramadan pressure.",
    "",
    "Output markdown only (no JSON, no preamble), with each of these as a ## heading in this order:",
    "## Teaching insight: one sentence, value-equation-framed Challenger reframe tied to the signal.",
    "## Why this works: one line proving it is not generic, naming the verifiable detail and the consequence it was tied to.",
    "## Cold-call opener (EN): about 2 spoken lines, observation + quantified implication, then a permission check (Jason Bay PBO: warm, honest, 'did I catch you at a bad time?'). Under about 25 words before the permission ask.",
    "## Live objection cribsheet: exactly 3 entries in this order, each as 'ledge -> bridge to their signal's consequence -> one re-ask': 'not interested'; 'send me an email' (bridge: 'give me your monthly lead volume, I'll send YOUR gap'); 'we have a team' (never attack the team; reframe to after-hours / first-touch).",
    "## WhatsApp (EN): 1 to 3 lines, observation -> consequence -> one question, then stop.",
    "## WhatsApp (Gulf Arabic): the same message in natural Gulf-register Arabic.",
    "## Voice note (EN): a 20 to 35 second spoken script, contractions, one ask.",
    "## Voice note (Gulf Arabic): natural spoken Gulf Arabic.",
    "## Follow-up cadence: 2 to 3 spaced, phone/WhatsApp-weighted follow-ups, each adding a NEW reason, the last a Voss no-oriented break-up. For each give the day, the channel, the angle, and the EN line.",
    "## Email (de-emphasised): a short signal-specific lowercase-natural subject, then a 25 to 75 word body at a 3rd-to-5th-grade reading level with a single CTA and a soft opt-out.",
    "## Notes: the WhatsApp self-score; any <CONFIRM> items; the consent flag; Ramadan / quiet-hours caveats; and any thin-signal assumptions.",
    "",
    "SALES CANON (your only source of methodology and Huscribe facts):",
    canon,
  ].join("\n");

export async function generateOutreach(leadId: string): Promise<CloseResult> {
  try {
    const lead = await findLead(leadId);
    if (!lead) {
      return {
        ok: false,
        title: "Outreach",
        body: "",
        error: `Lead ${leadId} was not found.`,
      };
    }

    const canon = grounding([
      "FRAMEWORKS",
      "OBJECTIONS",
      "VOSS",
      "PERSONALIZATION",
      "HUSCRIBE_FACTS",
      "DUBAI_PLAYBOOK",
    ]);

    const user = [
      leadBrief(lead),
      "",
      "Build the complete outbound copy pack for this prospect, leading on phone and WhatsApp.",
      "Anchor every artifact to the strongest detected signal above (or, if the signal is thin, the strongest segment-level consequence, and flag it in Notes).",
    ].join("\n");

    const body = await ask({
      system: OUTREACH_SYSTEM(canon),
      user,
      maxTokens: 3000,
    });

    return {
      ok: true,
      title: `Outreach: ${lead.company.name} - ${lead.contact.fullName}`,
      body,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Outreach",
      body: "",
      error: err instanceof Error ? err.message : "Failed to generate outreach.",
    };
  }
}

// ── 3. Coach: post-call scorecard (port of prompts/coach.md, deep) ──────────────

const COACH_SYSTEM = (canon: string): string =>
  [
    "You are the operator's personal call reviewer for Huscribe deals. Given a real call transcript or notes, return two things in order.",
    "",
    "First, a JSON scorecard inside a single ```json fenced block, with exactly these keys:",
    '{ "talk_listen_estimate": "e.g. 60/40", "pain_quantified": true/false, "discovery_depth": 1-5, "objection_handling": 1-5, "close_attempted": true/false, "strongest_moment": "...", "biggest_leak": "...", "three_fixes": ["...","...","..."], "verdict": "one line" }',
    "",
    "Judge against the canon: target roughly 43% talk / 57% listen; pain quantified in the buyer's own numbers; SPIN sequencing (most time on Implication and Need-payoff); isolating objections before answering; and whether a clear next step or close was secured.",
    "",
    "Then, after the JSON block, a short markdown section titled '## What to do next' with two parts: the single highest-leverage next action for THIS deal, and one drill the operator should run before the next call.",
    "",
    "Be specific and reference what actually happened in the transcript. Praise sparingly and only when earned; lead with the leak that costs the most. Do not invent details that are not in the transcript.",
    "",
    "SALES CANON (your only source of methodology and benchmarks):",
    canon,
  ].join("\n");

export async function coachTranscript(transcript: string): Promise<CloseResult> {
  try {
    const cleaned = transcript.trim();
    if (!cleaned) {
      return {
        ok: false,
        title: "Coach",
        body: "",
        error: "Paste a call transcript or notes to coach.",
      };
    }

    const canon = grounding([
      "FRAMEWORKS",
      "OBJECTIONS",
      "VOSS",
      "CLOSING",
      "DISCOVERY",
    ]);

    const body = await ask({
      system: COACH_SYSTEM(canon),
      user: `Here is the call transcript or notes to review:\n\n${cleaned}`,
      deep: true,
      maxTokens: 2200,
    });

    return {
      ok: true,
      title: "Post-call scorecard",
      body,
    };
  } catch (err) {
    return {
      ok: false,
      title: "Coach",
      body: "",
      error: err instanceof Error ? err.message : "Failed to coach transcript.",
    };
  }
}

// ── 4. ROI: deterministic math + Gap Selling narrative (port of roi_narrative.md) ─
// The arithmetic lives in ./roi-math (pure + unit-tested); this section only frames it.

const AED = (n: number): string =>
  `AED ${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;

const NUM = (n: number): string =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 1 });

const ROI_SYSTEM = (canon: string): string =>
  [
    "You are APEX's ROI narrative builder. The operator has already computed a current-state to Huscribe-state gap on this prospect's own numbers; your job is to turn that arithmetic into a Gap Selling narrative the operator can say on a call and a credible one-pager they can leave behind.",
    "You think in Gap Selling (Keenan), the 2-week pilot as JOLT risk-reversal, and SPIN Need-payoff. You frame numbers; you never invent them.",
    "",
    "THE CARDINAL RULE: frame, never invent. Use ONLY the numbers supplied below or a transparent arithmetic combination of them. Show the arithmetic so the buyer can check it. If a number needed to complete a frame is missing, write the literal token <CONFIRM> in its place and name what the operator must capture; never guess. Never invent Huscribe proof points, prices, customer names, or competitor claims; reference proof by customer type and locality only. Never write 'sounds completely human.' Round honestly and label assumptions.",
    "",
    "Localise it: the developer pays full price for every portal lead and reaches only a fraction. The gap is wasted spend they have ALREADY made, not a new cost. Frame: 'Huscribe doesn't get you more leads; it makes the leads you already paid for actually pick up, the cheapest pipeline you'll ever buy.' Pitch the high-volume portal / off-plan funnel, not the VIP relationship pipeline, and say so, because naming that boundary builds trust.",
    "",
    "Output markdown only, in exactly these two parts in this order, no preamble.",
    "",
    "## Part 1: The narrative (how to say it on the call)",
    "Under it, exactly these sub-sections as ### headings:",
    "### The gap, in one breath: 2 to 3 sentences the operator can say aloud, current state -> desired state -> the AED cost of the gap, in the buyer's numbers.",
    "### The gap math (say it / write it live): a short fenced code block reproducing the arithmetic from current to Huscribe, ending in the AED delta. Use only the supplied numbers; mark any missing input <CONFIRM>. Make it checkable.",
    "### Why this is spend you've already made: the local reframe (paid-for leads never reached = wasted spend; cheapest pipeline), 2 to 3 sentences.",
    "### The Need-payoff question: one calibrated question that makes the buyer state the value themselves. Do not answer it for them.",
    "### Bridge to the pilot: 1 to 2 sentences offering the 2-week pilot as the fair way to prove this on their leads (one recommended shape, not a menu; risk-reversal, not a discount).",
    "",
    "## Part 2: The one-pager (leave-behind)",
    "A tight, credible one-page body titled for the prospect, including in order: a one-line framing of the situation tied to the gap; a clean Current state / With Huscribe / Delta comparison table built strictly from the supplied numbers (any blank cell = <CONFIRM>); the headline AED outcome annualised, showing the multiplication; a short 'What this is / isn't' line scoping it to the high-volume funnel, not the VIP pipeline; a single next step (the 2-week pilot with a pre-agreed success metric and a captured baseline) phrased as one recommendation; and a footer line: 'Figures based on numbers you provided on this call; <CONFIRM> items to be validated against your CRM.'",
    "",
    "Keep it to roughly one page. Specific to this prospect, no filler, no feature dump. Every number traceable to the input.",
    "",
    "SALES CANON (your only source of methodology and Huscribe facts):",
    canon,
  ].join("\n");

export async function computeRoi(input: RoiInput): Promise<CloseResult> {
  try {
    const m = computeRoiMath(input);

    const facts = [
      "COMPUTED GAP (these are the only numbers you may use; show the arithmetic):",
      `- Inbound leads per month: ${NUM(input.leadsPerMonth)}`,
      `- Share currently unanswered / missed: ${NUM(input.pctUnanswered)}%`,
      `- Close rate on answered leads: ${NUM(input.closeRatePct)}%`,
      `- Average commission per closed deal: ${AED(input.avgCommissionAed)}`,
      "",
      "Derived (already calculated for you, reproduce this arithmetic live):",
      `- Recovered leads per month = ${NUM(input.leadsPerMonth)} x ${NUM(
        input.pctUnanswered,
      )}% = ${NUM(m.recoveredLeadsPerMonth)} leads`,
      `- Recovered deals per month = ${NUM(m.recoveredLeadsPerMonth)} x ${NUM(
        input.closeRatePct,
      )}% = ${NUM(m.recoveredDealsPerMonth)} deals`,
      `- Recovered AED per month = ${NUM(m.recoveredDealsPerMonth)} deals x ${AED(
        input.avgCommissionAed,
      )} = ${AED(m.recoveredAedPerMonth)}`,
      `- Recovered AED per year = ${AED(m.recoveredAedPerMonth)} x 12 = ${AED(
        m.recoveredAedPerYear,
      )}`,
      "",
      "Note: this is the high-volume portal / off-plan funnel, not the VIP relationship pipeline.",
    ].join("\n");

    const canon = grounding([
      "FRAMEWORKS",
      "HUSCRIBE_FACTS",
      "DUBAI_PLAYBOOK",
      "CLOSING",
    ]);

    const narrative = await ask({
      system: ROI_SYSTEM(canon),
      user: facts,
      maxTokens: 2200,
    });

    // Surface the deterministic headline above the narrative so the operator
    // sees the payback figure even if the model trims it.
    const header = [
      `**Recovered pipeline: ${AED(m.recoveredAedPerMonth)} / month (${AED(
        m.recoveredAedPerYear,
      )} / year)**`,
      "",
      `Recovered leads/month: ${NUM(m.recoveredLeadsPerMonth)}  |  Recovered deals/month: ${NUM(
        m.recoveredDealsPerMonth,
      )}`,
      "",
      "---",
      "",
    ].join("\n");

    return {
      ok: true,
      title: "ROI: recovered pipeline",
      body: `${header}${narrative}`,
    };
  } catch (err) {
    return {
      ok: false,
      title: "ROI",
      body: "",
      error: err instanceof Error ? err.message : "Failed to compute ROI.",
    };
  }
}
