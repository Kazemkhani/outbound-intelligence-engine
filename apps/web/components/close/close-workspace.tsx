"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  ClipboardList,
  Coins,
  Loader2,
  MessageSquareText,
  Sparkles,
  Swords,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type { ScoredLead } from "@/lib/fixtures";
import {
  coachTranscript,
  computeRoi,
  generateOutreach,
  generatePrep,
} from "@/app/close/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "prep" | "outreach" | "coach" | "roi";

interface ActionResult {
  ok: boolean;
  title: string;
  body: string;
  error?: string;
}

const TIER_VARIANT = {
  A: "tier_a",
  B: "tier_b",
  C: "tier_c",
  D: "tier_d",
} as const;

const BLURBS: Record<TabId, string> = {
  prep:
    "An elite battlecard for this prospect: value hypothesis, a Challenger teaching insight, a SPIN discovery set, the five likely objections, and the single next step to push for.",
  outreach:
    "A ready-to-send outbound pack: cold-call opener, WhatsApp in English and Gulf Arabic, a voice-note script, and an email. Phone- and WhatsApp-first, implication over compliment.",
  coach:
    "Paste a call transcript or your notes. Get a post-call scorecard, the biggest leak, three concrete fixes, and the single highest-leverage next action for this deal.",
  roi:
    "Turn the prospect's own numbers into a Gap Selling narrative and a credible one-pager. The arithmetic is computed here; the LLM only frames it. Numbers are never invented.",
};

const TABS: Array<{ id: TabId; label: string; icon: typeof Swords }> = [
  { id: "prep", label: "Prep", icon: ClipboardList },
  { id: "outreach", label: "Outreach", icon: MessageSquareText },
  { id: "coach", label: "Coach", icon: Sparkles },
  { id: "roi", label: "ROI", icon: Coins },
];

// ── Workspace ───────────────────────────────────────────────────────────────────

export function CloseWorkspace({ leads }: { leads: ScoredLead[] }) {
  const [selectedId, setSelectedId] = useState<string>(leads[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<TabId>("prep");

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  if (leads.length === 0) {
    return (
      <div className="surface p-2">
        <EmptyState
          icon={<Swords size={48} />}
          title="No leads to work"
          description="Score and rank leads first. Once a lead is in the pipeline it shows up here, ready to prep, message, coach, and price."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lead selector */}
      <div className="surface p-5">
        <label htmlFor="close-lead" className="label-mono mb-2 block">
          Working lead
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="close-lead"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="input-field max-w-xl flex-1"
          >
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.company.name} · {lead.contact.fullName} · Tier {lead.score.tier}
              </option>
            ))}
          </select>
          {selectedLead && (
            <div className="flex items-center gap-2">
              <Badge variant={TIER_VARIANT[selectedLead.score.tier]}>
                Tier {selectedLead.score.tier}
              </Badge>
              <span className="pill pill-muted">Fit {Math.round(selectedLead.score.fit)}</span>
              <span className="pill pill-muted">
                Intent {Math.round(selectedLead.score.intent)}
              </span>
            </div>
          )}
        </div>
        {selectedLead && (
          <p className="mt-3 text-sm text-ink-400">
            <span className="text-ink-200">{selectedLead.contact.title || "Contact"}</span>
            {" at "}
            <span className="text-ink-200">{selectedLead.company.name}</span>
            {selectedLead.company.industry ? ` · ${selectedLead.company.industry}` : ""}
            {selectedLead.signals.length > 0
              ? ` · ${selectedLead.signals.length} live ${
                  selectedLead.signals.length === 1 ? "signal" : "signals"
                }`
              : " · no live signals"}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Closing tools" className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`close-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`close-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={
                isActive
                  ? "inline-flex items-center gap-2 rounded-lg bg-gold-500/10 px-4 py-2.5 text-sm font-semibold text-gold-300 ring-1 ring-inset ring-gold-500/25 transition-colors"
                  : "inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-transparent px-4 py-2.5 text-sm font-medium text-ink-300 transition-colors hover:border-ink-600 hover:bg-ink-800 hover:text-ink-50"
              }
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active panel */}
      {selectedLead && activeTab === "prep" && (
        <ActionPanel
          key={`prep-${selectedLead.id}`}
          tabId="prep"
          blurb={BLURBS.prep}
          ctaLabel="Build battlecard"
          ctaIcon={ClipboardList}
          run={() => generatePrep(selectedLead.id)}
        />
      )}
      {selectedLead && activeTab === "outreach" && (
        <ActionPanel
          key={`outreach-${selectedLead.id}`}
          tabId="outreach"
          blurb={BLURBS.outreach}
          ctaLabel="Draft outreach pack"
          ctaIcon={MessageSquareText}
          run={() => generateOutreach(selectedLead.id)}
        />
      )}
      {activeTab === "coach" && <CoachPanel blurb={BLURBS.coach} />}
      {activeTab === "roi" && <RoiPanel blurb={BLURBS.roi} />}
    </div>
  );
}

