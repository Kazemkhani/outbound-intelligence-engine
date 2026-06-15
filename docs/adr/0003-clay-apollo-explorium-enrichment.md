# ADR-0003 — Clay + Apollo + Explorium for enrichment

**Status:** Accepted

## Context

Enrichment is a commodity that specialist vendors do far better than any small team could. We need a production-grade multi-provider waterfall, a deep B2B people and company database, and an agent-callable runtime enrichment path. No single vendor covers all three well, and we must avoid lock-in to any of them. Google Places covers local-business discovery separately (it is part of the same `EnrichmentProvider` interface but a distinct source).

## Decision

Integrate three enrichment vendors, each behind the `EnrichmentProvider` interface:

- **Clay** — the production waterfall via webhooks and HTTP (in and out). The dominant, most flexible waterfall orchestrator with native CRM sync and AI research. Clay's MCP is read-only, so it is used for queries, not to trigger the waterfall.
- **Apollo** — database depth for people and company data, search and enrich over REST, with a free MCP for agent queries.
- **Explorium** — MCP-native runtime/agent enrichment with synchronous responses and a single credit pool, covering the case where Clay's MCP is read-only.

The **waterfall and provider-fallback logic live in our orchestration core** (`enrichCompanyWaterfall`), calling these adapters in priority order: fill-missing with per-field attribution, early-stop on completeness, fall-through on error, skip unconfigured providers.

## Consequences

- **Easier:** best-in-class enrichment without building a cascade; provider attribution recorded per field; cost bounded by early-stop.
- **Easier:** any one provider can be swapped by editing only its adapter; the cascade is ours.
- **Harder:** three vendor APIs to keep current; each must be verified against live docs at integration time.
- **Risk:** per-credit cost can grow with volume; mitigated by the early-stop cost ceiling, input-hash caching, and the daily provider cost cap.
