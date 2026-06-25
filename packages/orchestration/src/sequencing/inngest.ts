import { Inngest } from "inngest";
import { prisma } from "@oie/db";
import type { ApprovalState } from "../send-gate";
import { advance, nextDueAt, shouldStop } from "./state-machine";
import type { EnrolmentState, SequenceEvent, SequenceStep } from "./state-machine";
import { executeSendStep } from "./send-step";
import type { SendStepParams, SuppressionRecord } from "./send-step";
import { SEND_APPROVED_EVENT, approvalFromEvent } from "./approval";
import type { EmailSender, MessagingChannel } from "@oie/integrations";
import { costCapStatus } from "../enrolment/cost-caps";
import type { DailySpend, CostCaps } from "../enrolment/cost-caps";

/**
 * Inngest durable function definitions for the sequencing engine (brief §11 Phase 7).
 *
 * Every step is wrapped in `step.run` so Inngest memoises the result on replay —
 * a re-run after a transient failure re-executes only the steps that have not yet
 * completed, making every pipeline operation idempotent under replay.
 *
 * `step.sleepUntil` holds the execution without consuming a worker thread until
 * the next action is due, giving us durable multi-day cadences for free.
 *
 * The DRY_RUN gate and approval check are enforced inside `executeSendStep` on
 * EVERY execution, including replays — they are never memoised away.
 *
 * This file is typecheck-only: it does not require a running Inngest server.
 */

// ── Inngest client ────────────────────────────────────────────────────────────

/**
 * Shared Inngest client. The event schema is intentionally untyped at the
 * client level; each function narrows the payload it accepts via its trigger.
 *
 * `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are wired at the server-serve
 * layer (not here) so this file never reads process.env directly.
 */
export const inngest = new Inngest({ id: "oie" });

// ── Event payload shapes ──────────────────────────────────────────────────────

export interface EnrolContactPayload {
  /** The enrolment record ID from the DB. */
  enrolmentId: string;
  /** The contact's email address (for email channel steps). */
  contactEmail?: string;
  /** The contact's social handle (for LinkedIn/WhatsApp steps). */
  contactHandle?: string;
  /** The from-address to use for email steps. */
  fromEmail?: string;
  /** The ordered sequence steps. */
  steps: SequenceStep[];
  /**
   * Pre-rendered bodies keyed by templateId. The rendering pipeline runs
   * upstream; this function only dispatches.
   */
  bodies: Record<string, string>;
  /**
   * Pre-rendered subjects keyed by templateId (email only).
   */
  subjects?: Record<string, string>;
  /** System-wide dry-run flag. Defaults true. */
  dryRun: boolean;
  /** Human approval state for the entire enrolment's sends (may be overridden per-step). */
  approval: ApprovalState;
  /** Per-channel enabled flags. */
  channelEnabled: Record<string, boolean>;
  /**
   * Suppression list: if present in the payload it is used as-is.
   * If absent the function fetches from the DB on each stop-check.
   * Providing it in the payload avoids repeated DB reads for short cadences.
   */
  suppressions?: SuppressionRecord[];
  /** Branching context — flat key/value facts projected from contact + score. */
  branchContext?: Record<string, unknown>;
}

export interface StopEnrolmentPayload {
  enrolmentId: string;
  reason: string;
}

// ── Adapter injection ─────────────────────────────────────────────────────────

/**
 * Adapters are injected at serve-time rather than imported here. This keeps
 * the function file free of provider credentials and allows test doubles to be
 * swapped in without patching the module graph.
 *
 * Call `registerAdapters` once at application startup before serving functions.
 */
interface AdapterRegistry {
  emailSender?: EmailSender;
  messagingChannels?: Partial<Record<"linkedin" | "whatsapp", MessagingChannel>>;
}

let registry: AdapterRegistry = {};

