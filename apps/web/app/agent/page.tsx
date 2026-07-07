import { AgentWorkspace } from "@/components/agent/agent-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Agent · GenRiver Revenue OS",
};

export default function AgentPage() {
  return (
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b border-ink-800 px-6 py-4">
        <h1 className="font-display text-xl font-bold text-ink-50">GenRiver Agent</h1>
        <p className="mt-0.5 text-sm text-ink-400">
          Natural language control for the entire platform. Discover leads, research companies,
          query the pipeline — all from a single prompt.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <AgentWorkspace />
      </div>
    </div>
  );
}
