"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, BookOpen, Dumbbell, Home, LogOut, PhoneCall, Settings, Signal, Swords, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/icp", label: "ICP Editor", icon: Settings },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/approvals", label: "Approvals", icon: Bell },
  { href: "/voice", label: "Voice", icon: PhoneCall },
  { href: "/dojo", label: "Voice Dojo", icon: Dumbbell },
  { href: "/close", label: "Close", icon: Swords },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function NavSidebar() {
  const pathname = usePathname();

  // The sign-in screen is a standalone full-page experience; no app chrome.
  if (pathname === "/signin") return null;

  return (
    <nav
      aria-label="Primary navigation"
      className="flex w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/80 backdrop-blur"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold-500 focus:px-3 focus:py-1.5 focus:text-sm focus:font-semibold focus:text-ink-950"
      >
        Skip to content
      </a>

      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-ink-800 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 font-display text-[11px] font-bold text-ink-950">
          H
        </span>
        <div className="leading-tight">
          <div className="font-display text-sm font-bold text-ink-50">Huscribe Revenue OS</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
            by HumAI
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <ul role="list" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gold-500/10 text-gold-300 ring-1 ring-inset ring-gold-500/20"
                    : "text-ink-300 hover:bg-ink-800 hover:text-ink-50",
                )}
              >
                <Icon
                  size={17}
                  aria-hidden="true"
                  className={cn(isActive ? "text-gold-400" : "text-ink-400 group-hover:text-ink-200")}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer: status + sign out */}
      <div className="mt-auto space-y-3 border-t border-ink-800 px-4 py-4">
        <div className="flex items-center gap-2 rounded-lg border border-teal-400/20 bg-teal-400/5 px-3 py-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-teal-400">
            Dry-run · gated
          </span>
        </div>
        <p className="px-1 text-xs text-ink-500">Nothing sends without your approval.</p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-400 transition-colors hover:text-ink-50"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
