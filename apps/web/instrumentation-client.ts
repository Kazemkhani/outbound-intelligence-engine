import * as Sentry from "@sentry/nextjs";

/**
 * Browser error instrumentation. Initialises only when a public DSN is present;
 * otherwise a clean no-op.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
