"use client";

import { useState, useTransition } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { channelLabel, formatRelative } from "@/lib/utils";
import type { ApprovalItem } from "@/lib/fixtures";
import { approveMessage, rejectMessage } from "@/app/approvals/actions";

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

  const handleApprove = (id: string) => {
    startTransition(async () => {
      const result = await approveMessage(id);
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
      <aside role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-800">
          <strong>Human approval required.</strong> Nothing sends until you click Approve on each
          message. Approval records your intent; the dry-run gate remains active until explicitly
          disabled by the operator. Rejected messages are suppressed permanently.
        </p>
      </aside>

      {/* Pending items */}
      <section aria-label="Messages awaiting approval">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Awaiting approval ({pending.length})
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
                onApprove={() => handleApprove(item.id)}
                onReject={() => handleReject(item.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Resolved items */}
      {resolved.length > 0 && (
        <section aria-label="Resolved messages">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Resolved ({resolved.length})
          </h2>
          <ul className="space-y-3">
            {resolved.map((item) => {
              const itemState = states[item.id] ?? { status: item.status, feedback: null };
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-5 py-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {itemState.status === "approved" ? (
                      <CheckCircle size={16} className="text-emerald-500" aria-hidden="true" />
                    ) : (
                      <XCircle size={16} className="text-red-400" aria-hidden="true" />
                    )}
                    <span className="font-medium text-gray-800">
                      {item.contactName} — {item.companyName}
                    </span>
                    <Badge variant={itemState.status === "approved" ? "approved" : "rejected"}>
                      {itemState.status}
                    </Badge>
                  </div>
                  {itemState.feedback && (
                    <span className="text-xs text-gray-400">{itemState.feedback}</span>
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
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewLines = item.body.split("\n").slice(0, 3).join("\n");
  const hasMore = item.body.split("\n").length > 3;

  return (
    <li className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">
              {item.contactName}
              <span className="ml-1.5 text-sm font-normal text-gray-500">
                at {item.companyName}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <Badge variant={CHANNEL_VARIANT[item.channel]}>{channelLabel(item.channel)}</Badge>
              <span>Sequence: {item.sequenceName}</span>
              <span>Step {item.step}</span>
              <time dateTime={item.queuedAt.toISOString()}>
                Queued {formatRelative(item.queuedAt, NOW)}
              </time>
            </div>
          </div>
          <Badge variant="awaiting">Awaiting approval</Badge>
        </div>

        {/* Subject */}
        {item.channel === "email" && (
          <p className="mt-3 text-sm font-medium text-gray-700">
            Subject: <span className="font-normal text-gray-600">{item.subject}</span>
          </p>
        )}

        {/* Body preview */}
        <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
            {expanded ? item.body : previewLines}
          </pre>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-2 text-xs text-brand-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {expanded ? "Show less" : "Show full message"}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onApprove}
            disabled={isPending}
            aria-label={`Approve message to ${item.contactName}`}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle size={15} aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={isPending}
            aria-label={`Reject message to ${item.contactName}`}
            className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <XCircle size={15} aria-hidden="true" />
            Reject
          </button>
          <p className="text-xs text-gray-400">
            Approval records your intent only. Nothing sends while the dry-run gate is active.
          </p>
        </div>

        {/* Feedback */}
        {state.feedback && (
          <p role="status" className="mt-3 text-xs text-gray-500">
            {state.feedback}
          </p>
        )}
      </div>
    </li>
  );
}
