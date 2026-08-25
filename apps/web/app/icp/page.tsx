import { IcpEditor } from "@/components/icp/icp-editor";
import { getActiveIcp, getLeads } from "@/lib/data";
import { loadConfig } from "@/app/setup/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ICP Editor · OIE Control Plane",
};

export default async function IcpPage() {
  const [icp, leads, setup] = await Promise.all([getActiveIcp(), getLeads(), loadConfig()]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">ICP Editor</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Define who you target and what signals matter. Changes are used immediately by the scoring
          engine, Discover Leads, and the Agent.
        </p>
      </header>
      <IcpEditor initialIcp={icp} initialLeads={leads} initialSetup={setup} />
    </div>
  );
}
