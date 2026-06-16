import { prisma } from "@oie/db";
import type { SignalType, Tier } from "@oie/core";
import { inngest } from "../sequencing/inngest";
import { qualifiesForEnrolment } from "./auto-enrol";
import type { EnrolmentPolicy } from "./auto-enrol";
import { costCapStatus } from "./cost-caps";
import type { CostCaps, DailySpend } from "./cost-caps";

/**
 * Inngest durable functions for signal-triggered auto-enrolment and durable
 * suppression (brief §11 Phase 9, §3.5).
 *
 * Auto-enrolment never sends — it only creates the Enrolment row and writes an
 * AuditLog entry. The first send still routes through evaluateSendGate inside
 * executeSendStep, which requires DRY_RUN to be off AND a human approval.
 *
 * Suppression is written durably to the Suppression table so every future
 * send-step (including replay) loads it from the DB and honours it.
 */

// ── Event payload shapes ──────────────────────────────────────────────────────

export interface SignalDetectedPayload {
  /** The contact that triggered the signal. */
  contactId: string;
  /** The type of signal detected. */
  signal: SignalType;
  /** The contact's current score tier. */
  tier: Tier;
  /** The sequence to enrol the contact into when qualified. */
  sequenceId: string;
  /**
   * Optional: ISO timestamp when the signal expires. When absent the signal is
   * treated as non-expiring (qualifiesForEnrolment handles this).
   */
  signalExpiresAt?: string;
}

export interface EmailBouncedPayload {
  email: string;
  reason?: string;
}

export interface EmailUnsubscribedPayload {
  email: string;
  reason?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Read daily spend from ProviderCost for the current UTC day. */
async function readDailySpend(): Promise<DailySpend> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

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
    return { llmUsd: 0, providerUsd: 0 };
  }
}

function readCostCaps(): CostCaps {
  return {
    dailyLlmUsd: Number(process.env["DAILY_LLM_COST_CAP_USD"] ?? "25"),
    dailyProviderUsd: Number(process.env["DAILY_PROVIDER_COST_CAP_USD"] ?? "50"),
  };
}

/**
 * Default auto-enrolment policy. In production this would be read from a DB
 * config record; the defaults below cover the standard ICP bar (tier B+,
 * high-intent signal types).
 */
function defaultEnrolmentPolicy(): EnrolmentPolicy {
  return {
    minTier: "B",
    qualifyingTypes: ["hiring", "funding", "tech_adoption", "job_change"],
  };
}

// ── autoEnrolOnSignal ─────────────────────────────────────────────────────────

/**
 * `oie/signal.detected` — evaluate a fresh signal and auto-enrol the contact
 * when it qualifies under the enrolment policy.
 *
 * Steps:
 *   1. Check cost caps — skip (non-critical) if exceeded.
 *   2. Evaluate the signal via `qualifiesForEnrolment` (pure, no DB).
 *   3. If qualified, upsert the Enrolment row (idempotent on contactId+sequenceId).
 *   4. Write an AuditLog entry for the enrolment creation.
 *
 * The resulting Enrolment has status "active" but nothing is sent until the
 * `oie/sequence.enrol` function runs and passes through the send gate.
 */
export const autoEnrolOnSignal = inngest.createFunction(
  {
    id: "auto-enrol-on-signal",
    name: "Auto-enrol: signal detected",
    retries: 3,
  },
  { event: "oie/signal.detected" },
  async ({ event, step }) => {
    const payload = event.data as SignalDetectedPayload;

    // ── 1. Cost cap check ─────────────────────────────────────────────────
    const capResult = await step.run("check-cost-caps", async () => {
      const caps = readCostCaps();
      const spend = await readDailySpend();
      const status = costCapStatus(spend, caps);
      return { halt: status.halt, reason: status.reason };
    });

    if (capResult.halt) {
      // Non-critical work: log and skip — do not throw.
      await step.run("log-cap-halt", async () => {
        await prisma.auditLog.create({
          data: {
            actor: "orchestration",
            action: "auto-enrol.skipped.cost-cap",
            entity: "Contact",
            entityId: payload.contactId,
            payload: { reason: capResult.reason, signal: payload.signal, tier: payload.tier },
          },
        });
      });
      return { contactId: payload.contactId, enrolled: false, reason: capResult.reason };
    }

    // ── 2. Evaluate enrolment policy (pure) ───────────────────────────────
    const decision = await step.run("evaluate-policy", async () => {
      const policy = defaultEnrolmentPolicy();
      const now = new Date();
      const trigger = {
        signalType: payload.signal,
        signalExpiresAt: payload.signalExpiresAt ? new Date(payload.signalExpiresAt) : null,
        tier: payload.tier,
      };
      return qualifiesForEnrolment(trigger, policy, now);
    });

    if (!decision.enrol) {
      return { contactId: payload.contactId, enrolled: false, reason: decision.reason };
    }

    // ── 3. Upsert the Enrolment row (idempotent) ──────────────────────────
    const enrolment = await step.run("upsert-enrolment", async () => {
      const row = await prisma.enrolment.upsert({
        where: {
          contactId_sequenceId: {
            contactId: payload.contactId,
            sequenceId: payload.sequenceId,
          },
        },
        create: {
          contactId: payload.contactId,
          sequenceId: payload.sequenceId,
          status: "active",
          currentStep: 0,
        },
        update: {
          // If a stopped enrolment exists for this contact+sequence, re-activate it.
          // Active enrolments are left untouched (idempotent).
          status: "active",
          currentStep: 0,
          nextActionAt: null,
        },
        select: { id: true, status: true },
      });
      return row;
    });

    // ── 4. AuditLog ───────────────────────────────────────────────────────
    await step.run("write-audit-log", async () => {
      await prisma.auditLog.create({
        data: {
          actor: "orchestration",
          action: "enrolment.created",
          entity: "Enrolment",
          entityId: enrolment.id,
          payload: {
            contactId: payload.contactId,
            sequenceId: payload.sequenceId,
            signal: payload.signal,
            tier: payload.tier,
            reason: decision.reason,
          },
        },
      });
    });

    return {
      contactId: payload.contactId,
      enrolled: true,
      enrolmentId: enrolment.id,
      reason: decision.reason,
    };
  },
);

