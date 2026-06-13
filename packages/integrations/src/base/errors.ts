/**
 * Adapter error taxonomy (brief §2.4, §7). Every adapter maps vendor failures
 * onto these typed errors so the orchestration core can decide retry vs fallback
 * vs abort without knowing vendor specifics. `retryable` drives the retry policy.
 */

export type AdapterErrorKind =
  | "auth"
  | "rate_limit"
  | "not_found"
  | "invalid_request"
  | "provider_unavailable"
  | "timeout"
  | "unknown";

export class AdapterError extends Error {
  readonly kind: AdapterErrorKind;
  readonly provider: string;
  readonly retryable: boolean;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(opts: {
    kind: AdapterErrorKind;
    provider: string;
    message: string;
    retryable?: boolean;
    status?: number;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "AdapterError";
    this.kind = opts.kind;
    this.provider = opts.provider;
    this.retryable = opts.retryable ?? defaultRetryable(opts.kind);
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

function defaultRetryable(kind: AdapterErrorKind): boolean {
  switch (kind) {
    case "rate_limit":
    case "provider_unavailable":
    case "timeout":
      return true;
    case "auth":
    case "not_found":
    case "invalid_request":
    case "unknown":
      return false;
  }
}

/** Map an HTTP status to an adapter error kind. */
export function kindFromStatus(status: number): AdapterErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}