// ── Generic action panel (Prep / Outreach) ──────────────────────────────────────

function ActionPanel({
  tabId,
  blurb,
  ctaLabel,
  ctaIcon: CtaIcon,
  run,
}: {
  tabId: TabId;
  blurb: string;
  ctaLabel: string;
  ctaIcon: typeof Swords;
  run: () => Promise<ActionResult>;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await run();
        if (res.ok) {
          setResult(res);
        } else {
          setResult(null);
          setError(res.error ?? "The model did not return a result. Try again.");
        }
      } catch {
        setResult(null);
        setError("Something went wrong reaching the model. Try again.");
      }
    });
  };

  return (
    <section
      role="tabpanel"
      id={`close-panel-${tabId}`}
      aria-labelledby={`close-tab-${tabId}`}
      className="space-y-5"
    >
      <div className="surface p-5">
        <p className="text-sm text-ink-300">{blurb}</p>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={isPending}
            className="btn-primary"
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <CtaIcon size={16} aria-hidden="true" />
            )}
            {isPending ? "Generating…" : result ? "Regenerate" : ctaLabel}
          </button>
          {result && !isPending && (
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-teal-400">
              Draft ready · review before use
            </span>
          )}
        </div>
      </div>

      <ResultArea isPending={isPending} error={error} result={result} pendingLabel="Drafting…" />
    </section>
  );
}

// ── Coach panel ─────────────────────────────────────────────────────────────────

function CoachPanel({ blurb }: { blurb: string }) {
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = transcript.trim();
  const tooShort = trimmed.length < 40;

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await coachTranscript(trimmed);
        if (res.ok) {
          setResult(res);
        } else {
          setResult(null);
          setError(res.error ?? "The model did not return a scorecard. Try again.");
        }
      } catch {
        setResult(null);
        setError("Something went wrong reaching the model. Try again.");
      }
    });
  };

  return (
    <section
      role="tabpanel"
      id="close-panel-coach"
      aria-labelledby="close-tab-coach"
      className="space-y-5"
    >
      <div className="surface p-5">
        <p className="text-sm text-ink-300">{blurb}</p>
        <label htmlFor="coach-transcript" className="label-mono mb-2 mt-4 block">
          Call transcript or notes
        </label>
        <textarea
          id="coach-transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={12}
          placeholder="Paste the call transcript or your notes here. The more verbatim, the sharper the scorecard."
          className="input-field resize-y font-mono text-[13px] leading-relaxed"
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={isPending || tooShort}
            className="btn-primary"
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={16} aria-hidden="true" />
            )}
            {isPending ? "Scoring…" : result ? "Re-score call" : "Score the call"}
          </button>
          {tooShort && !isPending && (
            <span className="text-xs text-ink-500">Paste at least a few lines to score.</span>
          )}
        </div>
      </div>

      <ResultArea isPending={isPending} error={error} result={result} pendingLabel="Scoring…" />
    </section>
  );
}

// ── ROI panel ───────────────────────────────────────────────────────────────────

const ROI_FIELDS = [
  {
    key: "leadsPerMonth" as const,
    label: "Leads per month",
    hint: "Inbound leads across portals and forms",
    min: 0,
    step: 1,
  },
  {
    key: "pctUnanswered" as const,
    label: "% unanswered",
    hint: "Share of leads never reached or called back",
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "avgCommissionAed" as const,
    label: "Avg commission (AED)",
    hint: "Average commission per closed deal",
    min: 0,
    step: 100,
  },
  {
    key: "closeRatePct" as const,
    label: "Close rate %",
    hint: "Deals closed per qualified lead",
    min: 0,
    max: 100,
    step: 1,
  },
];

