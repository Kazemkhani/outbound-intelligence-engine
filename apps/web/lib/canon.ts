/**
 * Public, product-neutral grounding blocks for the operator-assistance tools.
 *
 * Product claims are intentionally placeholders. Deployments should replace
 * PRODUCT_FACTS with approved positioning and measured evidence. The model may
 * frame supplied facts; it may not invent product claims, prices, or outcomes.
 */

export const FRAMEWORKS = `# SALES FRAMEWORKS

Use a named framework and explain why it applies.

- SPIN: move from a small number of situation questions to problem, implication, and buyer-stated need-payoff.
- Challenger: teach a relevant market insight, tailor it to the stakeholder, and recommend a clear next step.
- Gap Selling: establish the current state, desired state, and a quantified gap before presenting a solution.
- MEDDICC: record metrics, economic buyer, decision criteria, decision process, pain, champion, and competition. Unknown fields remain unknown.
- JOLT: diagnose indecision, recommend one path, limit choices, and reduce perceived risk without manufacturing urgency.

Never present a feature tour as discovery. Never invent a metric to complete a framework.`;

export const OBJECTIONS = `# OBJECTION HANDLING

Use this sequence: isolate the real concern, acknowledge it, ask one calibrated question, connect the answer to verified evidence, and confirm a small next step.

- Price: ask what comparison or budget constraint drives the concern; return to the buyer's quantified gap.
- Timing: identify the real event that changes later and calculate delay only from supplied numbers.
- Existing solution: learn what must be preserved and what remains unsolved.
- Internal alignment: identify the decision owner and offer a concise evidence summary.
- Risk: narrow the scope, define a reversible pilot, and agree success and stop conditions.

Do not discount before understanding the objection. Do not claim proof that has not been supplied.`;

export const VOSS = `# TACTICAL EMPATHY

- Label the apparent concern, then pause.
- Mirror a short, meaningful phrase to invite elaboration.
- Prefer calibrated "what" and "how" questions over accusatory "why" questions.
- Use an accusation audit before a sensitive topic such as price or implementation risk.
- Summarise both facts and emotion; seek genuine confirmation, not compliance.

Use these techniques sparingly and sincerely. They are listening tools, not manipulation. Zealously respect a clear no or opt-out.`;

export const PERSONALIZATION = `# EVIDENCE-BASED PERSONALISATION

Write from observation to implication to one question.

- Observation: a concrete, attributable signal supplied in the input.
- Implication: a plausible business consequence, explicitly marked as a hypothesis when unverified.
- Question: one low-friction question that lets the recipient confirm or reject the hypothesis.

Ban empty praise, fabricated familiarity, invented signals, and multiple calls to action. Thin evidence should produce a modest message, not a richer fiction. Every draft requires human review.`;

export const DUBAI_PLAYBOOK = `# UAE AND MENA COMMUNICATION OVERLAY

Treat local context as a configuration layer, not a stereotype.

- Respect the recipient's working week, time zone, religious observances, and channel preference.
- Use professional English unless the recipient establishes another language preference; never fake fluency.
- Do not move a conversation to WhatsApp without an appropriate relationship or consent.
- Validate current UAE PDPL, TDRA, DIFC, ADGM, and sector-specific requirements with qualified counsel before activation.
- Keep opt-out, suppression, consent provenance, quiet hours, and AI disclosure explicit.

This block is operational guidance, not legal advice. Unknown legal or cultural details must be confirmed.`;

export const DISCOVERY = `# DISCOVERY

Prepare from verified account evidence, then run a short conversation around the buyer's world.

1. Establish relevance and ask permission to continue.
2. Confirm the current process with no more context questions than necessary.
3. Explore the operational and economic implications of the problem.
4. Let the buyer define the desired outcome and success metric.
5. Identify decision owners, constraints, and the next concrete action.

A call with no measured gap, owner, or next step is incomplete. Unknowns should be recorded for follow-up, never guessed.`;

export const CLOSING = `# DECISION AND NEXT STEP

Closing is the result of clear discovery, not pressure.

- Summarise the verified current state, desired state, evidence, and unresolved risks.
- Recommend one proportionate next step with a named owner and date.
- Use a mutual action plan when several stakeholders or technical tasks are involved.
- Ground urgency in a real deadline or buyer-supplied cost of delay.
- Make pilots reversible with pre-agreed success, privacy, and stop conditions.

Never use fake scarcity, hidden terms, or emotional pressure. A declined step is a decision to respect.`;

export const PRODUCT_FACTS = `# CONFIGURED PRODUCT FACTS

This public repository does not include customer-specific positioning or production claims.

Before generating product-facing copy, supply and approve:
- product name and one-line description: <CONFIRM>
- target customer and excluded segments: <CONFIRM>
- supported capabilities and known limitations: <CONFIRM>
- pricing and commercial terms: <CONFIRM>
- measured proof with source and permission to cite: <CONFIRM>
- security, privacy, compliance, and data-residency posture: <CONFIRM>
- implementation scope and timeline: <CONFIRM>
- competitive claims and their evidence: <CONFIRM>

If a field is not supplied, preserve the literal <CONFIRM> marker or omit the claim. Never infer a product fact from general market knowledge.`;

const CANON_BLOCKS: Record<string, string> = {
  frameworks: FRAMEWORKS,
  objections: OBJECTIONS,
  voss: VOSS,
  personalization: PERSONALIZATION,
  dubai: DUBAI_PLAYBOOK,
  discovery: DISCOVERY,
  closing: CLOSING,
  product: PRODUCT_FACTS,
  FRAMEWORKS,
  OBJECTIONS,
  VOSS,
  PERSONALIZATION,
  DUBAI_PLAYBOOK,
  DISCOVERY,
  CLOSING,
  PRODUCT_FACTS,
};

/** Join requested, de-duplicated blocks into one case-insensitive payload. */
export function grounding(keys: string[]): string {
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const key of keys) {
    const block = CANON_BLOCKS[key] ?? CANON_BLOCKS[key.toLowerCase()];
    if (block && !seen.has(block)) {
      seen.add(block);
      blocks.push(block);
    }
  }

  if (blocks.length === 0) return "";

  return [
    "# GROUNDING CANON",
    "Answer only from the supplied methodology and evidence. Tie advice to a named framework. Treat every unsupplied product claim, price, metric, and proof point as <CONFIRM>; never invent specifics.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
