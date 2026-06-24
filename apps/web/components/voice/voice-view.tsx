"use client";

import { useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  PhoneCall,
  PhoneOff,
  Smartphone,
  ThumbsUp,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatRelative } from "@/lib/utils";
import type { CallFindingView, CallSessionView } from "@/lib/data";

const NOW = new Date();

/**
 * Map a NOVA call status to one of the existing Badge variants. Anything not
 * explicitly listed falls back to the neutral "default" chip so unknown states
 * from the provider still render on-system rather than crashing.
 */
const STATUS_VARIANT: Record<
  string,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  completed: "approved",
  in_progress: "tier_b",
  pending: "awaiting",
  no_answer: "tier_c",
  failed: "rejected",
};

/** Human-readable label for a status, including unknown provider values. */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    completed: "Completed",
    in_progress: "In progress",
    pending: "Pending",
    no_answer: "No answer",
    failed: "Failed",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

/**
 * Canonical CallFinding keys (master-DB contract) mapped to a display label and
 * an icon. The order here drives the order findings render in, so the most
 * decision-relevant facts surface first.
 */
const FINDING_META: Array<{
  key: string;
  label: string;
  icon: typeof BadgeCheck;
}> = [
  { key: "identity_confirmed", label: "Identity confirmed", icon: BadgeCheck },
  { key: "after_hours_handling", label: "After-hours handling", icon: Clock },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "monthly_volume", label: "Monthly volume", icon: PhoneCall },
  { key: "mobile", label: "Mobile", icon: Smartphone },
  { key: "demo_interest", label: "Demo interest", icon: ThumbsUp },
  { key: "opt_in", label: "Opt-in", icon: BadgeCheck },
];

/** Fallback label for any finding key not in the canonical set. */
function findingLabel(key: string): string {
  const known = FINDING_META.find((m) => m.key === key);
  if (known) return known.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Order findings by the canonical FINDING_META order, with any extra keys
 * appended in capture order. Keeps the row layout stable across sessions.
 */
function orderFindings(findings: CallFindingView[]): CallFindingView[] {
  const rank = new Map(FINDING_META.map((m, i) => [m.key, i]));
  return [...findings].sort((a, b) => {
    const ra = rank.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.capturedAt.getTime() - b.capturedAt.getTime();
  });
}

export function VoiceView({ sessions }: { sessions: CallSessionView[] }) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No voice calls yet"
        description="Calls appear here once NOVA has placed them. Sessions sync with status, transcript, and the structured findings captured on each call."
        icon={<PhoneCall size={48} />}
      />
    );
  }

  return (
    <ol aria-label="Voice call sessions" className="space-y-4">
      {sessions.map((session) => (
        <CallSessionCard key={session.id} session={session} />
      ))}
    </ol>
  );
}

function CallSessionCard({ session }: { session: CallSessionView }) {
  const [expanded, setExpanded] = useState(false);

  const company = session.companyName ?? "Ad-hoc call";
  const contact = session.contactName ?? "Unknown contact";
  const phone = session.contactPhone;
  const orderedFindings = orderFindings(session.findings);
  const hasDetail = Boolean(session.transcript) || orderedFindings.length > 0;

  return (
    <li className="overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-card">
      <div className="p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold text-ink-50">
              <PhoneCall size={15} aria-hidden="true" className="text-gold-400" />
              {company}
              <span className="text-sm font-normal text-ink-400">· {contact}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[11px] text-ink-500">
              {phone && <span className="text-ink-300">{phone}</span>}
              <span className="uppercase tracking-[0.1em]">{session.language}</span>
              <time dateTime={session.placedAt.toISOString()}>
                Placed {formatRelative(session.placedAt, NOW)}
              </time>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[session.status] ?? "default"}>
              {statusLabel(session.status)}
            </Badge>
            {session.demoMode && <Badge variant="awaiting">Demo</Badge>}
            {session.optOut && (
              <Badge variant="rejected">
                <PhoneOff size={11} aria-hidden="true" className="mr-1" />
                Opted out
              </Badge>
            )}
          </div>
        </div>

        {/* Summary line + cost */}
        {(session.summary || session.outcome || session.costUsd !== null) && (
          <div className="mt-3 space-y-2">
            {session.summary && (
              <p className="text-sm leading-relaxed text-ink-200">{session.summary}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-ink-500">
              {session.outcome && (
                <span>
                  Outcome:{" "}
                  <span className="text-ink-300">
                    {session.outcome.replace(/_/g, " ")}
                  </span>
                </span>
              )}
              {session.costUsd !== null && (
                <span>
                  Cost:{" "}
                  <span className="text-ink-300">${session.costUsd.toFixed(3)}</span>
                </span>
              )}
              <span>
                Consent:{" "}
                <span className="text-teal-400">
                  {session.consentBasis ?? (session.consent ? "granted" : "none")}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Findings pill rows */}
        {orderedFindings.length > 0 && (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {orderedFindings.map((finding) => (
              <FindingRow key={finding.id} finding={finding} />
            ))}
          </dl>
        )}

        {/* Expand toggle */}
        {hasDetail && session.transcript && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-4 flex items-center gap-1.5 text-xs font-medium text-gold-400 transition-colors hover:text-gold-300"
          >
            {expanded ? (
              <>
                <ChevronUp size={14} aria-hidden="true" />
                Hide transcript
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden="true" />
                Show transcript
              </>
            )}
          </button>
        )}

        {/* Transcript */}
        {expanded && session.transcript && (
          <div className="mt-3 rounded-lg border border-ink-800 bg-ink-900 p-4">
            <span className="label-mono">Transcript</span>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink-200">
              {session.transcript}
            </pre>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * One captured finding as a labeled pill row: an icon-tagged key on the left, the
 * value on the right, with an optional confidence chip. opt_in / opt_out states
 * are colour-coded so the consent posture reads at a glance.
 */
function FindingRow({ finding }: { finding: CallFindingView }) {
  const meta = FINDING_META.find((m) => m.key === finding.key);
  const Icon = meta?.icon ?? PhoneCall;

  const isPositive =
    finding.key === "opt_in" || finding.key === "identity_confirmed"
      ? isAffirmative(finding.value)
      : null;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-800/60 pb-2.5">
      <dt className="flex items-center gap-1.5">
        <Icon size={13} aria-hidden="true" className="shrink-0 text-ink-500" />
        <span className="label-mono normal-case tracking-normal text-ink-400">
          {findingLabel(finding.key)}
        </span>
      </dt>
      <dd className="flex items-center gap-2 text-right">
        {isPositive === true && (
          <BadgeCheck size={13} aria-hidden="true" className="text-teal-400" />
        )}
        {isPositive === false && (
          <XCircle size={13} aria-hidden="true" className="text-ink-500" />
        )}
        <span className="text-sm font-medium text-ink-100">{finding.value}</span>
        {finding.confidence !== null && (
          <span className="pill pill-muted">{Math.round(finding.confidence * 100)}%</span>
        )}
      </dd>
    </div>
  );
}

/** Loose truthiness for short NOVA finding values (yes / true / confirmed). */
function isAffirmative(value: string): boolean {
  return /^(yes|true|confirmed|granted|opted[\s_-]?in|agreed)$/i.test(value.trim());
}
