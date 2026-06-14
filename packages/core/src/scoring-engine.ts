import type { IcpProfile, SignalCriterion } from "./icp";
import type { CompanyFacts, ContactFacts, ScoringSubject, SignalFact } from "./subject";
import type { Tier } from "./types";
import {
  assignTier,
  clampScore,
  compositeScore,
  signalDecayFactor,
  weightedScore,
} from "./scoring";
import { combineDiminishing, countMatches, haversineKm, matchesAny, norm } from "./match";

/** Bumped whenever the scoring computation changes; stored on every Score. */
export const SCORING_MODEL_VERSION = "scoring-v1";

export interface FitComponent {
  key: string;
  score: number; // 0..100
  weight: number; // configured ICP weight, > 0
  known: boolean; // false when the underlying data is unknown (scores 0)
  detail: string;
}

export interface IntentCriterionResult {
  type: SignalCriterion["type"];
  score: number; // 0..100
  weight: number;
  matched: boolean;
  detail: string;
}

export interface ScoreResult {
  fit: number;
  intent: number;
  composite: number;
  tier: Tier;
  modelVersion: string;
  rationale: {
    fit: { score: number; coverage: number; components: FitComponent[] };
    intent: { score: number; criteria: IntentCriterionResult[] };
    composite: number;
    tier: Tier;
  };
}

// ── Fit components ────────────────────────────────────────────────────────────

function industryComponent(c: CompanyFacts, icp: IcpProfile): FitComponent {
  const { values, weight } = icp.firmographics.industries;
  const known = c.industry != null && c.industry !== "";
  const score = known && matchesAny(c.industry, values) ? 100 : 0;
  return {
    key: "industry",
    weight,
    known,
    score,
    detail: known
      ? `industry "${c.industry}" ${score ? "matched" : "no match"}`
      : "industry unknown",
  };
}

function employeeComponent(c: CompanyFacts, icp: IcpProfile): FitComponent {
  const { min, max, weight } = icp.firmographics.employeeCount;
  const known = typeof c.employeeCount === "number";
  let score = 0;
  if (known) {
    const ec = c.employeeCount as number;
    const lo = min ?? Number.NEGATIVE_INFINITY;
    const hi = max ?? Number.POSITIVE_INFINITY;
    if (ec >= lo && ec <= hi) {
      score = 100;
    } else {
      const width =
        Number.isFinite(hi) && Number.isFinite(lo)
          ? Math.max(1, hi - lo)
          : Math.max(1, Number.isFinite(hi) ? hi : lo);
      const dist = ec < lo ? lo - ec : ec - hi;
      score = clampScore(100 - (100 * dist) / width);
    }
  }
  return {
    key: "employeeCount",
    weight,
    known,
    score,
    detail: known ? `${c.employeeCount} employees → ${score.toFixed(0)}` : "employee count unknown",
  };
}

function revenueComponent(c: CompanyFacts, icp: IcpProfile): FitComponent {
  const { values, weight } = icp.firmographics.revenueBand;
  const known = c.revenueBand != null && c.revenueBand !== "";
  const score = known && matchesAny(c.revenueBand, values) ? 100 : 0;
  return {
    key: "revenueBand",
    weight,
    known,
    score,
    detail: known ? `revenue "${c.revenueBand}"` : "revenue unknown",
  };
}

function geographyComponent(c: CompanyFacts, icp: IcpProfile): FitComponent {
  const g = icp.firmographics.geographies;
  const hasGeo = c.country != null || c.region != null || (c.lat != null && c.lng != null);
  let score = 0;
  const reasons: string[] = [];
  if (hasGeo) {
    if (c.country && matchesAny(c.country, g.countries ?? [])) {
      score = 100;
      reasons.push(`country ${c.country}`);
    } else if (c.region && matchesAny(c.region, g.regions ?? [])) {
      score = 100;
      reasons.push(`region ${c.region}`);
    } else if (g.radiusKm && c.lat != null && c.lng != null) {
      const d = haversineKm(g.radiusKm.lat, g.radiusKm.lng, c.lat, c.lng);
      if (d <= g.radiusKm.km) {
        score = 100;
        reasons.push(`within ${d.toFixed(0)}km`);
      } else {
        reasons.push(`${d.toFixed(0)}km outside radius`);
      }
    }
  }
  return {
    key: "geography",
    weight: g.weight,
    known: hasGeo,
    score,
    detail: hasGeo ? reasons.join(", ") || "no geo match" : "geography unknown",
  };
}

function localCategoryComponent(c: CompanyFacts, icp: IcpProfile): FitComponent | null {
  const lc = icp.firmographics.localCategory;
  if (!lc) return null;
  const known = c.localCategory != null && c.localCategory !== "";
  const score = known && matchesAny(c.localCategory, lc.values) ? 100 : 0;
  return {
    key: "localCategory",
    weight: lc.weight,
    known,
    score,
    detail: known ? `category "${c.localCategory}"` : "local category unknown",
  };
}

function technographicsComponent(c: CompanyFacts, icp: IcpProfile): FitComponent {
  const { uses, avoids, weight } = icp.technographics;
  const stack = c.techStack ?? [];
  const known = stack.length > 0;
  let score = 0;
  let detail = "tech stack unknown";
  if (known) {
    const avoided = countMatches(stack, avoids);
    if (avoided > 0) {
      score = 0;
      detail = `uses avoided tech (${avoided})`;
    } else {
      const matched = countMatches(stack, uses);
      // Reward presence with diminishing returns: two relevant tools = full credit.
      score = clampScore((100 * Math.min(matched, 2)) / 2);
      detail = `${matched} target tool(s) matched`;
    }
  }
  return { key: "technographics", weight, known, score, detail };
}

