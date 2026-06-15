# ADR-0010 — Anti-corruption adapters

**Status:** Accepted

## Context

OIE integrates many third-party rails (Clay, Apollo, Explorium, Places, TheirStack, PredictLeads, Exa, Smartlead, Unipile, HubSpot, plus the LLM). If vendor payload shapes leaked into the core, the data model and business logic would couple to every vendor's quirks, swapping a provider would become a cross-cutting rewrite, and a vendor could effectively hold the system hostage. We need the freedom to swap any vendor without touching the core, and we need the orchestration logic — the cascade — to stay ours.

## Decision

Wrap every bought rail in an **anti-corruption adapter** under `packages/integrations/<vendor>`. Each adapter:

- implements one of five **stable internal interfaces** — `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore` (in `contracts/interfaces.ts`);
- translates vendor payloads to and from the **unified data model** (`NormalisedCompany`, `NormalisedContact`, `NormalisedSignal` and the send DTOs) so vendor shapes never leak past the adapter folder;
- owns its auth, rate-limit handling, retries, idempotency keys, error taxonomy and **cost accounting**;
- is covered by integration tests against **recorded fixtures** — no live calls in CI, via an injectable HTTP transport seam.

The **waterfall and provider-fallback logic live in our orchestration core**, calling adapters in priority order. We own the cascade, the cost ceiling and the swap. An adapter only ever knows its own vendor.

## Consequences

- **Easier:** swapping a provider touches one adapter, never the core; provider attribution is recorded per field; CI is fast and deterministic against fixtures.
- **Easier:** every external and LLM input is validated with Zod at the adapter boundary.
- **Harder:** each new vendor needs a full adapter (auth, mapping, retries, fixtures) rather than a quick call.
- **Risk:** a mapper that subtly mis-translates a vendor shape; mitigated by fixture-based integration tests and the recorded-provenance `sources` field.
