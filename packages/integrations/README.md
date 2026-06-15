# @oie/integrations

The anti-corruption layer: one adapter per vendor, each behind a stable internal interface, plus the LLM client. Vendor shapes never leak past this package.

## Purpose

Wrap every bought rail so the rest of OIE talks only to our interfaces and our unified data model. Swapping a provider touches one adapter, never the core (see [ADR-0010](../../docs/adr/0010-anti-corruption-adapters.md)). Depends only on `@oie/core`.

## The five stable interfaces

Defined in `src/contracts/interfaces.ts`. Every adapter implements one, exposes `isConfigured()` (drives live-vs-fixture), and translates vendor payloads to and from the unified DTOs in `src/contracts/model.ts` (`NormalisedCompany`, `NormalisedContact`, `NormalisedSignal`, and the send DTOs). Send-capable interfaces honour `ctx.dryRun`.

| Interface            | Role                                                |
| -------------------- | --------------------------------------------------- |
| `EnrichmentProvider` | discovery + company/contact enrichment              |
| `SignalProvider`     | buying signals / intent                             |
| `EmailSender`        | email sending infrastructure (honours `ctx.dryRun`) |
| `MessagingChannel`   | LinkedIn / WhatsApp rails (honours `ctx.dryRun`)    |
| `CrmStore`           | CRM system of record, find-or-create                |

The waterfall and provider-fallback logic do **not** live here — they live in `@oie/orchestration`. An adapter only ever knows its own vendor.

## The adapters

| Adapter         | Export                                                                                             | Interface            | Notes                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| Google Places   | `PlacesAdapter`                                                                                    | `EnrichmentProvider` | local-business discovery; the reference adapter                  |
| Apollo          | `ApolloAdapter`                                                                                    | `EnrichmentProvider` | people/company DB; REST                                          |
| Clay            | `ClayAdapter`, `parseClayWebhook`                                                                  | `EnrichmentProvider` | async webhook waterfall; inbound parser                          |
| Explorium       | `ExploriumAdapter`                                                                                 | `EnrichmentProvider` | match → enrich; runtime/MCP                                      |
| TheirStack      | `TheirStackAdapter`                                                                                | `SignalProvider`     | hiring + tech_adoption                                           |
| PredictLeads    | `PredictLeadsAdapter`                                                                              | `SignalProvider`     | funding/hiring/job_change/tech/news                              |
| Exa             | `ExaAdapter`                                                                                       | `SignalProvider`     | news/research; drops undated results                             |
| HubSpot         | `HubSpotAdapter`                                                                                   | `CrmStore`           | find-or-create, two-way mapping                                  |
| Smartlead       | `SmartleadAdapter`                                                                                 | `EmailSender`        | dry-run = zero network                                           |
| Unipile         | `UnipileAdapter`, `parseUnipileWebhook`                                                            | `MessagingChannel`   | LinkedIn + WhatsApp; off by default; reply sync                  |
| LLM (Anthropic) | `LlmClient`, `personaliseOpener`, `extractCompanyFacts`, `buildPersonalisationPrompt`, `MODEL_IDS` | —                    | reasoning/personalisation/extraction; **never computes a score** |

The LLM client is deliberately not one of the five interfaces and never sits on the production send path.

## Shared base utilities

`src/base/` provides the injectable HTTP transport (the fixture seam), retry with backoff, idempotency helpers, and the error taxonomy — re-exported from the package root.

## How to test

```bash
pnpm --filter @oie/integrations test       # fixture-based; no live calls in CI
pnpm --filter @oie/integrations typecheck
```

Every adapter is tested against recorded fixtures via the injectable HTTP transport, so CI is deterministic and offline. Live verification happens once a provider's key is present (Human Gate 1).

## How it fits

The orchestration layer composes these adapters: it runs the enrichment waterfall over the `EnrichmentProvider`s, fans signals in over the `SignalProvider`s, syncs the `CrmStore`, and routes every send through the gate before calling an `EmailSender` or `MessagingChannel`.
