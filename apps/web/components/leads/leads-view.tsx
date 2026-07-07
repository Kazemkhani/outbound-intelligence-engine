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
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Layers,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { LeadDrawer } from "./lead-drawer";
import { round1, signalTypeLabel } from "@/lib/utils";
import { updateLeadCrm } from "@/app/leads/actions";
import type { ScoredLead, CrmStatus } from "@/lib/fixtures";
import type { SegmentSummary } from "@/lib/data";
import type { Tier } from "@oie/core";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const CRM_STAGES: { value: CrmStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-ink-700 text-ink-300" },
  { value: "contacted", label: "Contacted", color: "bg-sky-500/20 text-sky-300" },
  { value: "replied", label: "Replied", color: "bg-purple-500/20 text-purple-300" },
  { value: "meeting_booked", label: "Meeting", color: "bg-amber-500/20 text-amber-300" },
  { value: "won", label: "Won", color: "bg-emerald-500/20 text-emerald-300" },
  { value: "lost", label: "Lost", color: "bg-red-500/20 text-red-400" },
];

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

// ── CRM status pill (inline clickable) ────────────────────────────────────────

function CrmPill({ lead }: { lead: ScoredLead }) {
  const [status, setStatus] = useState<CrmStatus>(lead.crmStatus);
  const [saving, startSave] = useTransition();

  const idx = CRM_STAGES.findIndex((s) => s.value === status);
  const stage = CRM_STAGES[idx] ?? CRM_STAGES[0]!;
  const next = CRM_STAGES[(idx + 1) % CRM_STAGES.length] ?? CRM_STAGES[0]!;

  const advance = () => {
    const nextVal = next.value;
    setStatus(nextVal);
    startSave(async () => {
      await updateLeadCrm({ contactId: lead.contact.id, crmStatus: nextVal });
    });
  };

  return (
    <button
      type="button"
      onClick={advance}
      disabled={saving}
      title={`Advance to: ${next.label}`}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-opacity ${stage.color} ${saving ? "opacity-50" : "hover:opacity-80"}`}
    >
      {stage.label}
    </button>
  );
}

// ── CRM segment table view ─────────────────────────────────────────────────────

function SegmentCrmView({
  leads,
  onSelectLead,
}: {
  leads: ScoredLead[];
  onSelectLead: (lead: ScoredLead) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.contact.fullName.toLowerCase().includes(q) ||
        l.company.name.toLowerCase().includes(q) ||
        l.contact.title.toLowerCase().includes(q),
    );
  }, [leads, search]);

  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads in this segment yet"
        description="Run the agent or use Discover Leads — new imports will appear here automatically."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-56 rounded-full border border-ink-700 bg-ink-850 py-1.5 pl-8 pr-3 text-xs text-ink-100 placeholder:text-ink-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <span className="ml-auto font-mono text-xs text-ink-500">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850 shadow-card">
        <table className="min-w-full divide-y divide-ink-800 text-sm">
          <thead className="bg-ink-900">
            <tr>
              {["Contact", "Company", "Email / LinkedIn", "Status", "Notes"].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-left label-mono">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {filtered.map((lead) => (
              <tr key={lead.id} className="transition-colors hover:bg-ink-800/60">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectLead(lead)}
                    className="text-left text-ink-100 hover:text-gold-300"
                  >
                    {lead.contact.fullName}
                    <span className="block text-xs text-ink-500">{lead.contact.title}</span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className="text-ink-200">{lead.company.name}</span>
                  <span className="block text-xs text-ink-500">{lead.company.industry}</span>
                </td>
                <td className="px-4 py-3 space-y-0.5">
                  {lead.contact.email && (
                    <span className="block text-xs font-mono text-ink-400 truncate max-w-[180px]">
                      {lead.contact.email}
                    </span>
                  )}
                  {lead.contact.linkedinUrl && (
                    <a
                      href={lead.contact.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-sky-400 hover:text-sky-300 truncate max-w-[180px]"
                    >
                      LinkedIn ↗
                    </a>
                  )}
                  {!lead.contact.email && !lead.contact.linkedinUrl && (
                    <span className="text-xs text-ink-600">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <CrmPill lead={lead} />
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  {lead.notes ? (
                    <span className="text-xs text-ink-400 line-clamp-2">{lead.notes}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectLead(lead)}
                      className="text-xs text-ink-600 hover:text-ink-400"
                    >
                      Add note…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function LeadsView({
  initialLeads,
  segments,
  activeSegmentId,
}: {
  initialLeads: ScoredLead[];
  segments: SegmentSummary[];
  activeSegmentId?: string;
}) {
  const router = useRouter();
  const [selectedLead, setSelectedLead] = useState<ScoredLead | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "composite", desc: true }]);
  const [isDiscovering, startDiscovery] = useTransition();
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const activeSegment = segments.find((s) => s.id === activeSegmentId);

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
        const currentPage = discoverPage;
        setDiscoverPage((p) => p + 1);
        const data = (await res.json()) as {
          imported?: number;
          skipped?: number;
          errors?: number;
          error?: string;
          message?: string;
          segmentId?: string;
        };
        if (!res.ok || data.error) {
          setDiscoverResult(`Error: ${data.error ?? "Unknown error"}`);
          return;
        }
        if (data.message) {
          setDiscoverResult(data.message);
          return;
        }
        setDiscoverResult(
          `Page ${currentPage}: imported ${data.imported ?? 0} leads, skipped ${data.skipped ?? 0}${data.errors ? `, ${data.errors} errors` : ""}.`,
        );
        if (data.segmentId) {
          router.push(`/leads?segment=${data.segmentId}`);
        } else {
          router.refresh();
        }
      } catch {
        setDiscoverResult("Network error. Check the server logs.");
      }
    });
  };

  const navTo = (path: string) => {
    router.push(path);
  };

  return (
    <div className="flex gap-6">
      {/* Segment sidebar */}
      <aside className="w-44 shrink-0 space-y-0.5">
        <p className="mb-2 label-mono text-ink-500">Segments</p>
        <button
          type="button"
          onClick={() => navTo("/leads")}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            !activeSegmentId
              ? "bg-gold-500/10 text-gold-300 font-semibold"
              : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
          }`}
        >
          <Layers size={13} aria-hidden="true" />
          All Leads
          <span className="ml-auto font-mono text-[10px] text-ink-600">{/* total shown in stats */}</span>
        </button>

        {segments.map((seg) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => navTo(`/leads?segment=${seg.id}`)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left ${
              activeSegmentId === seg.id
                ? "bg-gold-500/10 text-gold-300 font-semibold"
                : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            <span className="flex-1 truncate leading-tight">{seg.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-600">{seg._count.contacts}</span>
          </button>
        ))}

        {segments.length === 0 && (
          <p className="px-3 text-xs text-ink-600 leading-relaxed">
            Segments are created automatically when leads are imported.
          </p>
        )}
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {activeSegment ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div>
                <h2 className="font-semibold text-ink-50">{activeSegment.name}</h2>
                <p className="text-xs text-ink-500">{activeSegment._count.contacts} leads · CRM view</p>
              </div>
            </div>
            <SegmentCrmView leads={initialLeads} onSelectLead={setSelectedLead} />
          </>
        ) : (
          <>
            {/* Pipeline summary */}
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
                  <>
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Discovering…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} aria-hidden="true" /> Discover Leads
                  </>
                )}
              </button>
              {discoverResult && <p className="text-xs text-ink-400">{discoverResult}</p>}
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

            {/* Scored leads table */}
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
                          const Icon =
                            sorted === "desc" ? ChevronDown : sorted === "asc" ? ChevronUp : ChevronsUpDown;
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
          </>
        )}
      </div>

      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
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
