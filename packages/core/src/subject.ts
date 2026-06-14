import type { Seniority, SignalType } from "./types";

/**
 * The facts a lead presents to the scoring engine. Deliberately a narrow,
 * provider-agnostic view of the unified data model — adapters normalise their
 * payloads into these shapes, and the engine never sees a vendor field. Every
 * field is optional: missing data scores zero and is recorded as `unknown`
 * (scoring-conventions), it is never guessed.
 */

export interface CompanyFacts {
  industry?: string | null;
  employeeCount?: number | null;
  revenueBand?: string | null;
  country?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  localCategory?: string | null;
  techStack?: string[] | null;
}

export interface ContactFacts {
  title?: string | null;
  seniority?: Seniority | null;
  department?: string | null;
}

export interface SignalFact {
  type: SignalType;
  /** Raw provider strength, 0..1, before time decay. */
  strength: number;
  detectedAt: Date;
  expiresAt?: Date | null;
  evidence?: Record<string, unknown>;
}

export interface ScoringSubject {
  company: CompanyFacts;
  contact: ContactFacts;
  signals: SignalFact[];
}