// ── handleSuppression — durable bounce / unsubscribe handler ─────────────────

/**
 * Triggered by `oie/email.bounced` and `oie/email.unsubscribed`.
 *
 * Steps:
 *   1. Upsert a Suppression row for the email address.
 *   2. Stop any active Enrolment for the contact with that email.
 *   3. Write AuditLog entries for the suppression and any stopped enrolments.
 *
 * Using upsert makes this idempotent — replaying the function never creates
 * duplicate suppression rows (the `email` column is @unique in the schema).
 *
 * Future sends are blocked because executeSendStep loads suppressions from the
 * DB (via `loadSuppressions` in the sequencing inngest.ts) and
 * `isSuppressionMatch` will match this email or its domain.
 */
export const handleSuppression = inngest.createFunction(
  {
    id: "handle-suppression",
    name: "Suppression: bounce or unsubscribe",
    retries: 5,
  },
  [{ event: "oie/email.bounced" }, { event: "oie/email.unsubscribed" }],
  async ({ event, step }) => {
    const isBounce = event.name === "oie/email.bounced";
    const payload = event.data as EmailBouncedPayload | EmailUnsubscribedPayload;
    const email = payload.email.toLowerCase().trim();
    const reason = isBounce ? (payload.reason ?? "bounced") : (payload.reason ?? "unsubscribed");

    // ── 1. Upsert Suppression row ─────────────────────────────────────────
    const suppression = await step.run("upsert-suppression", async () => {
      const row = await prisma.suppression.upsert({
        where: { email },
        create: { email, reason },
        // Keep the original reason if already suppressed (append-only posture).
        update: {},
        select: { id: true },
      });
      return { id: row.id };
    });

    // ── 2. Stop active enrolments for this contact ────────────────────────
    const stoppedEnrolments = await step.run("stop-active-enrolments", async () => {
      // Find the contact by email.
      const contact = await prisma.contact.findUnique({
        where: { email },
        select: { id: true },
      });

      if (!contact) return { count: 0, ids: [] as string[] };

      // Find all active enrolments for this contact.
      const active = await prisma.enrolment.findMany({
        where: { contactId: contact.id, status: "active" },
        select: { id: true },
      });

      if (active.length === 0) return { count: 0, ids: [] as string[] };

      const ids = active.map((e) => e.id);

      // Mark them all stopped.
      await prisma.enrolment.updateMany({
        where: { id: { in: ids } },
        data: { status: "stopped" },
      });

      return { count: ids.length, ids };
    });

    // ── 3. AuditLog for suppression + each stopped enrolment ─────────────
    await step.run("write-audit-logs", async () => {
      const suppressionAudit = prisma.auditLog.create({
        data: {
          actor: "orchestration",
          action: isBounce ? "suppression.bounce" : "suppression.unsubscribe",
          entity: "Suppression",
          entityId: suppression.id,
          payload: { email, reason },
        },
      });

      const enrolmentAudits = stoppedEnrolments.ids.map((enrolmentId) =>
        prisma.auditLog.create({
          data: {
            actor: "orchestration",
            action: "enrolment.stopped",
            entity: "Enrolment",
            entityId: enrolmentId,
            payload: {
              reason: `suppressed via ${isBounce ? "bounce" : "unsubscribe"} for ${email}`,
            },
          },
        }),
      );

      await Promise.all([suppressionAudit, ...enrolmentAudits]);
    });

    return {
      email,
      suppressionId: suppression.id,
      stoppedEnrolments: stoppedEnrolments.count,
    };
  },
);

// ── Exported function array ───────────────────────────────────────────────────

export const enrolmentFunctions = [autoEnrolOnSignal, handleSuppression] as const;