export function registerAdapters(adapters: AdapterRegistry): void {
  registry = adapters;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Read the accumulated provider spend for the current UTC calendar day from
 * ProviderCost and return a DailySpend object. Any DB error is caught and a
 * zero-spend value is returned so the cap never causes a false halt on a DB
 * hiccup — it will re-check on the next step.
 */
async function readDailySpend(): Promise<DailySpend> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    // ProviderCost does not have a `type` column — we distinguish LLM spend by
    // provider name convention ("openai", "anthropic") and everything else is
    // provider spend.
    const [llmAgg, providerAgg] = await Promise.all([
      prisma.providerCost.aggregate({
        _sum: { costUsd: true },
        where: {
          at: { gte: startOfDay },
          provider: { in: ["openai", "anthropic"] },
        },
      }),
      prisma.providerCost.aggregate({
        _sum: { costUsd: true },
        where: {
          at: { gte: startOfDay },
          provider: { notIn: ["openai", "anthropic"] },
        },
      }),
    ]);

    return {
      llmUsd: llmAgg._sum.costUsd ?? 0,
      providerUsd: providerAgg._sum.costUsd ?? 0,
    };
  } catch {
    // Non-critical — return zero so we do not halt on a transient DB error.
    return { llmUsd: 0, providerUsd: 0 };
  }
}

/** Read cost caps from env; non-critical path so defaults are generous. */
function readCostCaps(): CostCaps {
  return {
    dailyLlmUsd: Number(process.env["DAILY_LLM_COST_CAP_USD"] ?? "25"),
    dailyProviderUsd: Number(process.env["DAILY_PROVIDER_COST_CAP_USD"] ?? "50"),
  };
}

/**
 * Load SequenceEvents for an enrolment from the DB.
 *
 * We look for inbound Message rows (replies) and outbound bounced/failed rows
 * associated with the enrolment, then map them onto the SequenceEvent interface
 * so `shouldStop` can evaluate them.
 *
 * Additionally we check whether the contact is on the suppression list (which
 * covers email-level and domain-level suppression written by the suppression
 * handler), treating any active suppression as an unsubscribe event.
 */
