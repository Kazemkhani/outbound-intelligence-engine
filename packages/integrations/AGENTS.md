# AGENTS.md: `@oie/integrations`

Operating guide for an AI agent working in this package. Read it fully before editing. It overrides generic instincts; it is specific to THIS module.

## Purpose

This is the anti-corruption layer for Outbound Intelligence Engine / OIE. One adapter per bought vendor, each hidden behind one of five stable internal interfaces. Vendor payload shapes NEVER leak past this package: everything downstream (`@oie/core`, `@oie/orchestration`, `apps/web`) sees only the unified DTOs in `src/contracts/model.ts`.

What lives here: vendor auth, request building, Zod validation at the boundary, vendor to unified mapping, bounded retry, idempotency, typed errors, per-call cost accounting, and the LLM client.

What does NOT live here: the enrichment waterfall, provider-fallback / priority ordering, the send gate, the approval queue, and DRY_RUN policy. All of that is in `@oie/orchestration`. An adapter only ever knows its own vendor; it never calls another adapter and never decides whether it should run.

## Key files & where things live

- `src/contracts/interfaces.ts`, the five interfaces + query types (`CompanyQuery`, `ContactQuery`, `SignalQuery`). The contract. Touch with extreme care.
- `src/contracts/model.ts`, unified DTOs: `NormalisedCompany`, `NormalisedContact`, `NormalisedSignal`, `OutboundEmail`, `OutboundMessage`, `SendResult`, `CrmRef`, `EnrichmentResult<T>`, `AdapterContext`, `CostRecord`, `FieldSource`.
- `src/contracts/index.ts`, barrel; also re-exported from the package root and via the `./contracts` subpath export.
- `src/base/http.ts`, the HTTP transport seam. `HttpTransport` interface, `fetchTransport` (prod), `httpJson()` (maps non-2xx to typed errors), `stubTransport()` (tests only). This seam is why CI is offline.
- `src/base/retry.ts`, `withRetry()` (full-jitter exponential backoff + per-attempt timeout), `withTimeout()`, `backoffDelay()`.
- `src/base/errors.ts`, `AdapterError`, `AdapterErrorKind`, `kindFromStatus()`. `retryable` is derived from `kind` and drives the retry policy.
- `src/base/idempotency.ts`, `idempotencyKey(...parts)` (sha256, 32 hex chars).
- `src/<vendor>/index.ts`, the adapter class (and any webhook parser). The only public surface per vendor.
- `src/<vendor>/mapper.ts`, Zod schemas for vendor payloads + the vendor to unified translation functions. INTERNAL: never re-exported from the root.
- `src/<vendor>/<vendor>.test.ts` + `src/<vendor>/fixtures/*.json`, recorded-fixture tests.
- `src/llm/`, `client.ts` (`LlmClient`, `MODEL_IDS`, cost estimation), `personalise.ts` (`personaliseOpener`, `personaliseColdOpener`, `buildPersonalisationPrompt`), `extract.ts` (`extractCompanyFacts`), `evals/`.
- `src/index.ts`, the package's public exports. Adapter classes + webhook parsers + base utilities + LLM helpers only. Mappers stay internal.

## Public contracts / exports

The five interfaces (implement exactly one or more per adapter; names are canonical, do not invent variants):

| Interface            | Method surface                                                                 | Honours `ctx.dryRun`? | Adapters                                   |
| -------------------- | ------------------------------------------------------------------------------ | --------------------- | ------------------------------------------ |
| `EnrichmentProvider` | `isConfigured`, `enrichCompany`, `enrichContact`, optional `discoverCompanies` | no                    | Places, SearchApi, Apollo, Clay, Explorium |
| `SignalProvider`     | `isConfigured`, `fetchSignals`                                                 | no                    | TheirStack, PredictLeads, Exa              |
| `EmailSender`        | `isConfigured`, `send`                                                         | YES                   | Smartlead, Resend                          |
| `MessagingChannel`   | `isConfigured`, `send`, `readonly channel`                                     | YES                   | Unipile (linkedin + whatsapp)              |
| `CrmStore`           | `isConfigured`, `upsertCompany`, `upsertContact`                               | no (find-or-create)   | HubSpot                                    |

Currently exported from `src/index.ts`: `PlacesAdapter`, `SearchApiAdapter`, `ApolloAdapter`, `ClayAdapter` + `parseClayWebhook`, `ExploriumAdapter`, `TheirStackAdapter`, `PredictLeadsAdapter`, `ExaAdapter`, `HubSpotAdapter`, `SmartleadAdapter`, `ResendAdapter`, `UnipileAdapter` + `parseUnipileWebhook`, and the LLM helpers `LlmClient`, `MODEL_IDS`, `personaliseOpener`, `personaliseColdOpener`, `buildPersonalisationPrompt`, `extractCompanyFacts`. Plus everything from `base/*` and `contracts/*`.

