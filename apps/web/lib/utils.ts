import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SignalType } from "@oie/core";

/** Merge Tailwind classes safely. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a Date as a short UK-style date string. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format a Date as a relative time string (e.g. "3 days ago"). */
export function formatRelative(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(date);
}

/** Round a number to one decimal place. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map a signal type to a human-readable label. */
export function signalTypeLabel(type: SignalType): string {
  const map: Record<SignalType, string> = {
    hiring: "Hiring",
    funding: "Funding",
    tech_adoption: "Tech adoption",
    job_change: "Job change",
    news: "News",
    web_change: "Web change",
    off_plan_launch: "Off-plan launch",
    transaction_spike: "Transaction spike",
  };
  return map[type] ?? type;
}

/** Map a channel to a human-readable label. */
export function channelLabel(channel: "email" | "linkedin" | "whatsapp"): string {
  const map: Record<string, string> = {
    email: "Email",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
  };
  return map[channel] ?? channel;
}
