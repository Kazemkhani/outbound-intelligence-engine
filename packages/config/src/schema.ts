import { z } from "zod";

/**
 * Coerce common string representations of booleans from the environment.
 * Defaults to the safe value when unset.
 */
const boolFromEnv = (defaultValue: boolean) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return defaultValue;
      if (typeof v === "boolean") return v;
      return ["true", "1", "yes", "on"].includes(v.toLowerCase());
    });

const numFromEnv = (defaultValue: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return defaultValue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a number" });
        return z.NEVER;
      }
      return n;
    });

/** Provider/integration keys — optional at build time (Human Gate 1 supplies them). */
const optionalSecret = z.string().optional().default("");

/**
 * The full OIE environment contract. Core keys are required and fail fast;
 * provider keys are optional so adapters can be built and fixture-tested before
 * their credentials arrive (brief §3.4 Human Gate 1).
 */
export const envSchema = z.object({
  // ── Core (required / safety) ──────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  DRY_RUN: boolFromEnv(true),
  DAILY_LLM_COST_CAP_USD: numFromEnv(25),
  DAILY_PROVIDER_COST_CAP_USD: numFromEnv(50),
  MIN_FREE_DISK_GB: numFromEnv(5),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ── LLM ───────────────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: optionalSecret,

  // ── Enrichment / data ─────────────────────────────────────────────────────
  CLAY_WEBHOOK_URL: optionalSecret,
  CLAY_API_KEY: optionalSecret,
  EXPLORIUM_API_KEY: optionalSecret,
  APOLLO_API_KEY: optionalSecret,
  GOOGLE_MAPS_API_KEY: optionalSecret,
  SEARCHAPI_API_KEY: optionalSecret,
  THEIRSTACK_API_KEY: optionalSecret,
  BUILTWITH_API_KEY: optionalSecret,
  PREDICTLEADS_API_KEY: optionalSecret,
  PREDICTLEADS_API_TOKEN: optionalSecret,
  EXA_API_KEY: optionalSecret,

  // ── Sending infrastructure ────────────────────────────────────────────────
  SMARTLEAD_API_KEY: optionalSecret,
  RESEND_API_KEY: optionalSecret,

  // ── Multichannel messaging ────────────────────────────────────────────────
  UNIPILE_API_KEY: optionalSecret,
  UNIPILE_DSN: optionalSecret,

  // ── CRM ───────────────────────────────────────────────────────────────────
  HUBSPOT_ACCESS_TOKEN: optionalSecret,

  // ── MCP gateway ───────────────────────────────────────────────────────────
  COMPOSIO_API_KEY: optionalSecret,

  // ── Observability ─────────────────────────────────────────────────────────
  SENTRY_DSN: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

/**
 * Provider keys that gate live verification of an adapter. Used by the Human
 * Gate 1 credentials checkpoint to report present vs missing without blocking.
 */
export const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAY_WEBHOOK_URL",
  "CLAY_API_KEY",
  "EXPLORIUM_API_KEY",
  "APOLLO_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "SEARCHAPI_API_KEY",
  "THEIRSTACK_API_KEY",
  "BUILTWITH_API_KEY",
  "PREDICTLEADS_API_KEY",
  "PREDICTLEADS_API_TOKEN",
  "EXA_API_KEY",
  "SMARTLEAD_API_KEY",
  "RESEND_API_KEY",
  "UNIPILE_API_KEY",
  "UNIPILE_DSN",
  "HUBSPOT_ACCESS_TOKEN",
  "COMPOSIO_API_KEY",
  "SENTRY_DSN",
] as const satisfies readonly (keyof Env)[];

export type ProviderKey = (typeof PROVIDER_KEYS)[number];
