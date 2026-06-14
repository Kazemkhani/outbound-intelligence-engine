import { BarChart3, Bell, Signal, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCORED_LEADS, getAnalyticsTiles } from "@/lib/fixtures";
import { round1 } from "@/lib/utils";

export const metadata = {
  title: "Analytics — OIE",
};

export default function AnalyticsPage() {
  const tiles = getAnalyticsTiles();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          High-level overview of pipeline health. Data is derived from fixture leads and the active
          ICP scoring run.
        </p>
      </header>

      {/* KPI tiles */}
      <section aria-label="Key metrics" className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile
          label="Total leads"
          value={tiles.totalLeads}
          icon={<Users size={18} aria-hidden="true" />}
        />
        <KpiTile
          label="Signals this week"
          value={tiles.signalsThisWeek}
          icon={<Signal size={18} aria-hidden="true" />}
        />
        <KpiTile
          label="Pending approvals"
          value={tiles.pendingApprovals}
          icon={<Bell size={18} aria-hidden="true" />}
          accent={tiles.pendingApprovals > 0}
        />
        <KpiTile
          label="Est. cost (USD)"
          value={`$${tiles.estimatedCostUsd.toFixed(2)}`}
          icon={<TrendingUp size={18} aria-hidden="true" />}
        />
      </section>

      {/* Leads by tier */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leads by tier</CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-label="Lead counts by tier" className="space-y-3">
              {(["A", "B", "C", "D"] as const).map((tier) => {
                const count = tiles.byTier[tier];
                const pct = tiles.totalLeads > 0 ? (count / tiles.totalLeads) * 100 : 0;
                const variant = ({ A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const)[
                  tier
                ];
                return (
                  <li key={tier} className="flex items-center gap-3">
                    <Badge variant={variant} className="w-14 justify-center">
                      Tier {tier}
                    </Badge>
                    <div
                      role="meter"
                      aria-label={`Tier ${tier}: ${count} leads`}
                      aria-valuenow={count}
                      aria-valuemin={0}
                      aria-valuemax={tiles.totalLeads}
                      className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"
                    >
                      <div
                        className={`h-full rounded-full ${
                          tier === "A"
                            ? "bg-emerald-500"
                            : tier === "B"
                              ? "bg-blue-500"
                              : tier === "C"
                                ? "bg-amber-500"
                                : "bg-gray-300"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-sm font-semibold text-gray-700">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Top leads */}
        <Card>
          <CardHeader>
            <CardTitle>Top leads</CardTitle>
          </CardHeader>
          <CardContent>
            <ol aria-label="Top scored leads" className="space-y-3">
              {SCORED_LEADS.slice(0, 5).map((lead, i) => {
                const variant = ({ A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const)[
                  lead.score.tier
                ];
                return (
                  <li key={lead.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center text-xs font-bold text-gray-400">{i + 1}</span>
                    <span className="flex-1 font-medium text-gray-800">{lead.company.name}</span>
                    <Badge variant={variant}>Tier {lead.score.tier}</Badge>
                    <span className="w-10 text-right font-mono text-xs text-gray-500">
                      {round1(lead.score.composite)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {/* Score distribution */}
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <BarChart3 size={16} aria-hidden="true" />
                Score distribution
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              role="list"
              aria-label="Score distribution chart"
              className="flex items-end gap-2 h-32"
            >
              {SCORED_LEADS.map((lead) => {
                const heightPct = Math.max(4, lead.score.composite);
                const colour =
                  lead.score.tier === "A"
                    ? "bg-emerald-400"
                    : lead.score.tier === "B"
                      ? "bg-blue-400"
                      : lead.score.tier === "C"
                        ? "bg-amber-400"
                        : "bg-gray-200";
                return (
                  <div
                    key={lead.id}
                    role="listitem"
                    title={`${lead.company.name}: ${round1(lead.score.composite)}`}
                    aria-label={`${lead.company.name} — composite score ${round1(lead.score.composite)}`}
                    className={`flex-1 rounded-t ${colour} min-w-0`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Each bar represents one lead, coloured by tier, height proportional to composite
              score.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${accent ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
