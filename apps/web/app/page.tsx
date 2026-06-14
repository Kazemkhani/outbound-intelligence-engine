import Link from "next/link";
import { BarChart3, Bell, Settings, Signal, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnalyticsTiles } from "@/lib/fixtures";

const SECTIONS = [
  {
    href: "/leads",
    label: "Ranked Leads",
    description:
      "View all leads scored and ranked against the active ICP. Filter by tier and inspect enrichment, signal timeline, and score rationale.",
    icon: Users,
  },
  {
    href: "/icp",
    label: "ICP Editor",
    description:
      "Edit firmographic, technographic, people, and signal weights. See leads re-ranked live as you adjust — no save needed.",
    icon: Settings,
  },
  {
    href: "/signals",
    label: "Signal Feed",
    description:
      "Browse all detected buying signals with evidence, provider attribution, strength, and decay / expiry information.",
    icon: Signal,
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    description:
      "Review and approve messages before they are sent. Nothing leaves the system without explicit operator approval.",
    icon: Bell,
  },
  {
    href: "/analytics",
    label: "Analytics",
    description:
      "High-level tiles: leads by tier, signals this week, pending approvals, and estimated provider cost.",
    icon: BarChart3,
  },
] as const;

export default function HomePage() {
  const tiles = getAnalyticsTiles();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Outbound Intelligence Engine
        </h1>
        <p className="mt-2 text-base text-gray-500">
          Autonomous prospecting, enrichment, and signal-driven outbound — governed by a mandatory
          human approval gate. Nothing sends without your review.
        </p>
      </header>

      {/* Summary strip */}
      <section aria-label="Summary" className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="Total leads" value={tiles.totalLeads} />
        <SummaryTile label="Tier A" value={tiles.byTier.A} accent />
        <SummaryTile label="Pending approvals" value={tiles.pendingApprovals} />
        <SummaryTile label="Signals this week" value={tiles.signalsThisWeek} />
      </section>

      {/* Section cards */}
      <section aria-label="Navigation" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-50 text-brand-600 group-hover:bg-brand-100">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">
                {label}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-gray-500">{description}</p>
          </Link>
        ))}
      </section>

      {/* Gate notice */}
      <aside
        role="note"
        aria-label="Approval gate notice"
        className="mt-10 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4"
      >
        <p className="text-sm text-amber-800">
          <strong>DRY_RUN is active.</strong> All sequencing and send operations produce previews
          only. A real send requires an operator to approve each message individually in the
          Approval Queue and for DRY_RUN to be explicitly disabled. The gate cannot be bypassed from
          this interface.
        </p>
      </aside>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? "text-brand-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
