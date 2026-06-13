import type { Channel, EmailStatus, Seniority, SignalType } from "@oie/core";

/**
 * Adapter-facing normalised DTOs. Every vendor adapter translates its payloads
 * INTO these shapes (and out of them for sends), so vendor shapes never leak
 * into the core or the persistence layer (brief §2.4). Field provenance is
 * recorded in `sources` so we always know which provider supplied which field.
 */

export type FieldSource = Record<string, string>; // field name -> provider name

export interface NormalisedCompany {
  domain: string | null;
  name: string;
  website?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  revenueBand?: string | null;
  country?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  localCategory?: string | null;
  techStack?: string[];
  funding?: Record<string, unknown> | null;
  socials?: Record<string, unknown> | null;
  sources?: FieldSource;
}

export interface NormalisedContact {
  companyDomain: string | null;
  fullName: string;
  title?: string | null;
  seniority?: Seniority | null;
  department?: string | null;
  email?: string | null;
  emailStatus?: EmailStatus;
  linkedinUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  sources?: FieldSource;
}

export interface NormalisedSignal {
  companyDomain?: string | null;
  contactEmail?: string | null;
  type: SignalType;
  strength: number; // 0..1 raw provider strength, pre-decay
  sourceUrl?: string | null;
  provider: string;
  evidence?: Record<string, unknown>;
  detectedAt: Date;
  expiresAt?: Date | null;
}

/** A unit of provider cost, recorded by every adapter call (brief §2.4, §7). */
export interface CostRecord {
  provider: string;
  task: string;
  units: number;
  costUsd: number;
  at: Date;
}

/** Context threaded into every adapter call. */
export interface AdapterContext {
  /** When true, send-capable adapters must NOT contact the provider (brief §3.5). */
  dryRun: boolean;
  /** Idempotency key — re-running with the same key must not duplicate or re-send. */
  idempotencyKey?: string;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
  /** Sink for cost accounting. */
  recordCost?: (record: CostRecord) => void;
}

export interface EnrichmentResult<T> {
  data: T | null;
  matched: boolean;
  provider: string;
  cost?: CostRecord;
}

// ── Send-path DTOs ───────────────────────────────────────────────────────────

export interface OutboundEmail {
  to: string;
  from: string;
  subject: string;
  body: string;
  campaignId?: string;
  /** Stable key so a re-run never sends twice. */
  idempotencyKey: string;
}

export interface OutboundMessage {
  channel: Extract<Channel, "linkedin" | "whatsapp">;
  toHandle: string;
  body: string;
  idempotencyKey: string;
}

export type SendOutcome = "sent" | "dry_run" | "skipped";

export interface SendResult {
  outcome: SendOutcome;
  externalId?: string;
  provider: string;
  /** Populated when outcome is "dry_run" — explains what WOULD have been sent. */
  preview?: string;
}

export interface CrmRef {
  provider: string;
  objectType: "company" | "contact" | "deal";
  externalId: string;
  created: boolean;
}
