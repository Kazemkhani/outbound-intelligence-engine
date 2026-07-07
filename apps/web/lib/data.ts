/**
 * Server-only data layer for the OIE control plane.
 *
 * Each exported function queries Prisma (Neon) and returns the same shapes
 * that lib/fixtures.ts exposes. If the database is unreachable or empty,
 * it falls back to the existing fixture data so that local dev and `next build`
 * stay green without a live database connection.
 *
 * IMPORTANT: This file must only be imported in Server Components or server
 * actions. Never import it into a "use client" module.
 */

import { prisma } from "@oie/db";
import { icpProfile } from "@oie/core";
import { scoreLead } from "@oie/core";
import type { IcpProfile, ScoringSubject } from "@oie/core";

import {
  SEED_ICP,
  FIXTURE_LEADS,
  FIXTURE_SIGNAL_FEED,
  FIXTURE_APPROVALS,
  type FixtureLead,
  type ScoredLead,
  type SignalFeedItem,
  type ApprovalItem,
  type AnalyticsTiles,
  type CrmStatus,
  scoreAndRankLeads,
} from "./fixtures";

const NOW = new Date();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Safely attempt a DB query; return null on any error. */
async function tryDb<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ── Active ICP ────────────────────────────────────────────────────────────────

/**
 * Returns the active IcpProfile from the database, or the seed fixture if the
 * DB is unavailable or has no active profile.
 */
export async function getActiveIcp(): Promise<IcpProfile> {
  const row = await tryDb(() =>
    prisma.icpProfile.findFirst({
      where: { active: true },
      orderBy: { updatedAt: "desc" },
    }),
  );

  if (!row) return SEED_ICP;

  const configObj =
    row.config !== null && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};

  const parsed = icpProfile.safeParse({
    ...configObj,
    id: row.id,
    name: row.name,
    version: row.version,
    active: row.active,
  });
  if (!parsed.success) return SEED_ICP;
  return parsed.data;
}

// ── Leads ─────────────────────────────────────────────────────────────────────

/**
 * Build the FixtureLead shape from a DB contact row (with company + signals
 * included). Returns null if the row is missing required fields.
 */
