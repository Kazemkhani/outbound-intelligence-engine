export * from "./send-gate";
export * from "./waterfall";
export * from "./collect-signals";
export * from "./scoring-bridge";
export * from "./sequencing/index";
export * from "./enrolment/index";

// ── Top-level convenience exports required by the web app ─────────────────────

/**
 * Re-export the shared Inngest client. The web app (apps/web) imports this to
 * wire the serve handler: `serve({ client: inngest, functions: inngestFunctions })`.
 */
export { inngest } from "./sequencing/inngest";

/**
 * All Inngest functions in the system — sequencing cadence, auto-enrolment, and
 * suppression. Pass this array to the Inngest serve handler at startup.
 *
 * Import shape:  import { inngest, inngestFunctions } from '@oie/orchestration'
 */
import { sequencingFunctions } from "./sequencing/inngest";
import { enrolmentFunctions } from "./enrolment/inngest";

export const inngestFunctions = [...sequencingFunctions, ...enrolmentFunctions] as const;
