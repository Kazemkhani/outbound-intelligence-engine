import { describe, it, expect } from "vitest";
import { isSuppressionMatch, type SuppressionRecord } from "./send-step";

const r = (over: Partial<SuppressionRecord>): SuppressionRecord => ({ reason: "test", ...over });

describe("isSuppressionMatch", () => {
  it("suppresses an exact email match on the email channel", () => {
    const res = isSuppressionMatch([r({ email: "A@Foo.com" })], { email: "a@foo.com" }, "email");
    expect(res.suppressed).toBe(true);
  });

  it("suppresses a domain match on the email channel", () => {
    const res = isSuppressionMatch([r({ domain: "foo.com" })], { email: "anyone@foo.com" }, "email");
    expect(res.suppressed).toBe(true);
  });

  it("suppresses a phone match on whatsapp, ignoring formatting", () => {
    const res = isSuppressionMatch(
      [r({ phone: "+971 50 123 4567" })],
      { phone: "+971501234567" },
      "whatsapp",
    );
    expect(res.suppressed).toBe(true);
  });

  it("does not suppress when nothing matches", () => {
    expect(isSuppressionMatch([r({ email: "x@y.com" })], { email: "a@foo.com" }, "email").suppressed).toBe(false);
    expect(isSuppressionMatch([], { phone: "+971500000000" }, "whatsapp").suppressed).toBe(false);
  });

  it("honours per-channel scope: an email-scoped record does not suppress whatsapp", () => {
    const recs = [r({ email: "a@foo.com", channel: "email" })];
    expect(isSuppressionMatch(recs, { email: "a@foo.com" }, "email").suppressed).toBe(true);
    expect(isSuppressionMatch(recs, { email: "a@foo.com", phone: "+971500000000" }, "whatsapp").suppressed).toBe(false);
  });

  it("a global (unscoped) phone opt-out suppresses every channel that carries a phone", () => {
    const recs = [r({ phone: "+971500000000", reason: "hard opt-out" })];
    const res = isSuppressionMatch(recs, { phone: "+971500000000" }, "whatsapp");
    expect(res.suppressed).toBe(true);
    expect(res.reason).toBe("hard opt-out");
  });

  it("a whatsapp-scoped phone record does not fire on the email channel", () => {
    const recs = [r({ phone: "+971500000000", channel: "whatsapp" })];
    expect(isSuppressionMatch(recs, { email: "a@foo.com", phone: "+971500000000" }, "email").suppressed).toBe(false);
  });
});
