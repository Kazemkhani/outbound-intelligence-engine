import Link from "next/link";
import { BarChart3, Bell, Settings, Signal, Users, ArrowUpRight } from "lucide-react";
import { getAnalyticsTiles } from "@/lib/fixtures";

const SECTIONS = [
  {
    href: "/leads",
    label: "Ranked Leads",
    description:
      "Every lead scored and ranked against the active ICP. Filter by tier and inspect enrichment, the signal timeline, and the score rationale.",
    icon: Users,
  },
  {
    href: "/icp",
    label: "ICP Editor",
    description:
      "Tune firmographic, technographic, people, and signal weights. Leads re-rank live as you adjust. No save needed.",
    icon: Settings,
  },
  {
    href: "/signals",
    label: "Signal Feed",
    description:
      "Every detected buying signal with evidence, provider attribution, strength, and decay or expiry.",
    icon: Signal,
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    description:
      "Review and approve messages before they send. Nothing leaves the system without explicit operator approval.",
    icon: Bell,
  },
  {
    href: "/analytics",
    label: "Analytics",
    description:
      "Leads by tier, signals this week, pending approvals, and estimated provider cost at a glance.",
    icon: BarChart3,
  },
] as const;

export default function HomePage() {
  const tiles = getAnalyticsTiles();

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-10">
        <p className="label-mono mb-3">Outbound Intelligence Engine</p>
        <h1 className="text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">
          Find who buys. Score them. <span className="text-gold-400">Then sell.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-400">
          Autonomous prospecting, enrichment, and signal-driven outbound, governed by a mandatory
          human approval gate. Nothing sends without your review.
        </p>
      </header>

      {/* Summary strip */}
      <section aria-label="Summary" className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            className="surface group relative block p-5 transition-all hover:-translate-y-0.5 hover:border-ink-600"
          >
            <ArrowUpRight
              size={16}
              className="absolute right-4 top-4 text-ink-600 transition-colors group-hover:text-gold-400"
              aria-hidden="true"
            />
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400 ring-1 ring-inset ring-gold-500/20">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-bold text-ink-50">{label}</span>
            </div>
            <p className="text-sm leading-relaxed text-ink-400">{description}</p>
          </Link>
        ))}
      </section>

      {/* Gate notice */}
      <aside
        role="note"
        aria-label="Approval gate notice"
        className="mt-10 rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-5 py-4"
      >
        <p className="text-sm text-ink-200">
          <strong className="font-semibold text-gold-300">DRY_RUN is active.</strong>{" "}
          All sequencing and send operations produce previews only. A real send requires an operator
          to approve each message individually in the Approval Queue, and for DRY_RUN to be explicitly
          disabled. The gate cannot be bypassed from this interface.
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
    <div className="surface px-4 py-4">
      <p className="label-mono">{label}</p>
      <p
        className={`mt-2 font-display text-3xl font-bold ${accent ? "text-gold-400" : "text-ink-50"}`}
      >
        {value}
      </p>
    </div>
  );
}
