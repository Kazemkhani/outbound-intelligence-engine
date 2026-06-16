import { serve } from "inngest/next";
import { inngest, inngestFunctions } from "@oie/orchestration";

/**
 * Inngest serve endpoint. Registers every durable function (sequencing cadence,
 * auto-enrolment, suppression) with Inngest Cloud. Server-to-server only — the
 * auth middleware allows /api/inngest through; Inngest authenticates via its
 * signing key (INNGEST_SIGNING_KEY).
 */
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...inngestFunctions],
});
