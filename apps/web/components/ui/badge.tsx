"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition-colors",
  {
    variants: {
      variant: {
        default: "bg-ink-700/50 text-ink-300 ring-ink-600",
        tier_a: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        tier_b: "bg-teal-400/15 text-teal-300 ring-teal-400/30",
        tier_c: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
        tier_d: "bg-ink-700/50 text-ink-400 ring-ink-600",
        hiring: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
        funding: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        tech_adoption: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
        job_change: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
        news: "bg-pink-500/15 text-pink-300 ring-pink-500/30",
        web_change: "bg-teal-400/15 text-teal-300 ring-teal-400/30",
        email: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
        linkedin: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
        whatsapp: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        awaiting: "bg-gold-500/15 text-gold-300 ring-gold-500/30",
        approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        rejected: "bg-red-500/15 text-red-300 ring-red-500/30",
        verified: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
        risky: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
        invalid: "bg-red-500/15 text-red-300 ring-red-500/30",
        unknown: "bg-ink-700/50 text-ink-400 ring-ink-600",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
