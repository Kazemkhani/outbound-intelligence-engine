"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Loader2, Star, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { channelLabel, formatRelative } from "@/lib/utils";
import type { ApprovalItem } from "@/lib/fixtures";
import { approveWithFeedback, rejectMessage } from "@/app/approvals/actions";

const NOW = new Date("2026-06-14T00:00:00Z");

const CHANNEL_VARIANT = {
  email: "email",
  linkedin: "linkedin",
  whatsapp: "whatsapp",
} as const;

interface ItemState {
  status: "awaiting_approval" | "approved" | "rejected";
  feedback: string | null;
}

export function ApprovalQueue({ items }: { items: ApprovalItem[] }) {
  const [states, setStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(items.map((item) => [item.id, { status: item.status, feedback: null }])),
  );
  const [isPending, startTransition] = useTransition();

  const handleApprove = (
    id: string,
    data: {
      editedBody: string;
      editedSubject: string;
      operatorStars: number;
      operatorReason: string;
      aiStars: number | null;
      aiReasoning: string | null;
      contactName: string;
      companyName: string;
      channel: string;
    },
  ) => {
    startTransition(async () => {
      const result = await approveWithFeedback({ messageId: id, ...data });
      setStates((prev) => ({
        ...prev,
        [id]: {
          status: result.ok ? "approved" : "awaiting_approval",
          feedback: result.ok ? result.message : result.error,
        },
      }));
    });
  };

  const handleReject = (id: string) => {
    startTransition(async () => {
      const result = await rejectMessage(id);
      setStates((prev) => ({
        ...prev,
        [id]: {
          status: result.ok ? "rejected" : "awaiting_approval",
          feedback: result.ok ? result.message : result.error,
        },
      }));
    });
  };

  const pending = items.filter((i) => states[i.id]?.status === "awaiting_approval");
  const resolved = items.filter((i) => states[i.id]?.status !== "awaiting_approval");

  return (
    <div className="space-y-8">
      {/* Gate notice */}
      <aside role="note" className="rounded-xl border border-gold-500/25 bg-gold-500/[0.06] px-5 py-4">
        <p className="text-sm text-ink-200">
          <strong className="font-semibold text-gold-300">Human approval required.</strong> Edit the
          message, review the AI quality rating, leave your feedback, then approve or reject. Nothing
          sends while the dry-run gate is active. Your ratings train the system to write better copy.
        </p>
      </aside>

      {/* Pending items */}
      <section aria-label="Messages awaiting approval">
        <h2 className="mb-4 font-display text-base font-bold text-ink-50">
          Awaiting approval <span className="text-ink-500">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            title="No messages awaiting approval"
            description="All queued messages have been reviewed."
          />
        ) : (
          <ul className="space-y-4">
            {pending.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                state={states[item.id] ?? { status: "awaiting_approval", feedback: null }}
                isPending={isPending}
                onApprove={(data) => handleApprove(item.id, data)}
                onReject={() => handleReject(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Resolved items */}
      {resolved.length > 0 && (
        <section aria-label="Resolved messages">
          <h2 className="mb-4 font-display text-base font-bold text-ink-50">
            Resolved <span className="text-ink-500">({resolved.length})</span>
          </h2>
          <ul className="space-y-3">
            {resolved.map((item) => {
              const itemState = states[item.id] ?? { status: item.status, feedback: null };
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-ink-800 bg-ink-900/60 px-5 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {itemState.status === "approved" ? (
                      <CheckCircle size={16} className="text-emerald-400" aria-hidden="true" />
                    ) : (
                      <XCircle size={16} className="text-red-400" aria-hidden="true" />
                    )}
                    <span className="font-medium text-ink-100">
                      {item.contactName} · {item.companyName}
                    </span>
                    <Badge variant={itemState.status === "approved" ? "approved" : "rejected"}>
                      {itemState.status}
                    </Badge>
                  </div>
                  {itemState.feedback && (
                    <span className="text-xs text-ink-500">{itemState.feedback}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

interface ApproveData {
  editedBody: string;
  editedSubject: string;
  operatorStars: number;
  operatorReason: string;
  aiStars: number | null;
  aiReasoning: string | null;
  contactName: string;
  companyName: string;
  channel: string;
}

function ApprovalCard({
  item,
  state,
  isPending,
  onApprove,
  onReject,
}: {
  item: ApprovalItem;
  state: ItemState;
  isPending: boolean;
  onApprove: (data: ApproveData) => void;
  onReject: () => void;
}) {
  const [editedSubject, setEditedSubject] = useState(item.subject ?? "");
  const [editedBody, setEditedBody] = useState(item.body);
  const [aiRating, setAiRating] = useState<{ stars: number; reasoning: string } | null>(null);
  const [isRating, setIsRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [operatorStars, setOperatorStars] = useState(0);
  const [operatorReason, setOperatorReason] = useState("");

  const fetchAiRating = async () => {
    setIsRating(true);
    setRatingError(null);
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editedBody,
          subject: editedSubject || undefined,
          channel: item.channel,
          contactName: item.contactName,
          companyName: item.companyName,
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        setRatingError(msg || "Could not get AI rating. Check ANTHROPIC_API_KEY.");
        return;
      }
      const data = (await res.json()) as { stars: number; reasoning: string };
      setAiRating(data);
    } catch {
      setRatingError("Network error fetching AI rating.");
    } finally {
      setIsRating(false);
    }
  };

  const handleApprove = () => {
    onApprove({
      editedBody,
      editedSubject,
      operatorStars,
      operatorReason,
      aiStars: aiRating?.stars ?? null,
      aiReasoning: aiRating?.reasoning ?? null,
      contactName: item.contactName,
      companyName: item.companyName,
      channel: item.channel,
    });
  };

  return (
    <li className="overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-card">
      <div className="p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-ink-50">
              {item.contactName}
              <span className="ml-1.5 text-sm font-normal text-ink-400">at {item.companyName}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-500">
              <Badge variant={CHANNEL_VARIANT[item.channel]}>{channelLabel(item.channel)}</Badge>
              <span>Seq: {item.sequenceName}</span>
              <span>Step {item.step}</span>
              <time dateTime={item.queuedAt.toISOString()}>
                Queued {formatRelative(item.queuedAt, NOW)}
              </time>
            </div>
          </div>
          <Badge variant="awaiting">Awaiting approval</Badge>
        </div>

        {/* Editable subject */}
        {item.channel === "email" && (
          <div className="mt-4">
            <label htmlFor={`subj-${item.id}`} className="label-mono mb-1 block">
              Subject
            </label>
            <input
              id={`subj-${item.id}`}
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              className="input-field w-full"
            />
          </div>
        )}

        {/* Editable body */}
        <div className="mt-3">
          <label htmlFor={`body-${item.id}`} className="label-mono mb-1 block">
            Message body
          </label>
          <textarea
            id={`body-${item.id}`}
            value={editedBody}
            onChange={(e) => setEditedBody(e.target.value)}
            rows={8}
            className="input-field w-full resize-y font-mono text-sm"
          />
        </div>

        {/* AI rating panel */}
        <div className="mt-4 rounded-lg border border-ink-800 bg-ink-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="label-mono">AI quality rating</p>
            <button
              type="button"
              onClick={fetchAiRating}
              disabled={isRating || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-gold-500/40 hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRating ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Rating…
                </>
              ) : (
                <>{aiRating ? "Re-rate" : "Rate with AI"}</>
              )}
            </button>
          </div>

          {ratingError && (
            <p className="mt-2 text-xs text-red-300">{ratingError}</p>
          )}

          {aiRating && (
            <div className="mt-3">
              <div className="flex items-center gap-1" aria-label={`AI rating: ${aiRating.stars} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={18}
                    aria-hidden="true"
                    className={
                      i < aiRating.stars
                        ? "fill-gold-400 text-gold-400"
                        : "text-ink-700"
                    }
                  />
                ))}
                <span className="ml-2 text-sm font-semibold text-gold-400">{aiRating.stars}/5</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{aiRating.reasoning}</p>
            </div>
          )}

          {!aiRating && !isRating && !ratingError && (
            <p className="mt-2 text-xs text-ink-600">
              Click &quot;Rate with AI&quot; to get an automatic quality score for this message.
            </p>
          )}
        </div>

        {/* Operator rating */}
        <div className="mt-4 space-y-3 rounded-lg border border-ink-800 bg-ink-900/60 p-4">
          <p className="label-mono">Your rating</p>

          <div className="flex items-center gap-1" role="group" aria-label="Your star rating">
            {Array.from({ length: 5 }).map((_, i) => {
              const starVal = i + 1;
              return (
                <button
                  key={starVal}
                  type="button"
                  onClick={() => setOperatorStars(starVal === operatorStars ? 0 : starVal)}
                  aria-label={`${starVal} star${starVal !== 1 ? "s" : ""}`}
                  aria-pressed={operatorStars >= starVal}
                  className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
                >
                  <Star
                    size={22}
                    className={
                      operatorStars >= starVal
                        ? "fill-gold-400 text-gold-400"
                        : "text-ink-700 hover:text-ink-500"
                    }
                    aria-hidden="true"
                  />
                </button>
              );
            })}
            {operatorStars > 0 && (
              <span className="ml-2 text-sm font-semibold text-gold-400">{operatorStars}/5</span>
            )}
          </div>

          <div>
            <label htmlFor={`reason-${item.id}`} className="mb-1 block text-xs text-ink-500">
              Reason for rating (optional — used to improve future copy)
            </label>
            <textarea
              id={`reason-${item.id}`}
              value={operatorReason}
              onChange={(e) => setOperatorReason(e.target.value)}
              rows={2}
              placeholder="e.g. Good opener but value prop is vague. Needs a sharper hook."
              className="input-field w-full resize-y text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            aria-label={`Approve message to ${item.contactName}`}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle size={15} aria-hidden="true" />
            )}
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={isPending}
            aria-label={`Reject message to ${item.contactName}`}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-transparent px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <XCircle size={15} aria-hidden="true" />
            Reject
          </button>
          <p className="text-xs text-ink-500">
            Records intent only — nothing sends while the dry-run gate is active.
          </p>
        </div>

        {/* Feedback */}
        {state.feedback && (
          <p role="status" className="mt-3 text-xs text-ink-400">
            {state.feedback}
          </p>
        )}
      </div>
    </li>
  );
}
