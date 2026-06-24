"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, Award, Dumbbell, Loader2, RotateCcw, Send, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { CopyButton } from "@/components/ui/copy-button";
import { prospectReply, scoreRoleplay } from "@/app/dojo/actions";
import type { DojoScenario, DojoTurn } from "@/app/dojo/scenarios";

const DIFFICULTY_VARIANT: Record<DojoScenario["difficulty"], "tier_a" | "tier_b" | "tier_d"> = {
  Warm: "tier_a",
  Tough: "tier_b",
  Brutal: "tier_d",
};

export function DojoWorkspace({ scenarios }: { scenarios: DojoScenario[] }) {
  const [scenario, setScenario] = useState<DojoScenario | null>(null);
  const [turns, setTurns] = useState<DojoTurn[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<string | null>(null);
  const [isReplying, startReply] = useTransition();
  const [isScoring, startScoring] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const busy = isReplying || isScoring;

  // Keep the keyboard in the conversation: focus the input when a scenario starts
  // and again each time the prospect finishes replying, so a keyboard or screen
  // reader user never has to hunt for where to type next.
  useEffect(() => {
    if (scenario && !isReplying) inputRef.current?.focus();
  }, [scenario, isReplying]);

  const start = (s: DojoScenario) => {
    setScenario(s);
    setTurns([{ role: "prospect", text: s.opener }]);
    setInput("");
    setError(null);
    setScore(null);
  };

  const reset = () => {
    setScenario(null);
    setTurns([]);
    setInput("");
    setError(null);
    setScore(null);
  };

  const send = () => {
    const line = input.trim();
    if (!scenario || line.length < 1 || busy) return;
    setError(null);
    const next: DojoTurn[] = [...turns, { role: "operator", text: line }];
    setTurns(next);
    setInput("");
    startReply(async () => {
      try {
        const res = await prospectReply(scenario.id, next);
        if (res.ok) {
          setTurns((prev) => [...prev, { role: "prospect", text: res.reply }]);
        } else {
          setError(res.error ?? "The prospect could not respond.");
        }
      } catch {
        setError("Something went wrong reaching the model. Try again.");
      }
    });
  };

  const endAndScore = () => {
    if (!scenario || busy) return;
    setError(null);
    startScoring(async () => {
      try {
        const res = await scoreRoleplay(scenario.id, turns);
        if (res.ok) {
          setScore(res.body);
          requestAnimationFrame(() => threadRef.current?.scrollIntoView({ behavior: "smooth" }));
        } else {
          setError(res.error ?? "Scoring failed.");
        }
      } catch {
        setError("Something went wrong reaching the model. Try again.");
      }
    });
  };

  // ── Scenario picker ───────────────────────────────────────────────────────────
  if (!scenario) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => start(s)}
            aria-label={`Start roleplay: ${s.name}. Difficulty ${s.difficulty}. ${s.blurb}`}
            className="surface group flex flex-col gap-3 p-5 text-left transition-colors hover:border-gold-500/40 focus-visible:border-gold-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-display text-base font-bold text-ink-50">{s.name}</span>
              <Badge variant={DIFFICULTY_VARIANT[s.difficulty]}>{s.difficulty}</Badge>
            </div>
            <p className="text-sm text-ink-400">{s.blurb}</p>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {s.tags.map((t) => (
                <span key={t} className="pill pill-muted text-[11px]">
                  {t}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Active roleplay ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Dumbbell size={18} className="text-gold-400" aria-hidden="true" />
          <span className="font-display text-sm font-bold text-ink-50">{scenario.name}</span>
          <Badge variant={DIFFICULTY_VARIANT[scenario.difficulty]}>{scenario.difficulty}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={endAndScore}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm font-semibold text-gold-300 transition-colors hover:bg-gold-500/20 disabled:opacity-50"
          >
            {isScoring ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Award size={15} aria-hidden="true" />
            )}
            End &amp; score
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-50 disabled:opacity-50"
          >
            <RotateCcw size={15} aria-hidden="true" />
            New scenario
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div
        className="surface space-y-4 p-5"
        role="log"
        aria-label="Roleplay conversation"
        aria-live="polite"
        aria-busy={isReplying}
      >
        {turns.map((t, i) => (
          <div
            key={i}
            className={t.role === "operator" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                t.role === "operator"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-gold-500/15 px-4 py-2.5 text-sm text-ink-50 ring-1 ring-inset ring-gold-500/20"
                  : "max-w-[80%] rounded-2xl rounded-bl-sm bg-ink-800 px-4 py-2.5 text-sm text-ink-100"
              }
            >
              <span className="label-mono mb-1 block text-[10px] opacity-70">
                {t.role === "operator" ? "You" : "Prospect"}
              </span>
              {t.text}
            </div>
          </div>
        ))}
        {isReplying && (
          <div className="flex justify-start" role="status">
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm bg-ink-800 px-4 py-2.5 text-sm text-ink-400">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Prospect is thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="surface p-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            aria-label="Your line to the prospect"
            aria-keyshortcuts="Meta+Enter Control+Enter"
            placeholder="Your line. Lead with an implication tied to their numbers, or a sharp discovery question."
            className="input-field w-full resize-y"
            disabled={busy}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || input.trim().length < 1}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} aria-hidden="true" />
            Send
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
          <User size={12} aria-hidden="true" />
          You play the seller. <kbd className="font-mono text-[11px]">Cmd/Ctrl</kbd> +{" "}
          <kbd className="font-mono text-[11px]">Enter</kbd> to send.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Scorecard */}
      {score && (
        <article ref={threadRef} className="surface overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-ink-800 bg-ink-900/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-gold-400" aria-hidden="true" />
              <span className="font-display text-sm font-bold text-ink-50">Your scorecard</span>
            </div>
            <CopyButton text={score} label="Copy scorecard" />
          </header>
          <div className="px-6 py-5">
            <Markdown source={score} />
          </div>
        </article>
      )}
    </div>
  );
}
