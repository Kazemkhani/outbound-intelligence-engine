/**
 * NOVA anti-corruption layer: turn a loose `get_call` payload from the NOVA voice
 * service into our canonical call findings. NOVA's exact response shape is not
 * guaranteed, so we read several plausible locations and keep only keys we
 * recognise. We never fabricate: a missing field yields no finding. Keeping this
 * pure (no I/O, no Prisma) makes it unit-testable and keeps the vendor shape from
 * leaking past this boundary, per the repo's integration rules.
 */

/** A finding we recognise from a NOVA call, normalised for the master DB. */
export interface NovaFinding {
  key: string;
  value: string;
  confidence: number | null;
}

/** The only finding keys we persist. Anything else from NOVA is ignored. */
export const CANONICAL_FINDING_KEYS = [
  "identity_confirmed",
  "after_hours_handling",
  "tools",
  "monthly_volume",
  "mobile",
  "demo_interest",
  "opt_in",
] as const;

const CANONICAL = new Set<string>(CANONICAL_FINDING_KEYS);

/** Loosely affirmative short answer (yes / true / confirmed / opted in). */
export function affirmative(v: string): boolean {
  return /^(yes|true|confirmed|granted|opted[\s_-]?in|agreed|interested)$/i.test(v.trim());
}

/**
 * Defensively extract structured findings from a NOVA get_call payload. Reads
 * `findings` from the top level or nested under `outcome`/`data`, accepts either
 * an array of `{key,value,confidence}` or a plain key/value object, clamps values
 * to 500 chars, and only keeps a `confidence` in [0,1].
 */
export function extractFindings(payload: Record<string, unknown>): NovaFinding[] {
  const src =
    (payload.findings as unknown) ??
    (payload.outcome as Record<string, unknown> | undefined)?.findings ??
    (payload.data as Record<string, unknown> | undefined)?.findings ??
    (payload.outcome as unknown) ??
    null;
  const out: NovaFinding[] = [];
  const push = (key: string, value: unknown, confidence?: unknown) => {
    if (!CANONICAL.has(key)) return;
    if (value === null || value === undefined || value === "") return;
    const v = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
    const c = typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : null;
    out.push({ key, value: v.slice(0, 500), confidence: c });
  };
  if (Array.isArray(src)) {
    for (const f of src) {
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        const key = typeof o.key === "string" ? o.key : "";
        push(key, o.value, o.confidence);
      }
    }
  } else if (src && typeof src === "object") {
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) push(key, value);
  }
  return out;
}
