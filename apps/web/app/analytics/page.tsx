import { BarChart3, Bell, Signal, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAnalytics, getLeads } from "@/lib/data";
import { round1 } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics — OIE",
};

export default async function AnalyticsPage() {
  const [tiles, scoredLeads] = await Promise.all([getAnalytics(), getLeads()]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Analytics</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Pipeline health at a glance. Derived from the live database and the active ICP scoring run.
        </p>
      </header>

      {/* KPI tiles */}
      <section aria-label="Key metrics" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Total leads" value={tiles.totalLeads} icon={<Users size={16} aria-hidden="true" />} />
        <KpiTile label="Signals this week" value={tiles.signalsThisWeek} icon={<Signal size={16} aria-hidden="true" />} />
        <KpiTile label="Pending approvals" value={tiles.pendingApprovals} icon={<Bell size={16} aria-hidden="true" />} accent={tiles.pendingApprovals > 0} />
        <KpiTile label="Est. cost (USD)" value={`$${tiles.estimatedCostUsd.toFixed(2)}`} icon={<TrendingUp size={16} aria-hidden="true" />} />
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Leads by tier */}
        <Card>
          <CardHeader>
            <CardTitle>Leads by tier</CardTitle>
          </CardHeader>
          <CardContent>
            <ul aria-label="Lead counts by tier" className="space-y-3">
              {(["A", "B", "C", "D"] as const).map((tier) => {
                const count = tiles.byTier[tier];
                const pct = tiles.totalLeads > 0 ? (count / tiles.totalLeads) * 100 : 0;
                const variant = ({ A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const)[tier];
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
                      className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800"
                    >
                      <div
                        className={`h-full rounded-full ${
                          tier === "A"
                            ? "bg-emerald-400"
                            : tier === "B"
                              ? "bg-teal-400"
                              : tier === "C"
                                ? "bg-amber-400"
                                : "bg-ink-600"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right font-mono text-sm font-semibold text-ink-100">
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
              {scoredLeads.slice(0, 5).map((lead, i) => {
                const variant = ({ A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const)[lead.score.tier];
                return (
                  <li key={lead.id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-center font-mono text-xs font-bold text-ink-500">{i + 1}</span>
                    <span className="flex-1 font-medium text-ink-100">{lead.company.name}</span>
                    <Badge variant={variant}>Tier {lead.score.tier}</Badge>
                    <span className="w-10 text-right font-mono text-xs text-gold-300">
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
                <BarChart3 size={16} aria-hidden="true" className="text-gold-400" />
                Score distribution
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div role="list" aria-label="Score distribution chart" className="flex h-32 items-end gap-2">
              {scoredLeads.map((lead) => {
                const heightPct = Math.max(4, lead.score.composite);
                const colour =
                  lead.score.tier === "A"
                    ? "bg-emerald-400"
                    : lead.score.tier === "B"
                      ? "bg-teal-400"
                      : lead.score.tier === "C"
                        ? "bg-amber-400"
                        : "bg-ink-700";
                return (
                  <div
                    key={lead.id}
                    role="listitem"
                    title={`${lead.company.name}: ${round1(lead.score.composite)}`}
                    aria-label={`${lead.company.name} — composite score ${round1(lead.score.composite)}`}
                    className={`min-w-0 flex-1 rounded-t ${colour}`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Each bar is one lead, coloured by tier, height proportional to composite score.
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
    <div className="surface px-5 py-4">
      <div className="flex items-center gap-2 text-ink-400">
        {icon}
        <span className="label-mono">{label}</span>
      </div>
      <p className={`mt-2 font-display text-3xl font-bold ${accent ? "text-gold-400" : "text-ink-50"}`}>
        {value}
      </p>
    </div>
  );
}
