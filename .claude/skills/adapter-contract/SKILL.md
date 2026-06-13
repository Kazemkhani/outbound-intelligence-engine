---
name: adapter-contract
description: The stable internal interfaces every vendor adapter implements, and the vendor→unified-model mapping rule. Use when building or reviewing anything under packages/integrations.
---

# Adapter contract (anti-corruption layer)

Every bought rail is wrapped in an adapter under `packages/integrations/<vendor>`. The adapter is the only place a vendor's payload shape may appear. Beyond it — in `packages/core`, `packages/orchestration`, and the UI — only the unified data model (§10.2) exists.

## The five stable internal interfaces
Implement exactly one (or more) of these per adapter. Names are canonical; do not invent variants.

- **`EnrichmentProvider`** — takes a partial Company/Contact, returns enriched, normalised fields with provenance. (Clay, Explorium, Apollo, Places.)
- **`SignalProvider`** — returns dated `Signal` records (type, strength, sourceUrl, evidence, detectedAt, expiresAt). (TheirStack, PredictLeads, Exa.)
- **`EmailSender`** — campaigns, mailboxes, send, and event ingestion. (Smartlead.)
- **`MessagingChannel`** — connection/message/send + reply sync for a channel. (Unipile: LinkedIn, WhatsApp.)
- **`CrmStore`** — find-or-create + two-way field mapping for the system of record. (HubSpot.)

## Mapping rule (vendor ⇄ unified model)
- The adapter translates vendor payloads **to and from** the unified model. Validate every inbound payload and webhook with **Zod at the boundary**.
- Typed, normalised fields go on the unified entities; the untouched vendor JSON goes only into the `raw` map (per source). Record which provider supplied which field in `sources`.
- Emit `unknown` rather than guess; never fabricate a field. Vendor shapes never leak past the adapter.

## Each adapter owns
- Its own auth, rate-limit handling, bounded retries (backoff + jitter), idempotency keys, a typed error taxonomy, and per-call **cost accounting** (`ProviderCost`).
- Timeout + typed failure path on every external call; no empty `catch`.

## Each adapter does NOT own
- The **waterfall / provider-fallback / priority-ordering** logic — that lives in our orchestration core, which calls adapters in priority order. We own the cascade, the cost ceiling, and the swap.

## Testing
- Integration tests against **recorded fixtures** — no live network calls in CI.

## MCP vs REST
- Production pipeline and send-path: **REST + webhooks**. Runtime/agent and build-time exploration: **MCP**. Never put the send-path or a durable workflow behind an interactive MCP call.

## Verify at build time
- Confirm each vendor's current API surface, auth, limits, and pricing against its official docs before integrating. Do not trust memory or the brief's tables for live details.
