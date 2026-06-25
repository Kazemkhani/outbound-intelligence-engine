import type {
  AdapterContext,
  AuditEvent,
  AuditSink,
  ChannelRef,
  ComplianceDecision,
  ConsentGrant,
  ConsentStore,
  DncrProvider,
} from "../contracts/index";

/**
 * Fail-closed default compliance rails. Until real DNCR + consent providers are
 * configured (Next-gated, TDRA-approval-dependent), the system must behave as if
 * contact is NOT permitted. These nulls make that the default, not an oversight:
 * every screen/check returns "unknown", and the policy below treats anything other
 * than an explicit "allowed" as not-contactable. The audit sink defaults to a
 * structured console line so compliance actions are at least observable.
 *
 * This is the code-level half of the same principle as the send-gate: a missing
 * configuration can never read as permission.
 */

/** DNCR provider that knows nothing, so it can never clear a number. */
export class NullDncrProvider implements DncrProvider {
  readonly name = "null-dncr";
  isConfigured(): boolean {
    return false;
  }
  async screen(_e164: string, _ctx: AdapterContext): Promise<ComplianceDecision> {
    return { verdict: "unknown", reason: "no DNCR provider configured; fail-closed" };
  }
}

/** Consent store with no records, so nobody is ever consented by default. */
export class NullConsentStore implements ConsentStore {
  readonly name = "null-consent";
  isConfigured(): boolean {
    return false;
  }
  async check(
    _subjectId: string,
    _channel: ChannelRef,
    _ctx: AdapterContext,
  ): Promise<ComplianceDecision> {
    return { verdict: "unknown", reason: "no consent record; fail-closed" };
  }
  async record(_grant: ConsentGrant, _ctx: AdapterContext): Promise<void> {
    // No-op sink. A real ConsentStore persists to a durable, append-only ledger.
  }
}

/** Audit sink that emits a structured line. Real impl writes a tamper-evident log. */
export class ConsoleAuditSink implements AuditSink {
  readonly name = "console-audit";
  isConfigured(): boolean {
    return true;
  }
  async record(event: AuditEvent, _ctx: AdapterContext): Promise<void> {
    // audit visibility is the point of this sink; a real impl writes a tamper-evident log.
    console.info(
      `[audit] ${event.at.toISOString()} ${event.actor} ${event.action} ${event.entity}`,
    );
  }
}

/**
 * The contactability policy. The ONLY way this returns true is when BOTH the DNCR
 * screen and the consent check returned an explicit "allowed". Any "blocked" or
 * "unknown" (the fail-closed defaults) yields false. Returns the decisions so the
 * caller can log exactly why contact was or was not permitted.
 */
export interface ContactabilityResult {
  contactable: boolean;
  dncr: ComplianceDecision;
  consent: ComplianceDecision;
  reason: string;
}

export async function isContactable(args: {
  e164: string;
  subjectId: string;
  channel: ChannelRef;
  dncr: DncrProvider;
  consent: ConsentStore;
  ctx: AdapterContext;
}): Promise<ContactabilityResult> {
  const dncr = await args.dncr.screen(args.e164, args.ctx);
  const consent = await args.consent.check(args.subjectId, args.channel, args.ctx);
  const contactable = dncr.verdict === "allowed" && consent.verdict === "allowed";
  const reason = contactable
    ? "DNCR clear and consent on file"
    : `not contactable: dncr=${dncr.verdict}, consent=${consent.verdict}`;
  return { contactable, dncr, consent, reason };
}
