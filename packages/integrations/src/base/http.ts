import { AdapterError, kindFromStatus } from "./errors";

/**
 * A tiny HTTP transport seam. Adapters depend on this interface, never on
 * global fetch directly, so integration tests inject a transport that replays
 * recorded fixtures — no live calls in CI (brief §2.4, §7). Production uses
 * `fetchTransport`.
 */

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface HttpTransport {
  request(req: HttpRequest, signal?: AbortSignal): Promise<HttpResponse>;
}

/** Real transport backed by global fetch. */
export const fetchTransport: HttpTransport = {
  async request(req, signal) {
    const res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
      signal,
    });
    return {
      status: res.status,
      ok: res.ok,
      json: () => res.json() as Promise<unknown>,
      text: () => res.text(),
    };
  },
};

/**
 * Perform a JSON request and map non-2xx responses onto the typed adapter
 * error taxonomy. The caller wraps this in withRetry for backoff.
 */
export async function httpJson<T = unknown>(
  transport: HttpTransport,
  provider: string,
  req: HttpRequest,
  signal?: AbortSignal,
): Promise<T> {
  const res = await transport.request(req, signal);
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new AdapterError({
      kind: kindFromStatus(res.status),
      provider,
      status: res.status,
      message: `${provider} HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
    });
  }
  return (await res.json()) as T;
}

/** A transport that replays a fixed queue of responses — for tests only. */
export function stubTransport(
  responses: { status?: number; body: unknown }[],
): HttpTransport & { calls: HttpRequest[] } {
  const queue = [...responses];
  const calls: HttpRequest[] = [];
  return {
    calls,
    async request(req) {
      calls.push(req);
      const next = queue.shift() ?? { status: 200, body: {} };
      const status = next.status ?? 200;
      return {
        status,
        ok: status >= 200 && status < 300,
        json: () => Promise.resolve(next.body),
        text: () => Promise.resolve(JSON.stringify(next.body)),
      };
    },
  };
}
