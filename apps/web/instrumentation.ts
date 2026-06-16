import * as Sentry from "@sentry/nextjs";

/**
 * Server + edge error instrumentation. Initialises Sentry only when a DSN is
 * present, so the app runs cleanly with no observability configured. No DSN is
 * ever hardcoded; it comes from the environment (set once Sentry is connected).
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}

export const onRequestError = Sentry.captureRequestError;
