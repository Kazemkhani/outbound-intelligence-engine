"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-gray-100 text-gray-800",
        tier_a: "bg-emerald-100 text-emerald-800",
        tier_b: "bg-blue-100 text-blue-800",
        tier_c: "bg-amber-100 text-amber-800",
        tier_d: "bg-gray-100 text-gray-500",
        hiring: "bg-violet-100 text-violet-800",
        funding: "bg-green-100 text-green-800",
        tech_adoption: "bg-sky-100 text-sky-800",
        job_change: "bg-orange-100 text-orange-800",
        news: "bg-pink-100 text-pink-800",
        web_change: "bg-teal-100 text-teal-800",
        email: "bg-blue-100 text-blue-700",
        linkedin: "bg-sky-100 text-sky-700",
        whatsapp: "bg-green-100 text-green-700",
        awaiting: "bg-amber-100 text-amber-800",
        approved: "bg-emerald-100 text-emerald-800",
        rejected: "bg-red-100 text-red-800",
        verified: "bg-emerald-100 text-emerald-700",
        risky: "bg-amber-100 text-amber-700",
        invalid: "bg-red-100 text-red-700",
        unknown: "bg-gray-100 text-gray-500",
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
