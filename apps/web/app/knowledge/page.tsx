import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge · GenRiver Revenue OS",
};

export default function KnowledgePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Knowledge</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Ask the sales canon: frameworks, objection handling, the Dubai/UAE playbook, discovery,
          closing, and the GenRiver product and competitive facts. Every answer is grounded in the
          canon and names the framework it draws on. GenRiver specifics you must confirm show as{" "}
          <code className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[12px] text-teal-300">
            &lt;CONFIRM&gt;
          </code>
          .
        </p>
      </header>
      <KnowledgeWorkspace />
    </div>
  );
}
