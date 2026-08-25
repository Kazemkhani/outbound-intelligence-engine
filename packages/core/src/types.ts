import { z } from "zod";

/** Shared domain enumerations used across scoring, adapters and the data model. */

export const seniorityValues = ["c_level", "vp", "director", "manager", "ic"] as const;
export const seniority = z.enum(seniorityValues);
export type Seniority = z.infer<typeof seniority>;

export const signalTypeValues = [
  "hiring",
  "funding",
  "tech_adoption",
  "job_change",
  "news",
  "web_change",
  // UAE-native intent signals (Dubai Land Department / Dubai Pulse). The enum seam
  // ships now; the producing DLD adapter + live ingestion are Next-gated (see
  // provider contracts), so nothing emits these at runtime yet.
  "off_plan_launch",
  "transaction_spike",
] as const;
export const signalType = z.enum(signalTypeValues);
export type SignalType = z.infer<typeof signalType>;

export const emailStatusValues = ["verified", "risky", "invalid", "unknown"] as const;
export const emailStatus = z.enum(emailStatusValues);
export type EmailStatus = z.infer<typeof emailStatus>;

export const channelValues = ["email", "linkedin", "whatsapp"] as const;
export const channel = z.enum(channelValues);
export type Channel = z.infer<typeof channel>;

export const tierValues = ["A", "B", "C", "D"] as const;
export const tier = z.enum(tierValues);
/** Lead tier. A/B/C are configured thresholds; D is the implicit "below C" bucket. */
export type Tier = z.infer<typeof tier>;

/** A weight in the closed interval [0, 1]. */
export const weight = z.number().min(0).max(1);
export type Weight = z.infer<typeof weight>;
