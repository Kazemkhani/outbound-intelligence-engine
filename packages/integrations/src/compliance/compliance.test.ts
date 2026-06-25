import { describe, it, expect } from "vitest";
import type { AdapterContext, ComplianceDecision, ConsentStore, DncrProvider } from "../contracts/index";
import {
  ConsoleAuditSink,
  NullConsentStore,
  NullDncrProvider,
  isContactable,
} from "./index";

const ctx: AdapterContext = { dryRun: true };

// Stubs that return a fixed verdict, to test the policy combination.
const dncrReturning = (verdict: ComplianceDecision["verdict"]): DncrProvider => ({
  name: "stub-dncr",
  isConfigured: () => true,
  async screen() {
    return { verdict, reason: `stub ${verdict}` };
  },
});
const consentReturning = (verdict: ComplianceDecision["verdict"]): ConsentStore => ({
  name: "stub-consent",
  isConfigured: () => true,
  async check() {
    return { verdict, reason: `stub ${verdict}` };
  },
  async record() {},
});

const run = (dncr: DncrProvider, consent: ConsentStore) =>
  isContactable({ e164: "+971500000000", subjectId: "c1", channel: "voice", dncr, consent, ctx });

describe("fail-closed compliance defaults", () => {
  it("NullDncrProvider never clears a number (unknown, not configured)", async () => {
    const d = new NullDncrProvider();
    expect(d.isConfigured()).toBe(false);
    expect((await d.screen("+971500000000", ctx)).verdict).toBe("unknown");
  });

  it("NullConsentStore never reports consent (unknown, not configured)", async () => {
    const c = new NullConsentStore();
    expect(c.isConfigured()).toBe(false);
    expect((await c.check("c1", "voice", ctx)).verdict).toBe("unknown");
  });

  it("the default null rails yield NOT contactable", async () => {
    const res = await run(new NullDncrProvider(), new NullConsentStore());
    expect(res.contactable).toBe(false);
  });

  it("ConsoleAuditSink accepts an event without throwing", async () => {
    await expect(new ConsoleAuditSink().record(
      { actor: "test", action: "voice.place_call", entity: "CallSession:1", at: new Date(0) },
      ctx,
    )).resolves.toBeUndefined();
  });
});

describe("isContactable policy (allowed AND allowed only)", () => {
  it("is contactable only when both DNCR and consent are explicitly allowed", async () => {
    expect((await run(dncrReturning("allowed"), consentReturning("allowed"))).contactable).toBe(true);
  });

  it.each([
    ["allowed", "unknown"],
    ["allowed", "blocked"],
    ["unknown", "allowed"],
    ["blocked", "allowed"],
    ["unknown", "unknown"],
    ["blocked", "blocked"],
  ] as const)("is NOT contactable when dncr=%s, consent=%s", async (d, c) => {
    expect((await run(dncrReturning(d), consentReturning(c))).contactable).toBe(false);
  });
});
