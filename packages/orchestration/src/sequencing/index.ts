/**
 * Public API of the sequencing engine (brief §11 Phase 7).
 *
 * Consumers import from "@oie/orchestration/sequencing" (or the root barrel
 * once wired). This file is the only permitted re-export surface — nothing
 * else in the monorepo should reach into the sequencing sub-folder directly.
 */

export type {
  SequenceStep,
  StepCondition,
  EnrolmentState,
  StepAction,
  SequenceEvent,
} from "./state-machine";

export { nextDueAt, advance, shouldStop, applyBranch } from "./state-machine";

export type {
  SuppressionRecord,
  SendStepParams,
  SendStepResult,
  SendStepOutcome,
  PendingMessage,
} from "./send-step";

export { executeSendStep, buildIdempotencyKey } from "./send-step";

export type { EnrolContactPayload, StopEnrolmentPayload } from "./inngest";

export {
  inngest,
  registerAdapters,
  runEnrolment,
  stopEnrolment,
  sequencingFunctions,
} from "./inngest";
