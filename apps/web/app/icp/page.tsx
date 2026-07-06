import { IcpEditor } from "@/components/icp/icp-editor";
import { getActiveIcp, getLeads } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ICP Editor · GenRiver Revenue OS",
};

export default async function IcpPage() {
  const [icp, leads] = await Promise.all([getActiveIcp(), getLeads()]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">ICP Editor</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Adjust firmographic, technographic, people, and signal weights. The lead ranking updates
          live as you move sliders — no save required to see the effect.
        </p>
      </header>
      <IcpEditor initialIcp={icp} initialLeads={leads} />
    </div>
  );
}
