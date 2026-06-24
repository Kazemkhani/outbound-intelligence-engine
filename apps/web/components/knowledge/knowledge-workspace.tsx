"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, BookOpen, Loader2, Send, Sparkles } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { EmptyState } from "@/components/ui/states";
import { askKnowledge, type KnowledgeResult } from "@/app/knowledge/actions";

const SUGGESTIONS = [
  "How do I handle 'we already have an answering service'?",
  "Give me a SPIN discovery sequence for a Dubai brokerage owner.",
  "What's the Gap Selling pitch for an off-plan developer drowning in portal leads?",
  "How should I open a cold WhatsApp to a Property Finder advertiser?",
  "What makes Huscribe different from a generic AI voice bot?",
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
    startTransition(async () => {
      let res: KnowledgeResult;
      try {
        res = await askKnowledge(trimmed);
      } catch {
        setError("Something went wrong reaching the model. Try again.");
        return;
      }
      if (res.ok) {
        setThread((prev) => [{ id: nextId, question: res.question, answer: res.answer }, ...prev]);
        setNextId((n) => n + 1);
        setQuestion("");
      } else {
        setError(res.error ?? "The model did not return an answer. Try again.");
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
          placeholder="e.g. How do I reframe price when a broker says Huscribe is too expensive?"
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
              <header className="border-b border-ink-800 bg-ink-900/60 px-6 py-4">
                <p className="label-mono mb-1 text-gold-400">Question</p>
                <p className="text-sm font-medium text-ink-100">{qa.question}</p>
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
