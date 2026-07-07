import { LeadsView } from "@/components/leads/leads-view";
import { getLeads, getSegments } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ranked Leads · GenRiver Revenue OS",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string }>;
}) {
  const { segment: segmentId } = await searchParams;
  const [leads, segments] = await Promise.all([
    getLeads(segmentId ? { segmentId } : undefined),
    getSegments(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Ranked Leads</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Every lead scored and ranked by composite against the active ICP. Click a row to inspect
          enrichment, the signal timeline, and the score rationale.
        </p>
      </header>
      <LeadsView initialLeads={leads} segments={segments} activeSegmentId={segmentId} />
    </div>
  );
}
