import { z } from "zod";

/** Resend `POST /emails` response — validated at the boundary. */
export const resendSendResponse = z.object({
  id: z.string(),
});

export type ResendSendResponse = z.infer<typeof resendSendResponse>;

/**
 * Append the legally-required opt-out footer (CAN-SPAM / GDPR / PECR, brief §6.1):
 * legal identity, physical postal address, and a one-click unsubscribe link.
 * Returns the body unchanged when no compliance data is supplied (the go-live
 * gate requires it before any live email).
 */
export function withComplianceFooter(input: {
  body: string;
  listUnsubscribe?: string;
  senderIdentity?: { name: string; physicalAddress: string };
}): string {
  const lines: string[] = [];
  if (input.senderIdentity) {
    lines.push(`${input.senderIdentity.name}, ${input.senderIdentity.physicalAddress}`);
  }
  if (input.listUnsubscribe) {
    lines.push(`Unsubscribe: ${input.listUnsubscribe}`);
  }
  if (lines.length === 0) return input.body;
  return `${input.body}\n\n--\n${lines.join("\n")}`;
}
