import type { AdapterContext, CostRecord, NormalisedSignal } from "../contracts/model";
import type { SignalProvider, SignalQuery } from "../contracts/interfaces";
import { fetchTransport, httpJson, type HttpTransport } from "../base/http";
import { withRetry } from "../base/retry";
import { dubaiPulseRecordToSignals, dubaiPulseResponse } from "./mapper";

/**
 * DLD / Dubai Pulse adapter: a UAE-native SignalProvider over the Dubai
 * government's open real-estate data. Emits transaction_spike + off_plan_launch
 * signals that ground the deterministic intent score on real transaction volume,
 * the differentiator no global vendor packages (see TARGET-ARCHITECTURE.md).
 *
 * Status: this adapter is built and unit-tested, but it is NOT yet wired into
 * live ingestion. That is gated on the SignalType DB migration plus a spike test
 * (BUILD-PLAN.md), so nothing persists these signals at runtime yet.
 *
 * Anti-corruption: all Dubai-Pulse shapes are confined to ./mapper; only
 * NormalisedSignal crosses the boundary. The endpoint + key come from config,
 * never hardcoded.
 */
export interface DldAdapterOptions {
  /** Dubai Pulse dataset endpoint returning the transaction/launch JSON. */
  endpoint?: string;
  /** API key, when the chosen dataset requires one. Open datasets may not. */
  apiKey?: string;
  transport?: HttpTransport;
}

export class DLDAdapter implements SignalProvider {
  readonly name = "dld";
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly transport: HttpTransport;

  constructor(options: DldAdapterOptions = {}) {
    this.endpoint = options.endpoint ?? "";
    this.apiKey = options.apiKey ?? "";
    this.transport = options.transport ?? fetchTransport;
  }

  /** Configured only when an endpoint is set; the key is optional per dataset. */
  isConfigured(): boolean {
    return this.endpoint.trim() !== "";
  }

  private cost(): CostRecord {
    // Dubai Pulse open data is free; we still record a unit for accounting symmetry.
    return { provider: this.name, task: "fetch", units: 1, costUsd: 0, at: new Date() };
  }

  async fetchSignals(query: SignalQuery, ctx: AdapterContext): Promise<NormalisedSignal[]> {
    if (!this.isConfigured()) return [];

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey.trim() !== "") headers["x-api-key"] = this.apiKey;

    const raw = await withRetry(() =>
      httpJson(this.transport, this.name, { url: this.endpoint, method: "GET", headers }, ctx.signal),
    );

    const parsed = dubaiPulseResponse.parse(raw);
    ctx.recordCost?.(this.cost());

    const signals: NormalisedSignal[] = [];
    for (const record of parsed.records) {
      for (const signal of dubaiPulseRecordToSignals(record)) {
        if (query.since && signal.detectedAt < query.since) continue;
        signals.push(signal);
      }
    }
    return signals;
  }
}
