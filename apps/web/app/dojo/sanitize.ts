/**
 * Pure boundary helpers for the Voice Dojo. Split out of the "use server" actions
 * so the validation is independently unit-tested: the dojo replays a conversation
 * supplied by the client, so we clamp and validate it before it reaches the model.
 */

import type { DojoTurn } from "./scenarios";

export const MAX_TURNS = 60;
export const MAX_TURN_CHARS = 1500;

/**
 * Validate + clamp the conversation coming from the client. Returns the cleaned
 * turns, or null if the payload is unusable (not an array, empty, too long, an
 * unknown role, or an empty turn). Each turn's text is trimmed and capped.
 */
export function sanitizeHistory(history: DojoTurn[]): DojoTurn[] | null {
  if (!Array.isArray(history) || history.length === 0 || history.length > MAX_TURNS) return null;
  const out: DojoTurn[] = [];
  for (const t of history) {
    if (!t || (t.role !== "operator" && t.role !== "prospect")) return null;
    const text = String(t.text ?? "").trim();
    if (!text) return null;
    out.push({ role: t.role, text: text.slice(0, MAX_TURN_CHARS) });
  }
  return out;
}

/** Render the running conversation for the model. */
export function transcript(history: DojoTurn[]): string {
  return history
    .map(
      (t) =>
        `${t.role === "operator" ? "OPERATOR (selling the configured product)" : "PROSPECT"}: ${t.text}`,
    )
    .join("\n");
}
