import { SetupWizard } from "@/components/setup/setup-wizard";
import { loadConfig } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Setup · OIE Control Plane",
};

export default async function SetupPage() {
  const existing = await loadConfig();
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="label-mono mb-2">First-time setup</p>
        <h1 className="font-display text-2xl font-bold text-ink-50">
          Tailor the platform to your business
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          Configure your ICP, offer, and messaging once. The agent, scoring engine, and knowledge
          base all update immediately — no code changes needed.
        </p>
      </header>
      <SetupWizard existing={existing} />
    </div>
  );
}
