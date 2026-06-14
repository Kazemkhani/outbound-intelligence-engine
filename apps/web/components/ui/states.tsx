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
      <span className="text-gray-300" aria-hidden="true">
        {icon ?? <Inbox size={48} />}
      </span>
      <p className="text-base font-medium text-gray-500">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-400">{description}</p>}
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
      <Loader2 size={32} className="animate-spin text-brand-500" aria-hidden="true" />
      <p className="text-sm text-gray-400">{label}</p>
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
      <p className="text-base font-medium text-gray-800">{title}</p>
      <p className="max-w-sm text-sm text-gray-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          Try again
        </button>
      )}
    </div>
  );
}
