"use client";

import { AlertCircle, Inbox, Loader2 } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      aria-label={title}
      className="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <span className="text-ink-600" aria-hidden="true">
        {icon ?? <Inbox size={48} />}
      </span>
      <p className="text-base font-medium text-ink-200">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-500">{description}</p>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex flex-col items-center justify-center gap-3 py-16"
    >
      <Loader2 size={32} className="animate-spin text-gold-500" aria-hidden="true" />
      <p className="text-sm text-ink-400">{label}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertCircle size={40} className="text-red-400" aria-hidden="true" />
      <p className="text-base font-medium text-ink-100">{title}</p>
      <p className="max-w-sm text-sm text-ink-400">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-primary mt-2">
          Try again
        </button>
      )}
    </div>
  );
}
