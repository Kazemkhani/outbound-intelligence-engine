"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@oie/db";
import { z } from "zod";
import type { CrmStatus } from "@/lib/fixtures";

const updateCrmSchema = z.object({
  contactId: z.string().min(1),
  crmStatus: z.enum(["new", "contacted", "replied", "meeting_booked", "won", "lost"]).optional(),
  notes: z.string().max(5000).optional(),
});

export async function updateLeadCrm(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = updateCrmSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid data." };

  const { contactId, crmStatus, notes } = parsed.data;

  try {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(crmStatus !== undefined && { crmStatus: crmStatus as CrmStatus }),
        ...(notes !== undefined && { notes }),
      },
    });
    revalidatePath("/leads");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "DB error." };
  }
}
