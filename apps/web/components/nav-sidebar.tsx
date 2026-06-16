"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, Home, LogOut, Settings, Signal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/auth-actions";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/icp", label: "ICP Editor", icon: Settings },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/approvals", label: "Approvals", icon: Bell },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary navigation"
      className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white"
    >
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-500 focus:px-3 focus:py-1.5 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
          OIE
        </span>
        <span className="text-sm font-semibold text-gray-900">Control Plane</span>
      </div>

      {/* Navigation links */}
      <ul role="list" className="flex flex-col gap-0.5 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer: sign out + safety note */}
      <div className="mt-auto border-t border-gray-200 px-5 py-4">
        <form action={signOutAction}>
          <button
            type="submit"
            className="mb-3 flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium text-gray-600 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </form>
        <p className="text-xs text-gray-400">DRY_RUN active — nothing sends without approval.</p>
      </div>
    </nav>
  );
}