type RoiKey = (typeof ROI_FIELDS)[number]["key"];

function RoiPanel({ blurb }: { blurb: string }) {
  const [values, setValues] = useState<Record<RoiKey, string>>({
    leadsPerMonth: "200",
    pctUnanswered: "45",
    avgCommissionAed: "30000",
    closeRatePct: "10",
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed = useMemo(
    () => ({
      leadsPerMonth: Number(values.leadsPerMonth),
      pctUnanswered: Number(values.pctUnanswered),
      avgCommissionAed: Number(values.avgCommissionAed),
      closeRatePct: Number(values.closeRatePct),
    }),
    [values],
  );

  const allValid = (Object.values(parsed) as number[]).every(
    (n) => Number.isFinite(n) && n >= 0,
  );

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await computeRoi(parsed);
        if (res.ok) {
          setResult(res);
        } else {
          setResult(null);
          setError(res.error ?? "The model did not return an ROI case. Try again.");
        }
      } catch {
        setResult(null);
        setError("Something went wrong computing the ROI case. Try again.");
      }
    });
  };

  return (
    <section
      role="tabpanel"
      id="close-panel-roi"
      aria-labelledby="close-tab-roi"
      className="space-y-5"
    >
      <div className="surface p-5">
        <p className="text-sm text-ink-300">{blurb}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ROI_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={`roi-${field.key}`} className="label-mono mb-2 block">
                {field.label}
              </label>
              <input
                id={`roi-${field.key}`}
                type="number"
                inputMode="decimal"
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="input-field"
              />
              <p className="mt-1.5 text-xs text-ink-500">{field.hint}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={isPending || !allValid}
            className="btn-primary"
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Coins size={16} aria-hidden="true" />
            )}
            {isPending ? "Computing…" : result ? "Recompute case" : "Compute ROI case"}
          </button>
          {!allValid && !isPending && (
            <span className="text-xs text-ink-500">Enter non-negative numbers in every field.</span>
          )}
        </div>
      </div>

      <ResultArea
        isPending={isPending}
        error={error}
        result={result}
        pendingLabel="Computing…"
        headline={result ? extractPayback(result.body) : null}
      />
    </section>
  );
}

// ── Result area (shared loading / error / output) ────────────────────────────────