function mapDbContactToFixtureLead(
  contact: {
    id: string;
    fullName: string;
    title: string | null;
    seniority: string | null;
    department: string | null;
    email: string | null;
    emailStatus: string;
    linkedinUrl: string | null;
    crmStatus: string;
    notes: string | null;
    company: {
      id: string;
      name: string;
      domain: string | null;
      industry: string | null;
      employeeCount: number | null;
      country: string | null;
      region: string | null;
      lat: number | null;
      lng: number | null;
      localCategory: string | null;
      techStack: string[];
      website: string | null;
    } | null;
    signals: Array<{
      id: string;
      type: string;
      strength: number;
      provider: string;
      sourceUrl: string | null;
      evidence: unknown;
      detectedAt: Date;
      expiresAt: Date | null;
    }>;
  },
  idx: number,
): FixtureLead | null {
  if (!contact.company) return null;

  return {
    id: `lead-db-${idx}`,
    crmStatus: (contact.crmStatus as CrmStatus) ?? "new",
    notes: contact.notes ?? null,
    company: {
      id: contact.company.id,
      name: contact.company.name,
      domain: contact.company.domain ?? "",
      industry: contact.company.industry ?? "unknown",
      employeeCount: contact.company.employeeCount ?? 0,
      country: contact.company.country ?? "AE",
      region: contact.company.region ?? "",
      lat: contact.company.lat ?? 0,
      lng: contact.company.lng ?? 0,
      localCategory: contact.company.localCategory ?? "",
      techStack: contact.company.techStack ?? [],
      website: contact.company.website ?? "",
    },
    contact: {
      id: contact.id,
      fullName: contact.fullName,
      title: contact.title ?? "",
      seniority: (contact.seniority as FixtureLead["contact"]["seniority"]) ?? "ic",
      department: contact.department ?? "",
      email: contact.email ?? "",
      emailStatus: (contact.emailStatus as FixtureLead["contact"]["emailStatus"]) ?? "unknown",
      linkedinUrl: contact.linkedinUrl ?? "",
    },
    signals: contact.signals.map((s) => ({
      id: s.id,
      type: s.type as FixtureLead["signals"][number]["type"],
      strength: s.strength,
      provider: s.provider,
      sourceUrl: s.sourceUrl ?? "",
      evidence: (s.evidence as Record<string, unknown>) ?? {},
      detectedAt: s.detectedAt,
      expiresAt: s.expiresAt ?? new Date(s.detectedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    })),
  };
}

/**
 * Returns all leads scored and ranked by composite score against the active ICP.
 * Falls back to fixture data if the DB is unreachable or returns no rows.
 */
export async function getLeads(): Promise<ScoredLead[]> {
  const icp = await getActiveIcp();

  const rows = await tryDb(() =>
    prisma.contact.findMany({
      select: {
        id: true,
        fullName: true,
        title: true,
        seniority: true,
        department: true,
        email: true,
        emailStatus: true,
        linkedinUrl: true,
        crmStatus: true,
        notes: true,
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            industry: true,
            employeeCount: true,
            country: true,
            region: true,
            lat: true,
            lng: true,
            localCategory: true,
            techStack: true,
            website: true,
          },
        },
        signals: {
          select: {
            id: true,
            type: true,
            strength: true,
            provider: true,
            sourceUrl: true,
            evidence: true,
            detectedAt: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  if (!rows || rows.length === 0) {
    return [];
  }

  const fixtureLeads = rows
    .map((row, idx) => mapDbContactToFixtureLead(row, idx))
    .filter((l): l is FixtureLead => l !== null);

  if (fixtureLeads.length === 0) {
    return [];
  }

  const scored: ScoredLead[] = fixtureLeads.map((lead) => {
    const subject: ScoringSubject = {
      company: {
        industry: lead.company.industry,
        employeeCount: lead.company.employeeCount,
        country: lead.company.country,
        region: lead.company.region,
        lat: lead.company.lat,
        lng: lead.company.lng,
        localCategory: lead.company.localCategory,
        techStack: lead.company.techStack,
      },
      contact: {
        title: lead.contact.title,
        seniority: lead.contact.seniority,
        department: lead.contact.department,
      },
      signals: lead.signals.map((s) => ({
        type: s.type,
        strength: s.strength,
        detectedAt: s.detectedAt,
        expiresAt: s.expiresAt,
        evidence: s.evidence,
      })),
    };
    return { ...lead, score: scoreLead(subject, icp, NOW) };
  });

  return scored.sort((a, b) => b.score.composite - a.score.composite);
}

// ── Signal feed ───────────────────────────────────────────────────────────────

/**
 * Returns recent signals with company and contact attribution, most recent first.
 * Falls back to fixture data if the DB is unreachable or returns no rows.
 */
export async function getSignals(): Promise<SignalFeedItem[]> {
  const rows = await tryDb(() =>
    prisma.signal.findMany({
      orderBy: { detectedAt: "desc" },
      take: 100,
      include: {
        company: { select: { name: true } },
        contact: { select: { fullName: true } },
      },
    }),
  );

  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((s) => ({
    id: s.id,
    companyName: s.company?.name ?? "Unknown company",
    contactName: s.contact?.fullName ?? "Unknown contact",
    type: s.type as SignalFeedItem["type"],
    strength: s.strength,
    provider: s.provider,
    sourceUrl: s.sourceUrl ?? "",
    evidence: (s.evidence as Record<string, unknown>) ?? {},
    detectedAt: s.detectedAt,
    expiresAt: s.expiresAt ?? new Date(s.detectedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
  }));
}

// ── Approval queue ────────────────────────────────────────────────────────────

/**
 * Returns messages with status = "awaiting_approval", joined with contact and
 * company via the enrolment chain. Falls back to fixture data.
 */
export async function getApprovals(): Promise<ApprovalItem[]> {
  const rows = await tryDb(() =>
    prisma.message.findMany({
      where: { status: "awaiting_approval" },
      orderBy: { createdAt: "asc" },
      include: {
        enrolment: {
          include: {
            contact: {
              select: {
                fullName: true,
                company: { select: { name: true } },
              },
            },
            sequence: { select: { name: true } },
          },
        },
      },
    }),
  );

  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((msg, idx): ApprovalItem => {
    const contact = msg.enrolment?.contact;
    const sequence = msg.enrolment?.sequence;
    return {
      id: msg.id,
      leadId: msg.enrolmentId ?? `lead-db-${idx}`,
      contactName: contact?.fullName ?? "Unknown contact",
      companyName: contact?.company?.name ?? "Unknown company",
      channel: msg.channel as ApprovalItem["channel"],
      subject: "",
      body: msg.body ?? "",
      sequenceName: sequence?.name ?? "Unknown sequence",
      step: msg.enrolment?.currentStep ?? 1,
      queuedAt: msg.createdAt,
      status: "awaiting_approval",
    };
  });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Returns analytics tile data: lead counts by tier, signals this week, and
 * pending approvals. Falls back to fixture calculations if the DB is
 * unreachable.
 */
export async function getAnalytics(): Promise<AnalyticsTiles> {
  const weekAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [scores, signalCount, pendingCount, costRows] = await Promise.all([
    tryDb(() =>
      prisma.score.findMany({
        select: {
          tier: true,
          composite: true,
          contact: { select: { fullName: true, company: { select: { name: true } } } },
        },
        orderBy: { composite: "desc" },
      }),
    ),
    tryDb(() =>
      prisma.signal.count({
        where: { detectedAt: { gte: weekAgo } },
      }),
    ),
    tryDb(() =>
      prisma.message.count({
        where: { status: "awaiting_approval" },
      }),
    ),
    tryDb(() =>
      prisma.providerCost.aggregate({
        _sum: { costUsd: true },
      }),
    ),
  ]);

  // If all DB queries failed, fall back to fixtures
  if (scores === null && signalCount === null && pendingCount === null) {
    const byTier = { A: 0, B: 0, C: 0, D: 0 };
    const fixtureLeads = scoreAndRankLeads(SEED_ICP, NOW);
    for (const lead of fixtureLeads) {
      byTier[lead.score.tier]++;
    }
    const signalsThisWeek = FIXTURE_SIGNAL_FEED.filter((s) => s.detectedAt >= weekAgo).length;
    const pendingApprovals = FIXTURE_APPROVALS.filter(
      (a) => a.status === "awaiting_approval",
    ).length;
    return {
      totalLeads: fixtureLeads.length,
      byTier,
      signalsThisWeek,
      pendingApprovals,
      estimatedCostUsd: 0,
    };
  }

  // Use DB data with fixture fallbacks per field
  const byTier = { A: 0, B: 0, C: 0, D: 0 };
  let totalLeads = 0;

  if (scores && scores.length > 0) {
    for (const s of scores) {
      byTier[s.tier as keyof typeof byTier]++;
    }
    totalLeads = scores.length;
  } else {
    // Scores table empty — derive from fixture leads scored against active ICP
    const icp = await getActiveIcp();
    const fixtureLeads = FIXTURE_LEADS;
    for (const lead of fixtureLeads) {
      const subject: ScoringSubject = {
        company: {
          industry: lead.company.industry,
          employeeCount: lead.company.employeeCount,
          country: lead.company.country,
          region: lead.company.region,
          lat: lead.company.lat,
          lng: lead.company.lng,
          localCategory: lead.company.localCategory,
          techStack: lead.company.techStack,
        },
        contact: {
          title: lead.contact.title,
          seniority: lead.contact.seniority,
          department: lead.contact.department,
        },
        signals: lead.signals.map((s) => ({
          type: s.type,
          strength: s.strength,
          detectedAt: s.detectedAt,
          expiresAt: s.expiresAt,
          evidence: s.evidence,
        })),
      };
      const score = scoreLead(subject, icp, NOW);
      byTier[score.tier]++;
    }
    totalLeads = fixtureLeads.length;
  }

  return {
    totalLeads,
    byTier,
    signalsThisWeek:
      signalCount ?? FIXTURE_SIGNAL_FEED.filter((s) => s.detectedAt >= weekAgo).length,
    pendingApprovals:
      pendingCount ?? FIXTURE_APPROVALS.filter((a) => a.status === "awaiting_approval").length,
    estimatedCostUsd: costRows?._sum?.costUsd ?? 0,
  };
}

// ── Call sessions (NOVA voice) ──────────────────────────────────────────────────

/**
 * A single structured finding captured by NOVA during a call, flattened for the
 * UI. Mirrors the CallFinding master-DB model.
 */
export type CallFindingView = {
  id: string;
  key: string;
  value: string;
  confidence: number | null;
  source: string;
  capturedAt: Date;
};

/**
 * UI-facing shape for a voice call session: the CallSession row plus its
 * findings and flattened company/contact attribution (name + phone). This is the
 * only type the call-session UI should consume — it never sees raw Prisma rows.
 */
export type CallSessionView = {
  id: string;
  novaCallId: string;
  novaContextId: string | null;
  status: string;
  goal: string;
  language: string;
  demoMode: boolean;
  outcome: string | null;
  summary: string | null;
  transcript: string | null;
  costUsd: number | null;
  consent: boolean;
  consentBasis: string | null;
  optOut: boolean;
  contactId: string | null;
  companyId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  companyName: string | null;
  placedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  findings: CallFindingView[];
};

/**
 * Returns recent voice call sessions, newest first, each with its structured
 * findings and the related contact (name + phone) and company (name).
 *
 * Unlike leads/signals/approvals there is no fixture fallback for calls: voice
 * outcomes are facts produced by NOVA, so on a DB error or empty table we return
 * an empty list rather than fabricating call data.
 *
 * @param limit Maximum number of sessions to return (default 50).
 */
export async function getCallSessions(limit = 50): Promise<CallSessionView[]> {
  const rows = await tryDb(() =>
    prisma.callSession.findMany({
      orderBy: { placedAt: "desc" },
      take: limit,
      include: {
        contact: { select: { fullName: true, phone: true, whatsapp: true } },
        company: { select: { name: true } },
        findings: {
          orderBy: { capturedAt: "asc" },
          select: {
            id: true,
            key: true,
            value: true,
            confidence: true,
            source: true,
            capturedAt: true,
          },
        },
      },
    }),
  );

  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({
    id: row.id,
    novaCallId: row.novaCallId,
    novaContextId: row.novaContextId ?? null,
    status: row.status,
    goal: row.goal,
    language: row.language,
    demoMode: row.demoMode,
    outcome: row.outcome ?? null,
    summary: row.summary ?? null,
    transcript: row.transcript ?? null,
    costUsd: row.costUsd ?? null,
    consent: row.consent,
    consentBasis: row.consentBasis ?? null,
    optOut: row.optOut,
    contactId: row.contactId ?? null,
    companyId: row.companyId ?? null,
    contactName: row.contact?.fullName ?? null,
    contactPhone: row.contact?.phone ?? row.contact?.whatsapp ?? null,
    companyName: row.company?.name ?? null,
    placedAt: row.placedAt,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    findings: row.findings.map((f) => ({
      id: f.id,
      key: f.key,
      value: f.value,
      confidence: f.confidence ?? null,
      source: f.source,
      capturedAt: f.capturedAt,
    })),
  }));
}
