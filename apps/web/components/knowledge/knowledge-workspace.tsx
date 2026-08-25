"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, BookOpen, Loader2, Send, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/states";

const SUGGESTIONS = [
  "How do I handle 'we already tried outbound and it didn't work'?",
  "Give me a SPIN discovery sequence for a UK SaaS founder.",
  "What's the Gap Selling pitch for a B2B company burning budget on SDRs with no pipeline?",
  "How should I open a cold LinkedIn message to a Head of Sales who just got hired?",
  "How should I explain the configured product without inventing proof?",
];

interface QA {
  id: number;
  question: string;
  answer: string;
}

export function KnowledgeWorkspace() {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<QA[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [nextId, setNextId] = useState(1);
  const latestAnswerRef = useRef<HTMLElement>(null);

  // Move focus to the newest answer when it arrives so keyboard and screen-reader
  // users land on the response instead of staying on the (now-cleared) input.
  useEffect(() => {
    if (thread.length > 0) latestAnswerRef.current?.focus();
  }, [thread.length]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 3 || isPending) return;
    setError(null);
    const id = nextId;
    startTransition(async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        if (!res.ok || !res.body) {
          const msg =
            (await res.text().catch(() => "")) || "The model did not return an answer. Try again.";
          setError(msg);
          return;
        }
        // Seed the answer entry, then stream tokens into it as they arrive.
        setThread((prev) => [{ id, question: trimmed, answer: "" }, ...prev]);
        setNextId((n) => n + 1);
        setQuestion("");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setThread((prev) => prev.map((qa) => (qa.id === id ? { ...qa, answer: acc } : qa)));
        }
      } catch {
        setError("Something went wrong reaching the model. Try again.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Ask box */}
      <div className="surface p-5">
        <label htmlFor="knowledge-q" className="label-mono mb-2 block">
          Ask the canon
        </label>
        <textarea
          id="knowledge-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit(question);
            }
          }}
          rows={3}
          placeholder="e.g. How should I explore a price objection without inventing ROI?"
          className="input-field w-full resize-y"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            Grounded in the sales canon. <kbd className="font-mono text-[11px]">Cmd/Ctrl</kbd> +{" "}
            <kbd className="font-mono text-[11px]">Enter</kbd> to ask.
          </p>
          <button
            type="button"
            onClick={() => submit(question)}
            disabled={isPending || question.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Thinking
              </>
            ) : (
              <>
                <Send size={16} aria-hidden="true" />
                Ask
              </>
            )}
          </button>
        </div>

        {/* Suggestions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                submit(s);
              }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition-colors hover:border-gold-500/40 hover:text-gold-200 disabled:opacity-50"
            >
              <Sparkles size={12} aria-hidden="true" className="text-gold-500" />
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Live status for screen readers while the model answers */}
      <p className="sr-only" role="status">
        {isPending ? "Generating answer…" : ""}
      </p>

      {/* Thread */}
      {thread.length === 0 && !isPending ? (
        <div className="surface p-2">
          <EmptyState
            icon={<BookOpen size={48} />}
            title="Ask your first question"
            description="Answers are grounded in the sales canon and name the framework behind them. Nothing here is generic AI advice."
          />
        </div>
      ) : (
        <div className="space-y-4" role="feed" aria-busy={isPending} aria-label="Answers">
          {thread.map((qa, i) => (
            <article
              key={qa.id}
              ref={i === 0 ? latestAnswerRef : undefined}
              tabIndex={i === 0 ? -1 : undefined}
              aria-label={`Answer to: ${qa.question}`}
              className="surface overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40"
            >
              <header className="flex items-start justify-between gap-3 border-b border-ink-800 bg-ink-900/60 px-6 py-4">
                <div className="min-w-0">
                  <p className="label-mono mb-1 text-gold-400">Question</p>
                  <p className="text-sm font-medium text-ink-100">{qa.question}</p>
                </div>
                <CopyButton text={qa.answer} label="Copy answer" />
              </header>
              <div className="px-6 py-5">
                <Markdown source={qa.answer} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
