import type { ApprovalState } from "../send-gate";

/**
 * Durable human approval for the send-gate (NX3). The runEnrolment function can
 * suspend on this event with step.waitForEvent and resume when an operator
 * approves (or rejects) the action in the Close Room, at zero idle cost.
 *
 * The safety guarantee: resuming from this event NEVER bypasses the send-gate.
 * executeSendStep re-evaluates evaluateSendGate on every execution, including the
 * post-resume one, so DRY_RUN still wins even after an approval event arrives.
 * This module only maps the event to an ApprovalState; the gate stays the
 * authority (see send-gate.ts).
 */

/** The event the Close Room approval UI emits to release a suspended send. */
export const SEND_APPROVED_EVENT = "oie/send.approved" as const;

export interface ApprovalEventData {
  /** Matches the suspended run's enrolment so only the right run resumes. */
  enrolmentId: string;
  /** True approves the action; false is an explicit rejection. */
  approved: boolean;
  /** Optional audit attribution (operator id/email). */
  approver?: string;
}

/**
 * Map a received approval event (or a timeout) to an ApprovalState.
 *
 * - event present + approved   -> "approved"
 * - event present + not approved -> "rejected"
 * - no event (timeout/null)    -> the fallback (default "pending", which the gate
 *   treats as not-approved, so a timed-out approval can never send).
 */
export function approvalFromEvent(
  event: { data?: Partial<ApprovalEventData> } | null | undefined,
  fallback: ApprovalState = "pending",
): ApprovalState {
  if (!event) return fallback;
  return event.data?.approved === true ? "approved" : "rejected";
}