function peopleComponent(p: ContactFacts, icp: IcpProfile): FitComponent {
  const { titles, seniority, departments, weight } = icp.people;
  const known = p.title != null || p.seniority != null || p.department != null;
  let score = 0;
  const parts: string[] = [];
  if (known) {
    const titleHit = matchesAny(p.title, titles) ? 1 : 0;
    const seniorityHit = p.seniority != null && seniority.includes(p.seniority) ? 1 : 0;
    const deptHit = matchesAny(p.department, departments) ? 1 : 0;
    // Title is the strongest signal of a good persona.
    score = clampScore(titleHit * 50 + seniorityHit * 25 + deptHit * 25);
    if (titleHit) parts.push("title");
    if (seniorityHit) parts.push("seniority");
    if (deptHit) parts.push("department");
  }
  return {
    key: "people",
    weight,
    known,
    score,
    detail: known ? `matched: ${parts.join(", ") || "none"}` : "persona unknown",
  };
}

function keywordsComponent(s: ScoringSubject, icp: IcpProfile): FitComponent {
  const { include, exclude, weight } = icp.keywords;
  const haystack = norm(
    [
      s.company.industry,
      s.company.localCategory,
      s.contact.title,
      s.contact.department,
      ...(s.company.techStack ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const known = haystack.length > 0 && (include.length > 0 || exclude.length > 0);
  let score = 0;
  let detail = "no keywords configured or no text";
  if (known) {
    const excluded = exclude.some((k) => haystack.includes(norm(k)));
    if (excluded) {
      score = 0;
      detail = "excluded keyword present";
    } else {
      const hits = include.filter((k) => haystack.includes(norm(k))).length;
      score = include.length === 0 ? 0 : clampScore((100 * hits) / Math.min(include.length, 2));
      detail = `${hits} include keyword(s) matched`;
    }
  }
  return { key: "keywords", weight, known, score, detail };
}

// ── Intent ────────────────────────────────────────────────────────────────────

function signalMatchesCriterion(signal: SignalFact, criterion: SignalCriterion): boolean {
  if (signal.type !== criterion.type) return false;
  const keywords = (criterion.config as { keywords?: unknown }).keywords;
  if (Array.isArray(keywords) && keywords.length > 0) {
    const text = norm(JSON.stringify(signal.evidence ?? {}));
    return keywords.some((k) => typeof k === "string" && text.includes(norm(k)));
  }
  return true;
}

function intentCriterion(
  criterion: SignalCriterion,
  signals: SignalFact[],
  now: Date,
): IntentCriterionResult {
  const decayed = signals
    .filter((s) => signalMatchesCriterion(s, criterion))
    .map(
      (s) =>
        (clampScore(s.strength * 100) / 100) *
        signalDecayFactor(s.detectedAt, s.expiresAt ?? null, now),
    );
  const combined = combineDiminishing(decayed);
  const score = clampScore(combined * 100);
  return {
    type: criterion.type,
    weight: criterion.weight,
    score,
    matched: decayed.some((d) => d > 0),
    detail: `${decayed.length} ${criterion.type} signal(s) → ${score.toFixed(0)}`,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a single lead against an ICP. Pure and deterministic — `now` is the
 * only time input and must be passed in (never read the clock here). Returns
 * fit, intent, composite, tier and a full explainable rationale.
 */
export function scoreLead(subject: ScoringSubject, icp: IcpProfile, now: Date): ScoreResult {
  const candidates: (FitComponent | null)[] = [
    industryComponent(subject.company, icp),
    employeeComponent(subject.company, icp),
    revenueComponent(subject.company, icp),
    geographyComponent(subject.company, icp),
    localCategoryComponent(subject.company, icp),
    technographicsComponent(subject.company, icp),
    peopleComponent(subject.contact, icp),
    keywordsComponent(subject, icp),
  ];
  // Only configured dimensions (weight > 0) participate.
  const components = candidates.filter((c): c is FitComponent => c !== null && c.weight > 0);

  const fit = weightedScore(components.map((c) => ({ score: c.score, weight: c.weight })));
  const knownCount = components.filter((c) => c.known).length;
  const coverage = components.length === 0 ? 0 : knownCount / components.length;

  const criteria = icp.signals
    .filter((s) => s.weight > 0)
    .map((s) => intentCriterion(s, subject.signals, now));
  const intent = weightedScore(criteria.map((c) => ({ score: c.score, weight: c.weight })));

  const composite = compositeScore(fit, intent, icp.compositeBlend);
  const tier = assignTier(composite, icp.tierThresholds);

  return {
    fit,
    intent,
    composite,
    tier,
    modelVersion: SCORING_MODEL_VERSION,
    rationale: {
      fit: { score: fit, coverage, components },
      intent: { score: intent, criteria },
      composite,
      tier,
    },
  };
}

/** Rank a set of scored subjects deterministically (composite desc, then tier). */
export function rankByComposite<T extends { score: ScoreResult }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.score.composite - a.score.composite);
}
