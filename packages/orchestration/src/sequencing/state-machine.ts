import type { Channel } from "@oie/core";

/**
 * Pure sequence state machine (brief §11 Phase 7).
 *
 * All functions are deterministic: `now` is always injected so the machine is
 * trivially testable without mocking clocks and is safe to replay inside Inngest
 * step functions (idempotent under re-execution).
 *
 * No I/O, no DB calls, no side effects. Everything that writes to persistence
 * lives in the Inngest function layer above.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A single step in a sequence cadence as stored in Sequence.steps (JSON). */
export interface SequenceStep {
  /** Which outbound channel this step uses. */
  channel: Channel;
  /** How many hours after the previous step (or enrolment, for step 0) to wait. */
  delayHours: number;
  /** Reference to the message template to render. */
  templateId: string;
  /**
   * Optional branch conditions evaluated by `applyBranch`. When absent the step
   * is unconditional. The machine never skips steps silently — a step with a
   * failing condition produces a `skipped` action, not a gap in the audit trail.
   */
  conditions?: StepCondition[];
}

export interface StepCondition {
  /** The fact to test, e.g. "score.tier", "contact.industry". */
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "in" | "not_in";
  value: string | number | string[];
}

/** The mutable state of a single contact enrolment. Persisted in Enrolment row. */
export interface EnrolmentState {
  /** Zero-based index of the step the enrolment is currently on. */
  currentStep: number;
  /** Mirrors the DB EnrolmentStatus enum. */
  status: "active" | "paused" | "completed" | "stopped";
  /** When the last action was taken (send, skip, or stop). */
  lastActionAt: Date;
  /** When the next step should execute. Null when completed/stopped. */
  nextActionAt: Date | null;
}

/** What the machine decided should happen at the current step. */
export type StepAction =
  | { kind: "send"; stepIndex: number; step: SequenceStep }
  | { kind: "skip"; stepIndex: number; step: SequenceStep; reason: string }
  | { kind: "completed" }
  | { kind: "stopped"; reason: string };

/** External events that can influence step progression (e.g. inbound replies). */
export interface SequenceEvent {
  type: "reply" | "bounce" | "unsubscribe" | "manual_stop";
  channel?: Channel;
  occurredAt: Date;
}

// ── Core machine functions ────────────────────────────────────────────────────

/**
 * Calculate the absolute timestamp when a step becomes due.
 *
 * @param step   The sequence step being scheduled.
 * @param from   The anchor time (enrolment created-at for step 0, last-action
 *               time for subsequent steps).
 */
export function nextDueAt(step: SequenceStep, from: Date): Date {
  return new Date(from.getTime() + step.delayHours * 60 * 60 * 1000);
}

/**
 * Advance the enrolment state machine.
 *
 * Given the current `state` and the full ordered `steps` array, returns:
 * - The `StepAction` describing what should happen next, and
 * - The updated `EnrolmentState` reflecting the advance.
 *
 * The caller (Inngest layer) is responsible for persisting the returned state.
 * This function is pure — it never writes to the DB.
 *
 * @param state  Current enrolment state.
 * @param steps  All steps in the sequence (order is canonical).
 * @param now    Clock injection for determinism.
 */
export function advance(
  state: EnrolmentState,
  steps: SequenceStep[],
  now: Date,
): { action: StepAction; next: EnrolmentState } {
  if (state.status !== "active") {
    const action: StepAction =
      state.status === "completed"
        ? { kind: "completed" }
        : { kind: "stopped", reason: `enrolment is ${state.status}` };
    return { action, next: state };
  }

  const step = steps[state.currentStep];

  if (step === undefined) {
    // Past the last step — sequence is complete.
    const next: EnrolmentState = {
      ...state,
      status: "completed",
      lastActionAt: now,
      nextActionAt: null,
    };
    return { action: { kind: "completed" }, next };
  }

  const isLastStep = state.currentStep === steps.length - 1;
  const nextStepIndex = state.currentStep + 1;
  const nextStep = steps[nextStepIndex];

  const nextNextActionAt = !isLastStep && nextStep !== undefined ? nextDueAt(nextStep, now) : null;

  const next: EnrolmentState = {
    currentStep: isLastStep ? state.currentStep : nextStepIndex,
    status: isLastStep ? "completed" : "active",
    lastActionAt: now,
    nextActionAt: nextNextActionAt,
  };

  return {
    action: { kind: "send", stepIndex: state.currentStep, step },
    next,
  };
}

/**
 * Determine whether the sequence should halt due to an external event.
 *
 * Stop-on-reply (§11): any inbound reply event from any channel causes the
 * enrolment to stop immediately. Bounces and unsubscribes also stop the
 * cadence. Manual stops are honoured unconditionally.
 *
 * Returns null if no halt is warranted, or a `stopped` action with a reason.
 */
export function shouldStop(_state: EnrolmentState, events: SequenceEvent[]): StepAction | null {
  for (const event of events) {
    switch (event.type) {
      case "reply":
        return { kind: "stopped", reason: "contact replied — stop-on-reply" };
      case "bounce":
        return { kind: "stopped", reason: "message bounced — address invalid" };
      case "unsubscribe":
        return { kind: "stopped", reason: "contact unsubscribed" };
      case "manual_stop":
        return { kind: "stopped", reason: "manually stopped by operator" };
    }
  }
  return null;
}

/**
 * Evaluate branch conditions for a step against a context dictionary.
 *
 * Returns true when the step should be sent, false when it should be skipped.
 * When the step has no conditions it is always active (unconditional).
 *
 * The context is a flat `Record<string, unknown>` — callers project the
 * relevant facts (score, contact fields, etc.) into this shape before calling.
 */
export function applyBranch(
  step: SequenceStep,
  context: Record<string, unknown>,
): { proceed: boolean; failedCondition?: StepCondition } {
  if (!step.conditions || step.conditions.length === 0) {
    return { proceed: true };
  }

  for (const cond of step.conditions) {
    const actual = context[cond.field];
    const passes = evaluateCondition(actual, cond);
    if (!passes) {
      return { proceed: false, failedCondition: cond };
    }
  }

  return { proceed: true };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function evaluateCondition(actual: unknown, cond: StepCondition): boolean {
  switch (cond.operator) {
    case "eq":
      return actual === cond.value;
    case "neq":
      return actual !== cond.value;
    case "gt":
      return typeof actual === "number" && typeof cond.value === "number"
        ? actual > cond.value
        : false;
    case "lt":
      return typeof actual === "number" && typeof cond.value === "number"
        ? actual < cond.value
        : false;
    case "in":
      return Array.isArray(cond.value) ? (cond.value as unknown[]).includes(actual) : false;
    case "not_in":
      return Array.isArray(cond.value) ? !(cond.value as unknown[]).includes(actual) : true;
  }
}
