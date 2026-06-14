/** Small, pure matching helpers used by the scoring engine. */

export function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Case-insensitive bidirectional substring match between two strings. */
export function fuzzyEquals(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === "" || y === "") return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** True if `value` fuzzily matches any candidate. */
export function matchesAny(value: string | null | undefined, candidates: string[]): boolean {
  if (!value) return false;
  return candidates.some((c) => fuzzyEquals(value, c));
}

/** Count how many of `values` fuzzily match any candidate. */
export function countMatches(values: string[], candidates: string[]): number {
  return values.filter((v) => candidates.some((c) => fuzzyEquals(v, c))).length;
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius, km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Combine independent strengths (each 0..1) with diminishing returns —
 * probabilistic OR: 1 - Π(1 - sᵢ). Many weak signals saturate slowly; one
 * strong fresh signal dominates (scoring-conventions: do not let ten weak
 * signals outscore one strong fresh one).
 */
export function combineDiminishing(strengths: number[]): number {
  const product = strengths.reduce((acc, s) => acc * (1 - Math.max(0, Math.min(1, s))), 1);
  return 1 - product;
}
