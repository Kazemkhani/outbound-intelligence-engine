"use server";

/**
 * Approval queue server actions.
 *
 * These persist the operator's decision (approve / reject) to the Message row,
 * but they do NOT contact any sending provider. The send gate
 * (packages/orchestration/src/send-gate.ts) enforces the real boundary at code
 * level: an actual send requires the dry-run flag to be off AND an approved
 * state AND an explicit provider call inside the Inngest send step. Approving
 * here only records intent and moves the message out of the queue; with DRY_RUN
 * on (the default, and the only mode in this control plane) nothing is ever sent.
 *
 * The UI makes the gate concrete: an operator must click Approve before anything
 * could ever send. There is no affordance here that bypasses the dry-run gate.
 */

import { prisma } from "@oie/db";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Mark a queued message approved. Persists status = "approved" so it leaves the
 * awaiting_approval queue. NO send happens — the dry-run gate remains active and
 * is the only thing that could ever authorise a real send (it does not, here).
 */
export async function approveMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }

  try {
    const result = await prisma.message.updateMany({
      where: { id: messageId, status: "awaiting_approval" },
      data: { status: "approved" },
    });
    if (result.count === 0) {
      return { ok: false, error: "Message not found or no longer awaiting approval." };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save approval: ${detail}`.slice(0, 200) };
  }

  revalidatePath("/approvals");
  return {
    ok: true,
    message: "Approved. No send was performed — the dry-run gate is active, so nothing leaves the system.",
  };
}

/**
 * Reject a queued message. Persists status = "rejected" so it leaves the queue
 * and will never be sent.
 */
export async function rejectMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }

  try {
    const result = await prisma.message.updateMany({
      where: { id: messageId, status: "awaiting_approval" },
      data: { status: "rejected" },
    });
    if (result.count === 0) {
      return { ok: false, error: "Message not found or no longer awaiting approval." };
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not save rejection: ${detail}`.slice(0, 200) };
  }

  revalidatePath("/approvals");
  return { ok: true, message: "Rejected. This message will not be sent." };
}
