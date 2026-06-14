import {
  AdapterError,
  type AdapterContext,
  type CompanyQuery,
  type CostRecord,
  type EnrichmentProvider,
  type NormalisedCompany,
} from "@oie/integrations";

/**
 * The enrichment waterfall. We own the cascade, the cost ceiling and the swap
 * (brief §1, §2.4): providers are called in priority order, each fills only the
 * fields still missing, we stop as soon as the record is "complete enough"
 * (saving spend), and a provider failure falls through to the next rather than
 * aborting. Provider attribution is recorded per field in `company.sources`.
 */

export interface WaterfallOptions {
  /** Stop early once this predicate is satisfied. Defaults to domain+industry+employees. */
  isComplete?: (company: NormalisedCompany) => boolean;
}

export interface WaterfallTrace {
  provider: string;
  outcome: "matched" | "no_match" | "skipped_unconfigured" | "error";
  detail?: string;
}

export interface WaterfallResult {
  company: NormalisedCompany | null;
  matchedBy: string[];
  trace: WaterfallTrace[];
  costs: CostRecord[];
}

const COMPANY_FIELDS: (keyof NormalisedCompany)[] = [
  "domain",
  "name",
  "website",
  "industry",
  "employeeCount",
  "revenueBand",
  "country",
  "region",
  "lat",
  "lng",
  "placeId",
  "localCategory",
  "techStack",
  "funding",
  "socials",
];

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

const defaultComplete = (c: NormalisedCompany): boolean =>
  isPresent(c.domain) && isPresent(c.industry) && isPresent(c.employeeCount);

/**
 * Merge `incoming` into `acc`, filling only fields that are still missing.
 * Records the supplying provider in `acc.sources` for every field it fills.
 */
export function mergeCompany(
  acc: NormalisedCompany | null,
  incoming: NormalisedCompany,
  provider: string,
): NormalisedCompany {
  const base: NormalisedCompany = acc ?? { domain: null, name: incoming.name, sources: {} };
  const sources = { ...(base.sources ?? {}) };
  const merged: NormalisedCompany = { ...base, sources };

  for (const field of COMPANY_FIELDS) {
    if (!isPresent(merged[field]) && isPresent(incoming[field])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic field copy across a known key set
      (merged as any)[field] = incoming[field];
      sources[field] = provider;
    }
  }
  return merged;
}

export async function enrichCompanyWaterfall(
  query: CompanyQuery,
  providers: EnrichmentProvider[],
  ctx: AdapterContext,
  options: WaterfallOptions = {},
): Promise<WaterfallResult> {
  const isComplete = options.isComplete ?? defaultComplete;
  const trace: WaterfallTrace[] = [];
  const costs: CostRecord[] = [];
  const matchedBy: string[] = [];
  let company: NormalisedCompany | null = null;

  for (const provider of providers) {
    if (!provider.isConfigured()) {
      trace.push({ provider: provider.name, outcome: "skipped_unconfigured" });
      continue;
    }
    try {
      const result = await provider.enrichCompany(query, ctx);
      if (result.cost) {
        costs.push(result.cost);
        ctx.recordCost?.(result.cost);
      }
      if (result.matched && result.data) {
        company = mergeCompany(company, result.data, provider.name);
        matchedBy.push(provider.name);
        trace.push({ provider: provider.name, outcome: "matched" });
        if (isComplete(company)) break; // stop early — we own the cost ceiling
      } else {
        trace.push({ provider: provider.name, outcome: "no_match" });
      }
    } catch (err) {
      const detail = err instanceof AdapterError ? `${err.kind}: ${err.message}` : String(err);
      trace.push({ provider: provider.name, outcome: "error", detail });
      // Fall through to the next provider rather than aborting the cascade.
    }
  }

  return { company, matchedBy, trace, costs };
}
