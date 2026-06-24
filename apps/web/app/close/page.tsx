import { CloseWorkspace } from "@/components/close/close-workspace";
import { getLeads } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Close Room · Huscribe Revenue OS",
};

export default async function ClosePage() {
  const leads = await getLeads();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Close Room</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          The closing cockpit, grounded in the APEX sales canon. Pick a lead, then generate a
          battlecard, multi-channel outreach, a post-call scorecard, or a Huscribe ROI case. Every
          output is drafted for your review. Nothing is sent from here.
        </p>
      </header>
      <CloseWorkspace leads={leads} />
    </div>
  );
}
