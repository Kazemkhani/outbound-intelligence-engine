import { describe, it, expect } from "vitest";
import { sanitizeHistory, transcript, MAX_TURNS, MAX_TURN_CHARS } from "./sanitize";
import type { DojoTurn } from "./scenarios";

const turn = (role: DojoTurn["role"], text: string): DojoTurn => ({ role, text });

describe("sanitizeHistory", () => {
  it("accepts a valid conversation and trims each turn", () => {
    const out = sanitizeHistory([turn("prospect", "  hello  "), turn("operator", "hi there")]);
    expect(out).toEqual([
      { role: "prospect", text: "hello" },
      { role: "operator", text: "hi there" },
    ]);
  });

  it("clamps an over-long turn to MAX_TURN_CHARS", () => {
    const out = sanitizeHistory([turn("operator", "x".repeat(MAX_TURN_CHARS + 500))]);
    expect(out?.[0]?.text.length).toBe(MAX_TURN_CHARS);
  });

  it("rejects non-array, empty, and over-length payloads", () => {
    // @ts-expect-error testing runtime guard against a non-array
    expect(sanitizeHistory(null)).toBeNull();
    // @ts-expect-error testing runtime guard against a non-array
    expect(sanitizeHistory({})).toBeNull();
    expect(sanitizeHistory([])).toBeNull();
    const tooMany = Array.from({ length: MAX_TURNS + 1 }, () => turn("operator", "x"));
    expect(sanitizeHistory(tooMany)).toBeNull();
  });

  it("accepts exactly MAX_TURNS", () => {
    const max = Array.from({ length: MAX_TURNS }, (_, i) =>
      turn(i % 2 ? "operator" : "prospect", "x"),
    );
    expect(sanitizeHistory(max)?.length).toBe(MAX_TURNS);
  });

  it("rejects an unknown role", () => {
    // @ts-expect-error testing runtime guard against a bad role
    expect(sanitizeHistory([turn("system", "nope")])).toBeNull();
  });

  it("rejects empty or whitespace-only turn text (never sends a blank turn)", () => {
    expect(sanitizeHistory([turn("operator", "   ")])).toBeNull();
    expect(sanitizeHistory([turn("operator", "")])).toBeNull();
  });

  it("rejects the whole payload if any turn is malformed", () => {
    // @ts-expect-error testing a missing text field at runtime
    expect(sanitizeHistory([turn("operator", "ok"), { role: "prospect" }])).toBeNull();
  });
});

describe("transcript", () => {
  it("labels speakers and joins with newlines", () => {
    expect(
      transcript([turn("prospect", "you've got two minutes"), turn("operator", "fair enough")]),
    ).toBe(
      "PROSPECT: you've got two minutes\nOPERATOR (selling the configured product): fair enough",
    );
  });

  it("returns an empty string for no turns", () => {
    expect(transcript([])).toBe("");
  });
});