async function loadStopEvents(enrolmentId: string): Promise<SequenceEvent[]> {
  const events: SequenceEvent[] = [];

  const messages = await prisma.message.findMany({
    where: {
      enrolmentId,
      OR: [
        { direction: "inbound" },
        { direction: "outbound", status: { in: ["bounced", "replied"] } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { direction: true, status: true, channel: true, createdAt: true },
  });

  for (const msg of messages) {
    const occurredAt = msg.createdAt;
    if (msg.direction === "inbound" || msg.status === "replied") {
      events.push({ type: "reply", channel: msg.channel, occurredAt });
    } else if (msg.status === "bounced") {
      events.push({ type: "bounce", channel: msg.channel, occurredAt });
    }
  }

  // Also check the Enrolment's contact email against the suppression table.
  const enrolment = await prisma.enrolment.findUnique({
    where: { id: enrolmentId },
    select: { contact: { select: { email: true } }, status: true },
  });

  if (enrolment?.status === "stopped") {
    events.push({ type: "manual_stop", occurredAt: new Date() });
    return events;
  }

  if (enrolment?.contact?.email) {
    const email = enrolment.contact.email;
    const domain = email.split("@")[1];
    const suppression = await prisma.suppression.findFirst({
      where: {
        OR: [{ email: email.toLowerCase() }, ...(domain ? [{ domain: domain.toLowerCase() }] : [])],
      },
    });
    if (suppression) {
      events.push({ type: "unsubscribe", occurredAt: new Date() });
    }
  }

  return events;
}

/**
 * Load the current suppression list from the DB for use in executeSendStep.
 * This is called once per cadence execution so is memoised in the step.run
 * block alongside the pre-sleep stop check.
 */
async function loadSuppressions(): Promise<SuppressionRecord[]> {
  const rows = await prisma.suppression.findMany({
    select: { email: true, domain: true, reason: true },
  });
  return rows.map((r) => ({
    email: r.email ?? undefined,
    domain: r.domain ?? undefined,
    reason: r.reason,
  }));
}

// ── runEnrolment — the durable cadence function ───────────────────────────────

/**
 * `oie/sequence.enrol` — enrol a contact into a multi-step outbound cadence.
 *
 * Execution model:
 *   for each step:
 *     1. Check stop events (step.run) — query DB for inbound reply/bounce/unsub;
 *        halt immediately if found. Also checks cost caps.
 *     2. Sleep until the step is due (step.sleepUntil).
 *     3. Re-check stop events — a reply may have arrived during the sleep.
 *     4. Execute the send-step (step.run) — gate enforced inside; write AuditLog.
 *     5. Advance the state machine (step.run) — update currentStep + nextActionAt.
 *
 * Each `step.run` block is memoised by Inngest on replay, so re-runs after
 * transient failures only execute the remaining steps.
 */
export const runEnrolment = inngest.createFunction(
  {
    id: "sequence-enrol",
    name: "Sequence: enrol contact",
    retries: 3,
    // Declarative safety rails (NX4): at most one live run per enrolment (no
    // double-sends from a duplicate trigger), and a global throughput throttle so
    // a burst of enrolments cannot exceed a sane send rate. These are belt for the
    // send-gate's braces; the gate still decides every individual send.
    concurrency: [{ key: "event.data.enrolmentId", limit: 1 }],
    throttle: { limit: 50, period: "1m" },
    cancelOn: [
      {
        event: "oie/sequence.stop",
        if: "event.data.enrolmentId == async.data.enrolmentId",
      },
    ],
  },
  { event: "oie/sequence.enrol" },
  async ({ event, step }) => {
    const payload = event.data as EnrolContactPayload;

    // event.ts is number | undefined in Inngest's type; fall back to now.
    const eventTs = typeof event.ts === "number" ? event.ts : Date.now();

    let state: EnrolmentState = {
      currentStep: 0,
      status: "active",
      lastActionAt: new Date(eventTs),
      nextActionAt:
        payload.steps[0] !== undefined ? nextDueAt(payload.steps[0], new Date(eventTs)) : null,
    };

    const results: Array<{
      stepIndex: number;
      outcome: string;
      idempotencyKey: string;
    }> = [];

    for (let i = 0; i < payload.steps.length; i++) {
      const sequenceStep = payload.steps[i];
      if (sequenceStep === undefined) break;

      // ── 1. Pre-sleep stop check (DB query + cost cap) ───────────────────
      const preSleepResult = await step.run(`check-stop-pre-sleep-step-${i}`, async () => {
        // Cost cap guard — halt non-critical work when daily caps are exceeded.
        const caps = readCostCaps();
        const spend = await readDailySpend();
        const capStatus = costCapStatus(spend, caps);
        if (capStatus.halt) {
          return { stop: true, reason: `cost cap exceeded: ${capStatus.reason}` };
        }

        // Load real reply/bounce/unsubscribe events from DB.
        const dbEvents = await loadStopEvents(payload.enrolmentId);
        const stopAction = shouldStop(state, dbEvents);
        if (stopAction !== null) {
          return { stop: true, reason: stopAction.kind === "stopped" ? stopAction.reason : "halt" };
        }
        return { stop: false, reason: "" };
      });

      if (preSleepResult.stop) {
        // Persist stopped status to DB.
        await step.run(`persist-stop-pre-sleep-step-${i}`, async () => {
          await prisma.enrolment.update({
            where: { id: payload.enrolmentId },
            data: { status: "stopped" },
          });
          await prisma.auditLog.create({
            data: {
              actor: "orchestration",
              action: "enrolment.stopped",
              entity: "Enrolment",
              entityId: payload.enrolmentId,
              payload: { reason: preSleepResult.reason, stepIndex: i, phase: "pre-sleep" },
            },
          });
        });
        state = { ...state, status: "stopped", nextActionAt: null };
        results.push({
          stepIndex: i,
          outcome: "stopped",
          idempotencyKey: `enrolment:${payload.enrolmentId}:step:${i}:channel:${sequenceStep.channel}`,
        });
        break;
      }

      // ── 2. Sleep until the step is due ──────────────────────────────────
      const dueAt = nextDueAt(sequenceStep, state.lastActionAt);
      await step.sleepUntil(`sleep-step-${i}`, dueAt);

      // ── 3. Post-sleep stop check ─────────────────────────────────────────
      const postSleepResult = await step.run(`check-stop-post-sleep-step-${i}`, async () => {
        const dbEvents = await loadStopEvents(payload.enrolmentId);
        const stopAction = shouldStop(state, dbEvents);
        if (stopAction !== null) {
          return { stop: true, reason: stopAction.kind === "stopped" ? stopAction.reason : "halt" };
        }
        return { stop: false, reason: "" };
      });

      if (postSleepResult.stop) {
        await step.run(`persist-stop-post-sleep-step-${i}`, async () => {
          await prisma.enrolment.update({
            where: { id: payload.enrolmentId },
            data: { status: "stopped" },
          });
          await prisma.auditLog.create({
            data: {
              actor: "orchestration",
              action: "enrolment.stopped",
              entity: "Enrolment",
              entityId: payload.enrolmentId,
              payload: { reason: postSleepResult.reason, stepIndex: i, phase: "post-sleep" },
            },
          });
        });
        state = { ...state, status: "stopped", nextActionAt: null };
        results.push({
          stepIndex: i,
          outcome: "stopped",
          idempotencyKey: `enrolment:${payload.enrolmentId}:step:${i}:channel:${sequenceStep.channel}`,
        });
        break;
      }

      // ── 4. Execute the send-step ─────────────────────────────────────────
      // Load DB suppressions if not provided in the payload snapshot.
      const suppressions: SuppressionRecord[] = await step.run(
        `load-suppressions-step-${i}`,
        async () => {
          if (payload.suppressions !== undefined) return payload.suppressions;
          return loadSuppressions();
        },
      );

      // Durable human approval (NX3). Only suspend when a real send is possible:
      // in DRY_RUN (the default everywhere) we skip the wait and simulate exactly
      // as before. When DRY_RUN is off and the action is not pre-approved, the run
      // suspends at zero idle cost until the Close Room emits the approval event,
      // matched to this enrolment. On resume, executeSendStep STILL re-checks the
      // send-gate, so DRY_RUN flipping back on yields a simulate, never a send.
      let approval: ApprovalState = payload.approval;
      if (!payload.dryRun && approval !== "approved") {
        const approvalEvent = await step.waitForEvent(`await-approval-step-${i}`, {
          event: SEND_APPROVED_EVENT,
          timeout: "3d",
          match: "data.enrolmentId",
        });
        approval = approvalFromEvent(approvalEvent, payload.approval);
      }

      const sendParams: SendStepParams = {
        step: sequenceStep,
        stepIndex: i,
        enrolmentId: payload.enrolmentId,
        recipientEmail: payload.contactEmail,
        recipientHandle: payload.contactHandle,
        fromEmail: payload.fromEmail,
        subject: payload.subjects?.[sequenceStep.templateId],
        body: payload.bodies[sequenceStep.templateId] ?? "",
        dryRun: payload.dryRun,
        approval,
        channelEnabled: payload.channelEnabled[sequenceStep.channel] ?? false,
        suppressions,
        emailSender: registry.emailSender,
        messagingChannel:
          sequenceStep.channel === "linkedin" || sequenceStep.channel === "whatsapp"
            ? registry.messagingChannels?.[sequenceStep.channel]
            : undefined,
      };

      const sendResult = await step.run(`send-step-${i}`, async () => {
        const result = await executeSendStep(sendParams);

        // Persist the Message record and AuditLog entry regardless of outcome.
        const messageStatus = result.message.status;
        await prisma.message.create({
          data: {
            enrolmentId: payload.enrolmentId,
            channel: result.message.channel,
            direction: "outbound",
            status: messageStatus,
            body: result.message.body,
            templateId: result.message.templateId,
            externalId: result.idempotencyKey,
          },
        });

        await prisma.auditLog.create({
          data: {
            actor: "orchestration",
            action: `message.${result.outcome}`,
            entity: "Message",
            entityId: result.idempotencyKey,
            payload: {
              enrolmentId: payload.enrolmentId,
              stepIndex: i,
              channel: sequenceStep.channel,
              outcome: result.outcome,
              gateOutcome: result.gateDecision.outcome,
              reason: result.reason,
            },
          },
        });

        return {
          outcome: result.outcome,
          idempotencyKey: result.idempotencyKey,
        };
      });

      results.push({
        stepIndex: i,
        outcome: sendResult.outcome,
        idempotencyKey: sendResult.idempotencyKey,
      });

      // ── 5. Advance the state machine ─────────────────────────────────────
      // step.run serialises its return value through JSON, so Date fields
      // come back as strings. We reconstruct them explicitly here.
      const advanced = await step.run(`advance-state-step-${i}`, async () => {
        const result = advance(state, payload.steps, new Date());

        // Persist the updated enrolment step pointer to the DB.
        await prisma.enrolment.update({
          where: { id: payload.enrolmentId },
          data: {
            currentStep: result.next.currentStep,
            status: result.next.status,
            nextActionAt: result.next.nextActionAt ?? undefined,
          },
        });

        return {
          action: result.action,
          next: {
            ...result.next,
            lastActionAt: result.next.lastActionAt.toISOString(),
            nextActionAt: result.next.nextActionAt?.toISOString() ?? null,
          },
        };
      });

      state = {
        ...advanced.next,
        lastActionAt: new Date(advanced.next.lastActionAt),
        nextActionAt:
          advanced.next.nextActionAt !== null ? new Date(advanced.next.nextActionAt) : null,
      };

      if (state.status === "completed" || state.status === "stopped") {
        // Write completion AuditLog.
        await step.run("persist-completion", async () => {
          await prisma.auditLog.create({
            data: {
              actor: "orchestration",
              action: `enrolment.${state.status}`,
              entity: "Enrolment",
              entityId: payload.enrolmentId,
              payload: { finalStep: i, status: state.status },
            },
          });
        });
        break;
      }
    }

    return { enrolmentId: payload.enrolmentId, finalStatus: state.status, results };
  },
);

// ── stopEnrolment — forcibly halt an active cadence ──────────────────────────

/**
 * `oie/sequence.stop` — immediately halt an active enrolment.
 *
 * This is the manual-stop path for operators. Sending this event causes
 * `runEnrolment` to detect the stop on its next step check (via the DB
 * Enrolment.status field). The Inngest cancellation (`cancelOn`) also
 * terminates the runEnrolment function so no further sleeps will fire.
 */
export const stopEnrolment = inngest.createFunction(
  {
    id: "sequence-stop",
    name: "Sequence: stop enrolment",
    retries: 1,
  },
  { event: "oie/sequence.stop" },
  async ({ event, step }) => {
    const payload = event.data as StopEnrolmentPayload;

    await step.run("record-stop", async () => {
      // Write the stopped status to the DB so `loadStopEvents` picks it up
      // on the next runEnrolment step check.
      await prisma.enrolment.update({
        where: { id: payload.enrolmentId },
        data: { status: "stopped" },
      });

      await prisma.auditLog.create({
        data: {
          actor: "orchestration",
          action: "enrolment.stopped",
          entity: "Enrolment",
          entityId: payload.enrolmentId,
          payload: { reason: payload.reason, stoppedAt: new Date().toISOString() },
        },
      });

      return {
        enrolmentId: payload.enrolmentId,
        reason: payload.reason,
        stoppedAt: new Date().toISOString(),
      };
    });

    return { enrolmentId: payload.enrolmentId, status: "stopped" };
  },
);

// ── Exported function array (for serve handler) ───────────────────────────────

export const sequencingFunctions = [runEnrolment, stopEnrolment] as const;
