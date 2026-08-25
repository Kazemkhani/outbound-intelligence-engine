"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Zap,
  AlertCircle,
} from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  state: "running" | "done" | "error";
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCall[];
}

interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// SSE event shapes from /api/agent
type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; toolName: string; result: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Suggestions ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Find owners and directors of conference businesses happening in the next 3-6 months in the UK",
  "Discover Head of Sales at SaaS companies with 50-500 employees in the US",
  "Find CEOs of staffing agencies in the UAE and Saudi Arabia",
  "How many leads are in the pipeline right now?",
  "Search for B2B fintech companies that recently raised a Series A in London",
  "Find founders of AI startups that hired a Head of Sales in the last 3 months",
];

// ── Tool metadata ─────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  discoverLeads: { label: "Searching Apollo", Icon: Users, color: "text-sky-400" },
  findEventCompanies: { label: "Researching events", Icon: Search, color: "text-purple-400" },
  getLeadStats: { label: "Querying pipeline", Icon: TrendingUp, color: "text-emerald-400" },
  searchWeb: { label: "Searching the web", Icon: Zap, color: "text-gold-400" },
};

// ── Tool result helpers ───────────────────────────────────────────────────────

function getArgSummary(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "discoverLeads") {
    const { titles, industries, locations } = args as {
      titles?: string[];
      industries?: string[];
      locations?: string[];
    };
    return [
      titles?.slice(0, 2).join(", "),
      industries?.slice(0, 1).join(""),
      locations?.slice(0, 2).join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (toolName === "findEventCompanies") {
    const { query, timeframe, location } = args as {
      query?: string;
      timeframe?: string;
      location?: string;
    };
    return [query, timeframe, location].filter(Boolean).join(" · ");
  }
  if (toolName === "searchWeb") {
    return String((args as { query?: string }).query ?? "");
  }
  return "";
}

interface ResultSummary {
  type: "success" | "error";
  text: string;
  nav?: string;
}

function getResultSummary(toolName: string, result: unknown): ResultSummary | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;

  if (r.error) return { type: "error", text: String(r.error) };

  if ("imported" in r) {
    const nav = r.segmentId ? `/leads?segment=${r.segmentId as string}` : "/leads";
    return { type: "success", text: `Imported ${r.imported as number} leads`, nav };
  }

  if ("total" in r && "byTier" in r) {
    const bt = r.byTier as Record<string, number>;
    const parts = Object.entries(bt)
      .map(([k, v]) => `Tier ${k}: ${v}`)
      .join(", ");
    return { type: "success", text: `${r.total as number} total leads. ${parts}`, nav: "/leads" };
  }

  if ("results" in r) {
    const results = r.results as unknown[];
    return { type: "success", text: `Found ${results.length} results` };
  }

  if ("companiesFound" in r) {
    const nav = r.segmentId ? `/leads?segment=${r.segmentId as string}` : "/leads";
    return {
      type: "success",
      text: `Found ${r.companiesFound as number} companies, imported ${(r.imported as number) ?? 0} leads`,
      nav,
    };
  }

  return null;
}

// ── ElapsedTimer ──────────────────────────────────────────────────────────────

function ElapsedTimer() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="ml-auto font-mono text-[10px] text-ink-600">{secs}s</span>;
}

// ── ToolCallCard ──────────────────────────────────────────────────────────────

