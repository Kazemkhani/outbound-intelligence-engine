/**
 * Deduplication keys for the unified data model (brief §10.2).
 * Companies dedupe on domain (+ placeId); contacts on email / linkedinUrl.
 * These helpers are pure so they can be unit-tested and reused by every adapter
 * and by the data-architect's normalisation layer — vendor shapes never decide
 * identity, our normalised keys do.
 */

/** Normalise a website/domain to a bare, lowercased host for identity comparison. */
export function normaliseDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (value === "") return null;
  // Strip scheme.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  // Strip any path, query or fragment.
  value = value.replace(/[/?#].*$/, "");
  // Strip credentials and port.
  value = value.replace(/^[^@]*@/, "").replace(/:\d+$/, "");
  // Strip a leading www.
  value = value.replace(/^www\./, "");
  return value === "" ? null : value;
}

/** Normalise an email to a lowercased, trimmed form for identity comparison. */
export function normaliseEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  return value === "" || !value.includes("@") ? null : value;
}

/** Normalise a LinkedIn profile URL to a stable identity key (host + path, no query). */
export function normaliseLinkedinUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (value === "") return null;
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/[?#].*$/, "");
  value = value.replace(/^[a-z]{2,3}\.linkedin\.com/, "linkedin.com");
  value = value.replace(/^www\.linkedin\.com/, "linkedin.com");
  value = value.replace(/\/$/, "");
  return value === "" ? null : value;
}

/** Identity key for a company: prefer domain, fall back to placeId. */
export function companyDedupeKey(input: {
  domain?: string | null;
  website?: string | null;
  placeId?: string | null;
}): string | null {
  const domain = normaliseDomain(input.domain ?? input.website);
  if (domain) return `domain:${domain}`;
  if (input.placeId) return `place:${input.placeId}`;
  return null;
}

/** Identity key for a contact: prefer email, fall back to linkedinUrl. */
export function contactDedupeKey(input: {
  email?: string | null;
  linkedinUrl?: string | null;
}): string | null {
  const email = normaliseEmail(input.email);
  if (email) return `email:${email}`;
  const li = normaliseLinkedinUrl(input.linkedinUrl);
  if (li) return `linkedin:${li}`;
  return null;
}