function ResultArea({
  isPending,
  error,
  result,
  pendingLabel,
  headline,
}: {
  isPending: boolean;
  error: string | null;
  result: ActionResult | null;
  pendingLabel: string;
  headline?: string | null;
}) {
  if (isPending) {
    return (
      <div className="surface flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={32} className="animate-spin text-gold-500" aria-hidden="true" />
        <p className="text-sm text-ink-400">{pendingLabel}</p>
        <p className="max-w-sm text-center text-xs text-ink-600">
          Grounded in the APEX sales canon. This can take a moment on the deep model.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="surface flex flex-col items-center justify-center gap-3 py-14 text-center"
      >
        <AlertCircle size={36} className="text-red-400" aria-hidden="true" />
        <p className="text-base font-medium text-ink-100">Could not generate</p>
        <p className="max-w-md text-sm text-ink-400">{error}</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="surface">
        <EmptyState
          icon={<Sparkles size={44} />}
          title="Nothing generated yet"
          description="Run the tool above to produce a draft. Outputs are grounded in the sales canon and are yours to edit before use."
        />
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-6 py-4">
        <h2 className="font-display text-base font-bold text-ink-50">{result.title}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
          Draft · review before use
        </span>
      </div>

      {headline && (
        <div className="border-b border-ink-800 bg-gold-500/[0.06] px-6 py-5">
          <p className="label-mono mb-1 text-gold-400">Estimated payback</p>
          <p className="font-display text-2xl font-bold text-gold-300">{headline}</p>
        </div>
      )}

      <div className="px-6 py-5">
        <Markdown source={result.body} />
      </div>
    </div>
  );
}

// ── Payback extraction for the ROI headline ──────────────────────────────────────

/**
 * Pull a prominent payback / headline figure out of the ROI markdown so it can be
 * surfaced above the fold. Best-effort: looks for a line mentioning payback, then
 * falls back to the first AED figure. Returns null if neither is found.
 */
function extractPayback(body: string): string | null {
  const lines = body.split("\n");
  const paybackLine = lines.find((l) => /payback/i.test(l));
  if (paybackLine) {
    const cleaned = stripInline(paybackLine).replace(/^[#>*\-\s]+/, "").trim();
    if (cleaned) return cleaned;
  }
  const aedMatch = body.match(/AED\s*[\d.,]+(?:\s*(?:per|\/)\s*\w+)?/i);
  if (aedMatch) return aedMatch[0].trim();
  return null;
}

// ── Minimal, dependency-free markdown renderer (dark, gold ## headers) ───────────

/** Strip inline markdown markers from a single line of text. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+?)`/g, "$1")
    .replace(/\*(.+?)\*/g, "$1");
}

/** Render inline bold / code / italic into React nodes. Order matters. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenise on **bold**, `code`, and *italic* in a single pass.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${i}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
      i += 1;
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-ink-50">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[12px] text-teal-300"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-i-${i}`} className="italic text-ink-100">
          {token.slice(1, -1)}
        </em>,
      );
    }
    i += 1;
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

type Block =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "p"; text: string };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+/;
const UL_RE = /^\s*[-*+]\s+/;

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");
const splitRow = (l: string) =>
  l
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Parse markdown into a flat list of blocks. Handles the shapes the APEX prompts emit. */
function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  // Indexing under noUncheckedIndexedAccess: always read through this helper so the
  // result is a guaranteed string (empty string for out-of-range), never undefined.
  const at = (idx: number): string => lines[idx] ?? "";

  while (i < lines.length) {
    const line = at(i);
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !at(i).trim().startsWith("```")) {
        buf.push(at(i));
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    // Headings (#### and deeper fold into h3)
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      const level = (headingMatch[1] ?? "").length;
      const text = (headingMatch[2] ?? "").replace(/\s*#+\s*$/, "");
      blocks.push({ kind: level <= 2 ? "h2" : "h3", text });
      i += 1;
      continue;
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isDivider(at(i + 1))) {
      const header = splitRow(line);
      i += 2; // header + divider
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(at(i))) {
        rows.push(splitRow(at(i)));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Ordered list
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(at(i))) {
        items.push(at(i).replace(OL_RE, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Unordered list
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(at(i))) {
        items.push(at(i).replace(UL_RE, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-structural lines
    const para: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = at(i);
      const nextTrim = next.trim();
      if (
        nextTrim === "" ||
        HEADING_RE.test(nextTrim) ||
        nextTrim.startsWith("```") ||
        OL_RE.test(next) ||
        UL_RE.test(next) ||
        isTableRow(next)
      ) {
        break;
      }
      para.push(nextTrim);
      i += 1;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }

  return blocks;
}

function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);

  if (blocks.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-200">{source}</p>;
  }

  return (
    <div className="space-y-4 text-sm leading-relaxed text-ink-200">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "h2":
            return (
              <h3
                key={idx}
                className="mt-6 font-display text-lg font-bold text-gold-300 first:mt-0"
              >
                {renderInline(block.text, `h2-${idx}`)}
              </h3>
            );
          case "h3":
            return (
              <h4 key={idx} className="mt-4 font-display text-sm font-bold text-ink-50">
                {renderInline(block.text, `h3-${idx}`)}
              </h4>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-900 p-4"
              >
                <code className="font-mono text-[12.5px] leading-relaxed text-ink-100">
                  {block.text}
                </code>
              </pre>
            );
          case "ul":
            return (
              <ul key={idx} className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `ul-${idx}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="list-decimal space-y-1.5 pl-5 marker:text-gold-400">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `ol-${idx}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={idx} className="overflow-x-auto rounded-lg border border-ink-800">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-800 bg-ink-900">
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          className="px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400"
                        >
                          {renderInline(cell, `th-${idx}-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-ink-800/60 last:border-0">
                        {row.map((cell, c) => (
                          <td key={c} className="px-4 py-2.5 text-ink-200">
                            {renderInline(cell, `td-${idx}-${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "p":
          default:
            return (
              <p key={idx} className="text-ink-200">
                {renderInline(block.text, `p-${idx}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