function ToolCallCard({ call, onNav }: { call: ToolCall; onNav: (path: string) => void }) {
  const meta = TOOL_META[call.toolName] ?? {
    label: call.toolName,
    Icon: Zap,
    color: "text-ink-400",
  };
  const argSummary = getArgSummary(call.toolName, call.args);
  const resultSummary = call.result ? getResultSummary(call.toolName, call.result) : null;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-ink-800 bg-ink-900/80 text-sm">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        {call.state === "running" ? (
          <Loader2 size={13} className={`animate-spin ${meta.color}`} aria-hidden="true" />
        ) : resultSummary?.type === "error" ? (
          <AlertCircle size={13} className="text-red-400" aria-hidden="true" />
        ) : (
          <CheckCircle2 size={13} className="text-emerald-400" aria-hidden="true" />
        )}
        <meta.Icon size={13} className={meta.color} aria-hidden="true" />
        <span className="font-semibold text-ink-200">{meta.label}</span>
        {argSummary && <span className="truncate max-w-xs text-ink-500">{argSummary}</span>}
        {call.state === "running" && <ElapsedTimer />}
      </div>

      {resultSummary && (
        <div
          className={`flex items-center justify-between gap-3 border-t border-ink-800 px-4 py-2 ${
            resultSummary.type === "error" ? "bg-red-500/5" : "bg-emerald-500/5"
          }`}
        >
          <p
            className={`text-xs ${resultSummary.type === "error" ? "text-red-300" : "text-emerald-300"}`}
          >
            {resultSummary.text}
          </p>
          {resultSummary.nav && (
            <button
              type="button"
              onClick={() => onNav(resultSummary.nav!)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10"
            >
              View <ArrowRight size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sessions sidebar ──────────────────────────────────────────────────────────

function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: ChatSessionMeta[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-ink-800 bg-ink-950">
      <div className="flex items-center justify-between border-b border-ink-800 px-3 py-3">
        <span className="label-mono text-ink-500">Chats</span>
        <button
          type="button"
          onClick={onNew}
          title="New chat"
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-800 hover:text-gold-400"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        {sessions.length === 0 && (
          <p className="px-3 py-4 text-xs text-ink-600 leading-relaxed">
            Chats are saved automatically after each exchange.
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`group flex items-start gap-1 rounded-lg mx-1.5 px-2.5 py-2 transition-colors cursor-pointer ${
              activeSessionId === s.id
                ? "bg-gold-500/10 text-gold-300"
                : "text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            }`}
            onClick={() => onSelect(s.id)}
          >
            <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium leading-tight">{s.title}</p>
              <p className="mt-0.5 text-[10px] text-ink-600">
                {new Date(s.updatedAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              title="Delete"
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
            >
              <Trash2 size={11} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentWorkspace() {
  const router = useRouter();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCost, setSessionCost] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleNav = useCallback(
    (path: string) => {
      router.refresh();
      router.push(path);
    },
    [router],
  );

  // Load session list on mount
  useEffect(() => {
    fetch("/api/agent/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(data as ChatSessionMeta[]))
      .catch(() => null);
  }, []);

  const saveSession = useCallback(async (msgs: AgentMessage[], sid: string | null) => {
    if (msgs.length < 2) return sid; // need at least user + assistant
    const userMsg = msgs.find((m) => m.role === "user");
    const title = (userMsg?.text ?? "Chat").slice(0, 80);
    try {
      const res = await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid ?? undefined, title, messages: msgs }),
      });
      const data = (await res.json()) as { id: string };
      // Refresh sidebar
      const list = (await fetch("/api/agent/sessions").then((r) => r.json())) as ChatSessionMeta[];
      setSessions(list);
      return data.id;
    } catch {
      return sid;
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agent/sessions/${id}`);
      const data = (await res.json()) as { id: string; messages: AgentMessage[] };
      setMessages(data.messages);
      setSessionId(data.id);
      setError(null);
      setSessionCost(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    } catch {
      setError("Failed to load session.");
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setSessionCost(0);
    setInput("");
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      await fetch(`/api/agent/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) startNewChat();
    },
    [sessionId, startNewChat],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      setError(null);
      setInput("");
      setIsLoading(true);

      const userMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        toolCalls: [],
      };

      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "",
        toolCalls: [],
      };

      const assistantId = assistantMsg.id;

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      scrollToBottom();

      abortRef.current = new AbortController();

      try {
        const history = messages.flatMap<{ role: "user" | "assistant"; content: string }>((m) =>
          m.role === "user" || m.text ? [{ role: m.role, content: m.text || "(tool calls)" }] : [],
        );
        history.push({ role: "user", content: trimmed });

        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const msg = await res.text().catch(() => "Unknown error");
          throw new Error(msg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const processEvent = (line: string) => {
          if (!line.trim()) return;
          let event: AgentEvent;
          try {
            event = JSON.parse(line) as AgentEvent;
          } catch {
            return;
          }

          setMessages((prev) =>
            prev.map((m): AgentMessage => {
              if (m.id !== assistantId) return m;
              if (event.type === "text") {
                return { ...m, text: m.text + event.text };
              }
              if (event.type === "tool_start") {
                return {
                  ...m,
                  toolCalls: [
                    ...m.toolCalls,
                    {
                      id: event.toolCallId,
                      toolName: event.toolName,
                      args: event.args,
                      state: "running",
                    },
                  ],
                };
              }
              if (event.type === "tool_result") {
                return {
                  ...m,
                  toolCalls: m.toolCalls.map((tc) =>
                    tc.id === event.toolCallId
                      ? { ...tc, result: event.result, state: "done" }
                      : tc,
                  ),
                };
              }
              if (event.type === "error") {
                setError(event.message);
              }
              if (event.type === "usage") {
                setSessionCost((prev) => prev + event.costUsd);
              }
              return m;
            }),
          );

          scrollToBottom();
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) processEvent(line);
        }
        if (buf.trim()) processEvent(buf);

        // Refresh page data and save session
        router.refresh();
        setMessages((finalMsgs) => {
          void saveSession(finalMsgs, sessionId).then((newId) => {
            if (newId && !sessionId) setSessionId(newId);
          });
          return finalMsgs;
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, router, scrollToBottom, saveSession, sessionId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onSelect={loadSession}
        onNew={startNewChat}
        onDelete={deleteSession}
      />

      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="mx-auto max-w-2xl">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-500/10 ring-1 ring-inset ring-gold-500/20">
                  <Sparkles size={24} className="text-gold-400" aria-hidden="true" />
                </div>
                <h2 className="font-display text-xl font-bold text-ink-50">OIE Agent</h2>
                <p className="mt-2 text-sm text-ink-400">
                  Describe what you want in plain English. The agent searches, enriches, and imports
                  leads directly into the platform — no manual setup needed.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="group rounded-xl border border-ink-700 bg-ink-850 p-3.5 text-left text-sm text-ink-300 transition-all hover:border-gold-500/30 hover:bg-ink-800 hover:text-ink-100"
                  >
                    <Sparkles
                      size={12}
                      className="mb-1.5 text-gold-500 transition-colors group-hover:text-gold-400"
                      aria-hidden="true"
                    />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold-500/10 ring-1 ring-inset ring-gold-500/20">
                  <Bot size={14} className="text-gold-400" aria-hidden="true" />
                </div>
              )}

              <div className="max-w-2xl min-w-0 flex-1">
                {m.role === "user" ? (
                  <div className="inline-block max-w-full rounded-2xl rounded-tr-sm bg-ink-700 px-4 py-2.5 text-sm text-ink-100">
                    {m.text}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {m.toolCalls.map((tc) => (
                      <ToolCallCard key={tc.id} call={tc} onNav={handleNav} />
                    ))}
                    {m.text && (
                      <div className="rounded-2xl rounded-tl-sm border border-ink-800 bg-ink-850 px-4 py-3 text-sm">
                        <Markdown source={m.text} />
                      </div>
                    )}
                    {isLoading && m.toolCalls.length === 0 && !m.text && (
                      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-ink-800 bg-ink-850 px-4 py-3">
                        <Loader2 size={13} className="animate-spin text-gold-400" />
                        <span className="text-sm text-ink-400">Thinking…</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-ink-800 bg-ink-950 px-6 py-4">
          {sessionId && (
            <div className="mb-2 flex items-center gap-2">
              <Pencil size={11} className="text-ink-600" aria-hidden="true" />
              <span className="text-[11px] text-ink-600">
                {sessions.find((s) => s.id === sessionId)?.title ?? "Saved chat"}
              </span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder="Tell the agent what to do — e.g. 'Find founders of B2B SaaS companies in London with 50-200 employees'"
              className="input-field flex-1 resize-none text-sm"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="self-end inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between gap-4">
            <p className="text-[11px] text-ink-600">
              <kbd className="font-mono">Cmd/Ctrl + Enter</kbd> to send. DRY_RUN active — no
              messages sent.
            </p>
            <p className="shrink-0 text-[11px] text-ink-600">
              <span className="text-ink-500">claude-opus-4-8</span>
              <span className="mx-1.5 text-ink-700">·</span>
              {sessionCost > 0 ? (
                <span className="text-ink-400">
                  session:{" "}
                  <span className="text-gold-400 font-mono">${sessionCost.toFixed(4)}</span>
                </span>
              ) : (
                <span>~$0.02–0.08 / message</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
