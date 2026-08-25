"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Markdown, stripInline } from "@/components/ui/markdown";
import { CopyButton } from "@/components/ui/copy-button";
import { coachTranscript, computeRoi, generateOutreach, generatePrep } from "@/app/close/actions";

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
  prep: "An elite battlecard for this prospect: value hypothesis, a Challenger teaching insight, a SPIN discovery set, the five likely objections, and the single next step to push for.",
  outreach:
    "A ready-to-send outbound pack: cold-call opener, WhatsApp in English and Gulf Arabic, a voice-note script, and an email. Phone- and WhatsApp-first, implication over compliment.",
  coach:
    "Paste a call transcript or your notes. Get a post-call scorecard, the biggest leak, three concrete fixes, and the single highest-leverage next action for this deal.",
  roi: "Turn the prospect's own numbers into a Gap Selling narrative and a credible one-pager. The arithmetic is computed here; the LLM only frames it. Numbers are never invented.",
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
          <button type="button" onClick={handleRun} disabled={isPending} className="btn-primary">
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

  const allValid = (Object.values(parsed) as number[]).every((n) => Number.isFinite(n) && n >= 0);

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
                onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
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
          Grounded in the product-neutral sales canon. This can take a moment on the deep model.
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
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-500">
            Draft · review before use
          </span>
          <CopyButton text={result.body} />
        </div>
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
    const cleaned = stripInline(paybackLine)
      .replace(/^[#>*\-\s]+/, "")
      .trim();
    if (cleaned) return cleaned;
  }
  const aedMatch = body.match(/AED\s*[\d.,]+(?:\s*(?:per|\/)\s*\w+)?/i);
  if (aedMatch) return aedMatch[0].trim();
  return null;
}
