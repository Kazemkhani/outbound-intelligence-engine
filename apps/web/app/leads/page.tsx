import { LeadsView } from "@/components/leads/leads-view";
import { SCORED_LEADS } from "@/lib/fixtures";

export const metadata = {
  title: "Ranked Leads — OIE",
};

export default function LeadsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ranked Leads</h1>
        <p className="mt-1 text-sm text-gray-500">
          All leads scored and ranked by composite score against the active ICP. Click a row to
          inspect enrichment, signal timeline, and score rationale.
        </p>
      </header>
      <LeadsView initialLeads={SCORED_LEADS} />
    </div>
  );
}
