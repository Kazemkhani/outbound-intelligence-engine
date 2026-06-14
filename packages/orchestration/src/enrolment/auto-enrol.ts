import type { SignalType, Tier } from "@oie/core";

/**
 * Signal-triggered enrolment (brief §11 Phase 9). A fresh, qualifying signal on
 * a lead that already meets the ICP bar auto-enrols it into a sequence — but
 * ALWAYS through the gate: enrolment is planned here; nothing sends. The first
 * message still lands in the approval queue (executeSendStep + evaluateSendGate).
 */

const TIER_RANK: Record<Tier, number> = { A: 3, B: 2, C: 1, D: 0 };

export interface EnrolmentTrigger {
  signalType: SignalType;
  /** When the signal expires; an expired signal never triggers enrolment. */
  signalExpiresAt: Date | null;
  /** The lead's current tier. */
  tier: Tier;
}

export interface EnrolmentPolicy {
  /** Minimum tier that may be auto-enrolled (default B). */
  minTier: Tier;
  /** Signal types that qualify as a trigger. */
  qualifyingTypes: SignalType[];
}

export interface AutoEnrolDecision {
  enrol: boolean;
  reason: string;
}

/**
 * Decide whether a fresh signal should auto-enrol a lead. Pure; `now` injected.
 * Never enrols on a stale/expired signal, a below-bar tier, or a non-qualifying
 * type. Enrolment created from this still passes the send gate before any send.
 */
export function qualifiesForEnrolment(
  trigger: EnrolmentTrigger,
  policy: EnrolmentPolicy,
  now: Date,
): AutoEnrolDecision {
  if (trigger.signalExpiresAt && trigger.signalExpiresAt.getTime() <= now.getTime()) {
    return { enrol: false, reason: "signal has expired — not fresh" };
  }
  if (!policy.qualifyingTypes.includes(trigger.signalType)) {
    return {
      enrol: false,
      reason: `signal type ${trigger.signalType} is not a qualifying trigger`,
    };
  }
  if (TIER_RANK[trigger.tier] < TIER_RANK[policy.minTier]) {
    return {
      enrol: false,
      reason: `tier ${trigger.tier} is below the ${policy.minTier} enrolment bar`,
    };
  }
  return {
    enrol: true,
    reason: `fresh ${trigger.signalType} signal on a tier-${trigger.tier} lead`,
  };
}
