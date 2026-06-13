import { AdapterError } from "./errors";

export interface RetryOptions {
  retries?: number; // max additional attempts after the first
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  /** Injectable for deterministic tests; defaults to Math.random. */
  random?: () => number;
  /** Injectable sleep; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Decide whether an error should be retried. */
function isRetryable(err: unknown): boolean {
  if (err instanceof AdapterError) return err.retryable;
  // Unknown errors (network blips) are retried conservatively.
  return true;
}

/** Full-jitter exponential backoff (AWS "Exponential Backoff And Jitter"). */
export function backoffDelay(
  attempt: number,
  base: number,
  max: number,
  rand: () => number,
): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.floor(rand() * exp);
}

/**
 * Run an async operation with a per-attempt timeout and bounded, jittered
 * exponential backoff. Throws the last error once retries are exhausted, so the
 * failure path is always typed (brief §7 — no empty catch, every call bounded).
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 5_000,
    timeoutMs = 15_000,
    random = Math.random,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(operation(attempt), timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryable(err)) break;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs, random));
    }
  }
  throw lastError;
}

/** Reject if the promise does not settle within ms. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new AdapterError({
            kind: "timeout",
            provider: "unknown",
            message: `operation timed out after ${ms}ms`,
          }),
        ),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
