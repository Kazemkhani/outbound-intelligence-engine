import { signalDedupeKey, signalExpiry } from "@oie/core";
import {
  AdapterError,
  type AdapterContext,
  type NormalisedSignal,
  type SignalProvider,
  type SignalQuery,
} from "@oie/integrations";

/**
 * Collect signals across every configured provider, deduplicate cross-provider
 * and re-pull overlap, and assign each signal its decay window centrally (the
 * adapters never set their own expiry). This is the signal analogue of the
 * enrichment waterfall — we own the fan-in, the dedup and the freshness policy.
 */

export interface CollectTrace {
  provider: string;
  outcome: "ok" | "skipped_unconfigured" | "error";
  count?: number;
  detail?: string;
}

export interface CollectSignalsResult {
  signals: NormalisedSignal[];
  trace: CollectTrace[];
}

export async function collectSignals(
  providers: SignalProvider[],
  query: SignalQuery,
  ctx: AdapterContext,
): Promise<CollectSignalsResult> {
  const trace: CollectTrace[] = [];
  const byKey = new Map<string, NormalisedSignal>();

  for (const provider of providers) {
    if (!provider.isConfigured()) {
      trace.push({ provider: provider.name, outcome: "skipped_unconfigured" });
      continue;
    }
    try {
      const found = await provider.fetchSignals(query, ctx);
      for (const signal of found) {
        const dated = withExpiry(signal);
        const key = signalDedupeKey(dated);
        const existing = byKey.get(key);
        // On collision keep the stronger signal — never double-count intent.
        if (!existing || dated.strength > existing.strength) byKey.set(key, dated);
      }
      trace.push({ provider: provider.name, outcome: "ok", count: found.length });
    } catch (err) {
      const detail = err instanceof AdapterError ? `${err.kind}: ${err.message}` : String(err);
      trace.push({ provider: provider.name, outcome: "error", detail });
      // Continue with the other providers rather than aborting the scan.
    }
  }

  return { signals: [...byKey.values()], trace };
}

/** Assign the central decay window when an adapter did not set one. */
function withExpiry(signal: NormalisedSignal): NormalisedSignal {
  if (signal.expiresAt) return signal;
  return { ...signal, expiresAt: signalExpiry(signal.type, signal.detectedAt) };
}
