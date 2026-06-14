"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { LeadDrawer } from "./lead-drawer";
import { round1, signalTypeLabel } from "@/lib/utils";
import type { ScoredLead } from "@/lib/fixtures";
import type { Tier } from "@oie/core";

const TIER_OPTIONS: Array<Tier | "all"> = ["all", "A", "B", "C", "D"];

const TIER_VARIANT = {
  A: "tier_a",
  B: "tier_b",
  C: "tier_c",
  D: "tier_d",
} as const;

type SortKey = "composite" | "fit" | "intent" | "company" | "signals";
type SortDir = "asc" | "desc";

function sortLeads(leads: ScoredLead[], key: SortKey, dir: SortDir): ScoredLead[] {
  return [...leads].sort((a, b) => {
    let cmp = 0;
    if (key === "composite") cmp = a.score.composite - b.score.composite;
    else if (key === "fit") cmp = a.score.fit - b.score.fit;
    else if (key === "intent") cmp = a.score.intent - b.score.intent;
    else if (key === "company") cmp = a.company.name.localeCompare(b.company.name);
    else if (key === "signals") cmp = a.signals.length - b.signals.length;
    return dir === "desc" ? -cmp : cmp;
  });
}

export function LeadsView({ initialLeads }: { initialLeads: ScoredLead[] }) {
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered =
    tierFilter === "all" ? initialLeads : initialLeads.filter((l) => l.score.tier === tierFilter);

  const sorted = sortLeads(filtered, sortKey, sortDir);

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Filter by tier:</span>
        {TIER_OPTIONS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTierFilter(t)}
            aria-pressed={tierFilter === t}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              tierFilter === t
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t === "all" ? "All tiers" : `Tier ${t}`}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {sorted.length} lead{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <EmptyState
          title="No leads in this tier"
          description="Try selecting a different tier filter above."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <SortTh
                  label="Company"
                  sortKey="company"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Contact
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Tier
                </th>
                <SortTh
                  label="Composite"
                  sortKey="composite"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Fit"
                  sortKey="fit"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Intent"
                  sortKey="intent"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
                <SortTh
                  label="Signals"
                  sortKey="signals"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer transition-colors hover:bg-brand-50 focus-within:bg-brand-50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      {lead.company.name}
                      <span className="block text-xs font-normal text-gray-400">
                        {lead.company.industry}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      {lead.contact.fullName}
                      <span className="block text-xs text-gray-400">{lead.contact.title}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_VARIANT[lead.score.tier]}>{lead.score.tier}</Badge>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {round1(lead.score.composite)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{round1(lead.score.fit)}</td>
                  <td className="px-4 py-3 text-gray-600">{round1(lead.score.intent)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.signals.length === 0 ? (
                        <span className="text-xs text-gray-300">None</span>
                      ) : (
                        lead.signals.slice(0, 2).map((s) => {
                          const sv = (
                            {
                              hiring: "hiring",
                              funding: "funding",
                              tech_adoption: "tech_adoption",
                              job_change: "job_change",
                              news: "news",
                              web_change: "web_change",
                            } as const
                          )[s.type];
                          return (
                            <Badge key={s.id} variant={sv} className="text-[10px]">
                              {signalTypeLabel(s.type)}
                            </Badge>
                          );
                        })
                      )}
                      {lead.signals.length > 2 && (
                        <span className="text-xs text-gray-400">+{lead.signals.length - 2}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}

function SortTh({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = current === sortKey;
  const Icon = isActive ? (dir === "desc" ? ChevronDown : ChevronUp) : ChevronsUpDown;
  // aria-sort belongs on the <th> (columnheader role), not on the <button> inside it.
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === "desc" ? "descending" : "ascending") : "none"}
      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}
