"use server";

/**
 * Approval queue server actions — DRY_RUN stubs.
 *
 * IMPORTANT: These actions record operator intent but do NOT contact any sending
 * provider. The send gate (packages/orchestration/src/send-gate.ts) enforces this
 * at code level — a real send requires the dry-run flag to be off AND an approved
 * state AND an explicit provider call. Neither condition is met here.
 *
 * The UI makes the gate concrete: an operator must click Approve before anything
 * could ever send. There is no affordance that bypasses this step.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function approveMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }
  // TODO (Phase 7): persist approval state to DB via prisma and enqueue the
  // Inngest send step. The step will re-evaluate the send gate; the dry-run flag
  // must be explicitly disabled by the operator before any real send occurs.
  console.info(`[STUB] Message ${messageId} approved — no send performed.`);
  return {
    ok: true,
    message: `Message ${messageId} marked as approved. No send was performed — the dry-run gate is active.`,
  };
}

export async function rejectMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }
  // TODO (Phase 7): persist rejection to DB.
  console.info(`[STUB] Message ${messageId} rejected.`);
  return {
    ok: true,
    message: `Message ${messageId} rejected and will not be sent.`,
  };
}
