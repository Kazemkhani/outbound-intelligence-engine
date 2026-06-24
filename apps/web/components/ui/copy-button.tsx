"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copy-to-clipboard button for generated AI output (battlecards, outreach, answers,
 * scorecards). The operator works in WhatsApp and email, so one-click copy of the
 * raw markdown is a real workflow win. Shows a brief "Copied" confirmation and
 * announces it politely for screen readers. Clipboard can be blocked in insecure
 * contexts; we fail quietly rather than throwing.
 */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions / insecure context). Do nothing.
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied to clipboard" : `${label} to clipboard`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-1.5 text-xs font-medium text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40"
    >
      {copied ? (
        <Check size={13} className="text-teal-400" aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
