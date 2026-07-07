"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp, Loader2, Search, Sparkles } from "lucide-react";
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

const SIGNAL_VARIANT = {
  hiring: "hiring",
  funding: "funding",
  tech_adoption: "tech_adoption",
  job_change: "job_change",
  news: "news",
  web_change: "web_change",
} as const;

/**
 * Global search across the operator-visible text columns (company, industry,
 * contact, title). Numeric/score columns are filtered via the tier pills, not
 * the free-text box, so a stray digit in a name never masks a score match.
 */
const searchLeads: FilterFn<ScoredLead> = (row, _columnId, value) => {
  const q = String(value).toLowerCase().trim();
  if (!q) return true;
  const l = row.original;
  return (
    l.company.name.toLowerCase().includes(q) ||
    l.company.industry.toLowerCase().includes(q) ||
    l.contact.fullName.toLowerCase().includes(q) ||
    l.contact.title.toLowerCase().includes(q)
  );
};

export function LeadsView({ initialLeads }: { initialLeads: ScoredLead[] }) {
  const router = useRouter();
  const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "composite", desc: true }]);
  const [isDiscovering, startDiscovery] = useTransition();
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Live ICP-distribution summary, computed from ALL leads (not the filtered
  // view) so the operator always sees the full pipeline shape. Pure derived —
  // the scores themselves come from the deterministic engine, never recomputed.
  const stats = useMemo(() => {
    const byTier: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 };
    let sum = 0;
    for (const l of initialLeads) {
      byTier[l.score.tier] += 1;
      sum += l.score.composite;
    }
    return { total: initialLeads.length, byTier, avg: initialLeads.length ? sum / initialLeads.length : 0 };
  }, [initialLeads]);

  const columns = useMemo<ColumnDef<ScoredLead>[]>(
    () => [
      {
        id: "company",
        header: "Company",
        accessorFn: (l) => l.company.name,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedLead(row.original)}
            className="text-left font-medium text-ink-50"
          >
            {row.original.company.name}
            <span className="block text-xs font-normal text-ink-500">{row.original.company.industry}</span>
          </button>
        ),
      },
      {
        id: "contact",
        header: "Contact",
        enableSorting: false,
        accessorFn: (l) => l.contact.fullName,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedLead(row.original)}
            className="text-left text-ink-200"
          >
            {row.original.contact.fullName}
            <span className="block text-xs text-ink-500">{row.original.contact.title}</span>
          </button>
        ),
      },
      {
        id: "tier",
        header: "Tier",
        enableSorting: false,
        accessorFn: (l) => l.score.tier,
        filterFn: (row, id, value) => row.getValue(id) === value,
        cell: ({ row }) => <Badge variant={TIER_VARIANT[row.original.score.tier]}>{row.original.score.tier}</Badge>,
      },
      {
        id: "composite",
        header: "Composite",
        accessorFn: (l) => l.score.composite,
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-gold-300">{round1(row.original.score.composite)}</span>
        ),
      },
      {
        id: "fit",
        header: "Fit",
        accessorFn: (l) => l.score.fit,
        cell: ({ row }) => <span className="font-mono text-ink-300">{round1(row.original.score.fit)}</span>,
      },
      {
        id: "intent",
        header: "Intent",
        accessorFn: (l) => l.score.intent,
        cell: ({ row }) => <span className="font-mono text-ink-300">{round1(row.original.score.intent)}</span>,
      },
      {
        id: "signals",
        header: "Signals",
        accessorFn: (l) => l.signals.length,
        cell: ({ row }) => {
          const signals = row.original.signals;
          if (signals.length === 0) return <span className="text-xs text-ink-600">None</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {signals.slice(0, 2).map((s) => (
                <Badge key={s.id} variant={SIGNAL_VARIANT[s.type]} className="text-[10px]">
                  {signalTypeLabel(s.type)}
                </Badge>
              ))}
              {signals.length > 2 && <span className="text-xs text-ink-500">+{signals.length - 2}</span>}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: initialLeads,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchLeads,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const tierFilter = (columnFilters.find((f) => f.id === "tier")?.value as Tier | undefined) ?? "all";
  const setTierFilter = (t: Tier | "all") =>
    setColumnFilters(t === "all" ? [] : [{ id: "tier", value: t }]);

  const rows = table.getRowModel().rows;

  const handleDiscover = () => {
    startDiscovery(async () => {
      setDiscoverResult(null);
      try {
        const res = await fetch("/api/leads/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: discoverPage }),
        });
        setDiscoverPage((p) => p + 1);
        const data = (await res.json()) as { imported?: number; skipped?: number; errors?: number; error?: string; message?: string };
        if (!res.ok || data.error) {
          setDiscoverResult(`Error: ${data.error ?? "Unknown error"}`);
          return;
        }
        if (data.message) {
          setDiscoverResult(data.message);
          return;
        }
        setDiscoverResult(`Page ${discoverPage}: imported ${data.imported ?? 0} leads, skipped ${data.skipped ?? 0}${data.errors ? `, ${data.errors} errors` : ""}.`);
        router.refresh();
      } catch {
        setDiscoverResult("Network error. Check the server logs.");
      }
    });
  };

  return (
    <>
      {/* Pipeline summary (analytics strip) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Leads" value={String(stats.total)} />
        <StatCard label="Tier A" value={String(stats.byTier.A)} accent="tier_a" />
        <StatCard label="Tier B" value={String(stats.byTier.B)} accent="tier_b" />
        <StatCard label="Tier C" value={String(stats.byTier.C)} accent="tier_c" />
        <StatCard label="Tier D" value={String(stats.byTier.D)} accent="tier_d" />
        <StatCard label="Avg composite" value={String(round1(stats.avg))} />
      </div>

      {/* Discover leads */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleDiscover}
          disabled={isDiscovering}
          className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDiscovering ? (
            <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Discovering…</>
          ) : (
            <><Sparkles size={15} aria-hidden="true" /> Discover Leads</>
          )}
        </button>
        {discoverResult && (
          <p className="text-xs text-ink-400">{discoverResult}</p>
        )}
      </div>

      {/* Search + tier filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search company, contact, title…"
            aria-label="Search leads by company, contact, or title"
            className="w-64 rounded-full border border-ink-700 bg-ink-850 py-1.5 pl-8 pr-3 text-xs text-ink-100 placeholder:text-ink-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <span className="label-mono ml-2 mr-1">Tier</span>
        {TIER_OPTIONS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTierFilter(t)}
            aria-pressed={tierFilter === t}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              tierFilter === t
                ? "bg-gold-500 text-ink-950"
                : "bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-700 hover:bg-ink-700 hover:text-ink-100"
            }`}
          >
            {t === "all" ? "All tiers" : `Tier ${t}`}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs text-ink-500">
          {rows.length} lead{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <EmptyState
          title="No matching leads"
          description="Try a different search term or tier filter above."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850 shadow-card">
          <table className="min-w-full divide-y divide-ink-800 text-sm">
            <thead className="bg-ink-900">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    const Icon = sorted === "desc" ? ChevronDown : sorted === "asc" ? ChevronUp : ChevronsUpDown;
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === "desc"
                            ? "descending"
                            : sorted === "asc"
                              ? "ascending"
                              : canSort
                                ? "none"
                                : undefined
                        }
                        className="px-4 py-3 text-left label-mono"
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={`flex items-center gap-1 transition-colors hover:text-ink-100 ${sorted ? "text-gold-400" : ""}`}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <Icon size={12} aria-hidden="true" />
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-ink-800">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-ink-800/60 focus-within:bg-ink-800/60"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
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

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "tier_a" | "tier_b" | "tier_c" | "tier_d";
}) {
  const dot =
    accent === "tier_a"
      ? "bg-emerald-400"
      : accent === "tier_b"
        ? "bg-sky-400"
        : accent === "tier_c"
          ? "bg-amber-400"
          : accent === "tier_d"
            ? "bg-ink-500"
            : "";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-3 shadow-card">
      <div className="flex items-center gap-1.5">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}
        <span className="label-mono">{label}</span>
      </div>
      <div className="mt-1 font-mono text-xl font-semibold text-ink-50">{value}</div>
    </div>
  );
}
