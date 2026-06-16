"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { round1 } from "@/lib/utils";
import { scoreLead, rankByComposite } from "@oie/core";
import type { IcpProfile, ScoringSubject } from "@oie/core";
import { SEED_ICP, type ScoredLead } from "@/lib/fixtures";

const NOW = new Date();

const TIER_VARIANT = {
  A: "tier_a",
  B: "tier_b",
  C: "tier_c",
  D: "tier_d",
} as const;

// ── Weight slider ─────────────────────────────────────────────────────────────

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = `slider-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-48 shrink-0 text-sm text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-valuetext={value.toFixed(2)}
        className="h-1.5 w-full cursor-pointer accent-brand-600"
      />
      <span className="w-10 shrink-0 text-right text-sm font-mono text-gray-600">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── Number input ─────────────────────────────────────────────────────────────

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const id = `num-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-48 shrink-0 text-sm text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      />
    </div>
  );
}

// ── Live ranking panel ────────────────────────────────────────────────────────

function LiveRanking({ icp, leads }: { icp: IcpProfile; leads: ScoredLead[] }) {
  const ranked = useMemo(() => {
    const scored = leads.map((lead) => {
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
      return { lead, score: scoreLead(subject, icp, NOW) };
    });
    return rankByComposite(scored);
  }, [icp, leads]);

  return (
    <div>
      <p className="mb-3 text-xs text-gray-400">
        Re-ranked live against {ranked.length} leads. Adjust weights on the left to see changes
        instantly.
      </p>
      <ol aria-label="Live-ranked leads" className="space-y-2">
        {ranked.map(({ lead, score }, i) => (
          <li
            key={lead.id}
            className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
          >
            <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-400">
              {i + 1}
            </span>
            <span className="flex-1 font-medium text-gray-800">{lead.company.name}</span>
            <Badge variant={TIER_VARIANT[score.tier]}>Tier {score.tier}</Badge>
            <span className="w-12 text-right font-mono text-xs text-gray-500">
              {round1(score.composite)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── ICP Editor ────────────────────────────────────────────────────────────────

export function IcpEditor({
  initialIcp = SEED_ICP,
  initialLeads = [],
}: {
  initialIcp?: IcpProfile;
  initialLeads?: ScoredLead[];
}) {
  const [icp, setIcp] = useState<IcpProfile>(initialIcp);

  const set = (updater: (prev: IcpProfile) => IcpProfile) => setIcp(updater);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor column */}
      <div className="space-y-5">
        {/* Composite blend */}
        <Card>
          <CardHeader>
            <CardTitle>Composite blend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <WeightSlider
                label="Fit weight"
                value={icp.compositeBlend.fit}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    compositeBlend: { fit: v, intent: Math.max(0, 1 - v) },
                  }))
                }
              />
              <WeightSlider
                label="Intent weight"
                value={icp.compositeBlend.intent}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    compositeBlend: { fit: Math.max(0, 1 - v), intent: v },
                  }))
                }
              />
              <p className="text-xs text-gray-400">
                Fit + Intent must sum to 1. Adjusting one auto-corrects the other.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tier thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>Tier thresholds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <NumberInput
                label="Tier A (min composite)"
                value={icp.tierThresholds.A}
                min={0}
                max={100}
                onChange={(v) =>
                  set((p) => ({ ...p, tierThresholds: { ...p.tierThresholds, A: v } }))
                }
              />
              <NumberInput
                label="Tier B (min composite)"
                value={icp.tierThresholds.B}
                min={0}
                max={100}
                onChange={(v) =>
                  set((p) => ({ ...p, tierThresholds: { ...p.tierThresholds, B: v } }))
                }
              />
              <NumberInput
                label="Tier C (min composite)"
                value={icp.tierThresholds.C}
                min={0}
                max={100}
                onChange={(v) =>
                  set((p) => ({ ...p, tierThresholds: { ...p.tierThresholds, C: v } }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Firmographic weights */}
        <Card>
          <CardHeader>
            <CardTitle>Firmographic weights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <WeightSlider
                label="Industry"
                value={icp.firmographics.industries.weight}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    firmographics: {
                      ...p.firmographics,
                      industries: { ...p.firmographics.industries, weight: v },
                    },
                  }))
                }
              />
              <WeightSlider
                label="Employee count"
                value={icp.firmographics.employeeCount.weight}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    firmographics: {
                      ...p.firmographics,
                      employeeCount: { ...p.firmographics.employeeCount, weight: v },
                    },
                  }))
                }
              />
              <WeightSlider
                label="Geography"
                value={icp.firmographics.geographies.weight}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    firmographics: {
                      ...p.firmographics,
                      geographies: { ...p.firmographics.geographies, weight: v },
                    },
                  }))
                }
              />
              {icp.firmographics.localCategory && (
                <WeightSlider
                  label="Local category"
                  value={icp.firmographics.localCategory.weight}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      firmographics: {
                        ...p.firmographics,
                        localCategory: {
                          values: p.firmographics.localCategory?.values ?? [],
                          weight: v,
                        },
                      },
                    }))
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Technographic + people weights */}
        <Card>
          <CardHeader>
            <CardTitle>Technographic &amp; people weights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <WeightSlider
                label="Technographics"
                value={icp.technographics.weight}
                onChange={(v) =>
                  set((p) => ({
                    ...p,
                    technographics: { ...p.technographics, weight: v },
                  }))
                }
              />
              <WeightSlider
                label="People / persona"
                value={icp.people.weight}
                onChange={(v) => set((p) => ({ ...p, people: { ...p.people, weight: v } }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Signal weights */}
        <Card>
          <CardHeader>
            <CardTitle>Signal weights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {icp.signals.map((sig, idx) => (
                <WeightSlider
                  key={`${sig.type}-${idx}`}
                  label={`Signal: ${sig.type}`}
                  value={sig.weight}
                  onChange={(v) =>
                    set((p) => ({
                      ...p,
                      signals: p.signals.map((s, i) => (i === idx ? { ...s, weight: v } : s)),
                    }))
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => setIcp(initialIcp)}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Reset to active ICP
        </button>
      </div>

      {/* Live ranking column */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Live re-rank</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveRanking icp={icp} leads={initialLeads} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