The LLM client is deliberately NOT one of the five interfaces and must NEVER sit on the production send path.

## Invariants

YOU MUST:

- Implement one of the five canonical interfaces per adapter. Set `readonly name = "<vendor>"` (lowercase, matches the folder).
- Take an injectable `transport?: HttpTransport` in the constructor, default to `fetchTransport`, and route every HTTP call through `httpJson(this.transport, this.name, req, ctx.signal)`. This is the fixture seam.
- Wrap every external call in `withRetry(...)`. Pass `ctx.signal` for cancellation.
- Validate every inbound payload and webhook with Zod at the boundary, in `mapper.ts`. Untrusted JSON is parsed before any field is read.
- Translate vendor payloads to and from the unified DTOs. Record field provenance in `sources` (`field name -> provider name`). Set `NormalisedSignal.provider` and `detectedAt`.
- Emit `unknown` / `null` for missing data. Never guess, never fabricate, never default-fill a field the vendor did not return.
- For `EmailSender` / `MessagingChannel`, make the FIRST statement of `send()` the `if (ctx.dryRun)` guard that returns `{ outcome: "dry_run", provider, preview }` and touches neither the transport nor `recordCost`. It must be structurally impossible to reach the network when `dryRun` is true.
- Record cost via `ctx.recordCost?.(...)` ONLY on a real call, never on dry-run. (Enrichment adapters may instead carry cost on `EnrichmentResult.cost` so the waterfall records it once; do not double-count.)
- Use `idempotencyKey(...)` or the caller's `ctx.idempotencyKey` so re-runs never duplicate a write or a send.
- Map vendor failures onto `AdapterError` with the right `kind` (use `kindFromStatus` for HTTP); let `retryable` flow from the kind.
- Add at least one fixture test using `stubTransport`. CI runs offline.
- Use `MODEL_IDS` for any LLM call: `hard` = opus (judgement), `personalise` = sonnet (copy/rationale), `parse` = haiku (high-volume). Never hardcode a model string.

NEVER:

- Let a vendor type, vendor field name, or raw vendor JSON cross the adapter boundary into `@oie/core` / `@oie/orchestration` / the DB. Mappers stay internal.
- Put the send path or any durable workflow behind MCP. Production = REST + webhooks. (Clay's MCP is read-only and CANNOT trigger the waterfall, so Clay is REST/webhook only.)
- Implement waterfall, provider-fallback, priority ordering, the send gate, the approval queue, or quiet-hours / rate-limit pacing in an adapter. That is orchestration's job; the adapter trusts its caller.
- Make the LLM compute, return, or imply a score. The deterministic engine in `@oie/core` owns scoring. LLM prompts here explicitly forbid emitting numbers.
- Disable DRY_RUN, auto-approve a send, or read secrets in this package. Adapters receive credentials via constructor options (the orchestration/config layer supplies them from env).
- Re-export a `mapper.ts` symbol from `src/index.ts`. Only adapter classes, webhook parsers, base utilities, and LLM helpers are public.
- Add a dependency. This package depends ONLY on `@oie/core` and `zod`. No vendor SDKs (the LLM client talks raw REST to the Anthropic Messages API on purpose).
- Use `any` without a one-line reason. TS is strict.

## How to make a change safely

Adding a new vendor adapter:

1. Pick the interface it implements. If none of the five fits, stop and raise it; do not invent a sixth.
2. Verify the vendor's CURRENT auth, endpoints, rate limits, and pricing against official docs. Do not trust memory or any table.
3. Create `src/<vendor>/mapper.ts`: Zod schema(s) for the vendor payload(s) + `vendorToNormalised...()` functions that set `sources` provenance.
4. Create `src/<vendor>/index.ts`: the adapter class. Constructor takes credentials + `transport?`. Mirror `PlacesAdapter` (read) for an enrichment provider, `SmartleadAdapter` for an `EmailSender`, `HubSpotAdapter` for `CrmStore`, `UnipileAdapter` for `MessagingChannel`.
5. Define `COST_PER_*_USD` as a module constant with a "indicative, operator-tunable" comment.
6. Record a fixture under `src/<vendor>/fixtures/` (real-shaped, no secrets/PII) and write `src/<vendor>/<vendor>.test.ts` using `stubTransport`. Cover: `isConfigured`, happy-path normalisation, a retryable error (e.g. 429 then success), and (for senders) the dry-run path makes zero transport calls.
7. Export the adapter class (and any webhook parser) from `src/index.ts` under the correct section comment.
8. If the adapter needs a new env key, the key is added in `@oie/config` and `.env.example`, not here.

Changing an interface or a unified DTO (`src/contracts/*`):

- This is a breaking change that ripples into every adapter, `@oie/core`, and `@oie/orchestration`. Read all implementers first. Prefer adding an optional field over changing an existing one. Plan before editing.

What to run (from repo root; this package is `@oie/integrations`):

```bash
pnpm --filter @oie/integrations test        # vitest, fixture-based, offline
pnpm --filter @oie/integrations typecheck    # tsc --noEmit
pnpm --filter @oie/integrations lint
```

Run `pnpm verify` at the root before claiming done. Never run a live provider call to "test"; live verification happens once a key is present, behind Human Gate 1.

## Do / Don't

- Do keep all vendor shapes in `mapper.ts`. Don't read vendor fields in `index.ts` beyond what the mapper returns.
- Do return `{ matched: false, data: null }` on a clean miss. Don't throw for "not found" unless the vendor genuinely errored.
- Do put the dry-run guard as the literal first statement of `send()`. Don't compute a request body, headers, or cost before it.
- Do clamp / validate numeric vendor "scores" into the `0..1` `strength` field. Don't pre-apply decay; orchestration owns decay (the only non-pure input downstream is "now").
- Do drop signals you cannot date (see Exa). Don't invent a `detectedAt`.
- Do forward `ctx.signal` and `idempotencyKey`. Don't swallow errors with an empty `catch`.

## Worked examples

### 1. Enrichment provider (reference: `PlacesAdapter`)

`enrichCompany(query, ctx)` builds a request, calls `withRetry(() => httpJson(this.transport, this.name, req, ctx.signal))`, parses with the mapper's Zod schema, maps to `NormalisedCompany` (mapper sets `sources.<field> = "places"` for every populated field), and returns `EnrichmentResult` carrying `cost` so the waterfall records it once. `enrichContact` is a no-op (`matched:false`) because Places has no people data, the correct way to decline a capability. Test injects `stubTransport([{ body: fixture }])` and a `recordCost` sink, then asserts the normalised fields, provenance, and that a 429-then-200 sequence retries and recovers.

### 2. Email sender with the dry-run guarantee (reference: `SmartleadAdapter`)

```ts
async send(message: OutboundEmail, ctx: AdapterContext): Promise<SendResult> {
  if (ctx.dryRun) {                       // FIRST statement: no transport, no cost
    return { outcome: "dry_run", provider: this.name, preview: `${message.subject} -> ${message.to}` };
  }
  // ... build body (compliance footer + List-Unsubscribe headers), withRetry(httpJson(...)),
  //     Zod-parse the response, recordCost on success, return { outcome: "sent", externalId, provider }.
}
```

The `MessagingChannel` (`UnipileAdapter`) follows the identical pattern and additionally trusts the orchestration send gate: it never re-checks whether LinkedIn/WhatsApp are enabled. Channels are OFF by default and gated upstream.

## Gotchas

- Two cost-recording conventions coexist: senders/signals call `ctx.recordCost?.()` on success; enrichment adapters often put cost on `EnrichmentResult.cost` for the waterfall to record once. Follow the neighbour in the same interface to avoid double-counting.
- Clay is ASYNC/push-based: `enrichCompany`/`enrichContact` only ENQUEUE a row and always return `matched:false, data:null`. The enriched result arrives later via an inbound webhook parsed by `parseClayWebhook`. Do not expect synchronous data.
- Webhook parsers (`parseClayWebhook`, `parseUnipileWebhook`) are part of the public surface and must Zod-validate untrusted inbound JSON before mapping. Clay's parser accepts many alias key spellings; mirror that tolerance for new webhooks.
- The repo has a content-based guard hook that refuses any text containing the literal DRY_RUN disable-flag token, even inside docs/comments. Reword around it; never paste that token.
- Internal packages are consumed as TS source (no JS build emit); `build` is `tsc --noEmit`. Vitest/tsx transpile on the fly.
- `MODEL_IDS` are the June-2026 verified IDs (opus `claude-opus-4-8`, sonnet `claude-sonnet-4-6`, haiku `claude-haiku-4-5`). The LLM client uses the raw Anthropic Messages REST API (`anthropic-version: 2023-06-01`), not `@anthropic-ai/sdk`. Cost is estimated from the `usage` object and returned on every result for the caller to persist.
- `LlmClient.complete()` throws a typed `AdapterError` (kind `invalid_request`) when the Anthropic response fails Zod validation, so there is always a typed failure path. Personalisation helpers prefer `toolInput` (structured tool call) and fall back to parsing text JSON, then Zod-validate; on failure they throw rather than fabricate.

## See also

- `README.md` (human-facing overview), `../../docs/adr/0010-anti-corruption-adapters.md`, root `CLAUDE.md`, and the `adapter-contract`, `channel-limits`, and `email-deliverability` skills.
