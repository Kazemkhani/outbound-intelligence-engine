import type { CompanyFacts, ContactFacts, ScoringSubject, SignalFact } from "@oie/core";
import type { NormalisedCompany, NormalisedContact, NormalisedSignal } from "@oie/integrations";

/**
 * Bridge from the adapters' normalised output (the unified data model) into the
 * scoring engine's narrow `ScoringSubject` view. Lives here, not in @oie/core,
 * so the pure scoring package never depends on the integration layer.
 */

export function companyFactsFromNormalised(c: NormalisedCompany): CompanyFacts {
  return {
    industry: c.industry ?? null,
    employeeCount: c.employeeCount ?? null,
    revenueBand: c.revenueBand ?? null,
    country: c.country ?? null,
    region: c.region ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    localCategory: c.localCategory ?? null,
    techStack: c.techStack ?? null,
  };
}

export function contactFactsFromNormalised(c: NormalisedContact): ContactFacts {
  return {
    title: c.title ?? null,
    seniority: c.seniority ?? null,
    department: c.department ?? null,
  };
}

export function signalFactFromNormalised(s: NormalisedSignal): SignalFact {
  return {
    type: s.type,
    strength: s.strength,
    detectedAt: s.detectedAt,
    expiresAt: s.expiresAt ?? null,
    evidence: s.evidence,
  };
}

export function toScoringSubject(
  company: NormalisedCompany,
  contact: NormalisedContact | null,
  signals: NormalisedSignal[] = [],
): ScoringSubject {
  return {
    company: companyFactsFromNormalised(company),
    contact: contact ? contactFactsFromNormalised(contact) : {},
    signals: signals.map(signalFactFromNormalised),
  };
}
