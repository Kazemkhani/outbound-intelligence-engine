# packages/integrations Plan

> The anti-corruption layer: one adapter per bought vendor behind stable internal contracts, plus the single Anthropic chokepoint (`LlmClient`). Vendor shapes never leak into core. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

This package is the live anti-corruption boundary (`docs/adr/0010-anti-corruption-adapters.md`, AGENTS.md). What exists today, verified against source:

- Five canonical contracts in `src/contracts/interfaces.ts`: `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore`. Plus query types `CompanyQuery`, `ContactQuery`, `SignalQuery`.
- Unified DTOs in `src/contracts/model.ts`: `NormalisedCompany`, `NormalisedContact`, `NormalisedSignal`, `OutboundEmail`, `OutboundMessage`, `SendResult`, `CrmRef`, `EnrichmentResult<T>`, `AdapterContext`, `CostRecord`, `FieldSource`. Provenance lives in `sources` (field name -> provider name).
- Base seams: `src/base/http.ts` (`HttpTransport`, `fetchTransport`, `httpJson`, `stubTransport`), `src/base/retry.ts` (`withRetry`, `withTimeout`, `backoffDelay`), `src/base/errors.ts` (`AdapterError`, `AdapterErrorKind`, `kindFromStatus`), `src/base/idempotency.ts` (`idempotencyKey`).
- Live adapters: `PlacesAdapter`, `SearchApiAdapter`, `ApolloAdapter`, `ClayAdapter` (+ `parseClayWebhook`), `ExploriumAdapter` (Enrichment); `TheirStackAdapter`, `PredictLeadsAdapter`, `ExaAdapter` (Signal); `HubSpotAdapter` (CRM); `SmartleadAdapter`, `ResendAdapter` (Email); `UnipileAdapter` (+ `parseUnipileWebhook`, Messaging).
- LLM chokepoint: `src/llm/client.ts` exports `LlmClient` (raw-REST Anthropic Messages API, NO `@anthropic-ai/sdk`), `MODEL_IDS` (`hard`=claude-opus-4-8, `personalise`=claude-sonnet-4-6, `parse`=claude-haiku-4-5), `CompleteOptions`/`CompleteResult`, and a private `estimateCost()` returning a `CostRecord`. `complete()` is the single call site that hits Anthropic. It is consumed by `apps/web/lib/llm.ts` (`ask()`), which is the control-plane seam. Helpers: `personalise.ts`, `extract.ts`, and the bespoke eval harness `evals/runner.ts` + `evals/cases.ts`.
- NOVA boundary: `src/nova/findings.ts` (68-line pure parser, `extractFindings`, `CANONICAL_FINDING_KEYS`, `affirmative`, `NovaFinding`). NOVA is EXTERNAL (`api.novalabs.ae`, via `scripts/nova-call.ts`); there is no Python source in this repo.
- Clay is async/push: `enrichCompany`/`enrichContact` only ENQUEUE a row (always `matched:false`); the result returns via `parseClayWebhook`. This IS the pay-per-match webhook pattern the roadmap wants for Clay.
- Package deps are ONLY `@oie/core` and `zod` (AGENTS.md: no vendor SDKs). `exports`: `.` and `./contracts`.
- Core signal enum `signalTypeValues` in `packages/core/src/types.ts` = `hiring, funding, tech_adoption, job_change, news, web_change`. TTLs in `packages/core/src/signal-windows.ts` (`DEFAULT_SIGNAL_TTL_DAYS`). Neither yet has `transaction_spike` or `off_plan_launch`.
- Grep confirms NO non-Anthropic LLM provider anywhere under `src/` (no openai/langchain/genai/cohere/etc). The single-chokepoint invariant is real and intact.

There is NO compliance contract yet (`DncrProvider`, `ConsentStore`, `AuditSink`), NO DLD/Dubai Pulse adapter, NO observability span at `LlmClient.complete()`, and the residual-PII assertion is absent from `nova/findings.ts`.

## Target architecture for this module (from the research)

This folder is "ONE wire format / ONE Anthropic chokepoint" plus the anti-corruption seam (TARGET-ARCHITECTURE.md Parts 5, 8, 11; "four seams"). Concretely for this package:

1. The DLD / Dubai Pulse rail (Part 5, top bet #2): the ONE net-new data rail adopted now, and only its genuinely-free half. A `DubaiPulseAdapter` implementing `SignalProvider` (and `EnrichmentProvider` for transaction-volume firmographics) emitting a `transaction_spike` signal. `off_plan_launch` is gated on a free proxy or Oqood onboarding, NOT shipped by default. Everything stays behind the existing contracts; never touches core or the send path. New `SignalType` enum values land in `packages/core` BEFORE mapping. A 1-day availability/licensing spike gates all DLD code.
2. Fail-closed compliance contracts (Part 11, top bet #5, NOVA-go-live track): `DncrProvider`/`SuppressionProvider` (tri-state, fail-closed on unknown), `ConsentStore`, `AuditSink` as NEW small contracts following the five-interface discipline. Shipped as fail-closed STUBS only, because none can be exercised before a real TDRA-approved call. Decisions stay in CODE (the LLM never decides callable/sendable).
3. The in-repo PII control (Part 11, NOW): a residual-PII Zod assertion at the `nova/findings.ts` boundary that keeps the +971 mobile finding (the moat) but rejects other residual PII.
4. The model/observability wrapper at `LlmClient.complete()` (Part 8, top bet #4): ONE OpenTelemetry GenAI span emitted at the single call site, to Sentry only for now, with cost-per-lead metadata. The raw-REST adapter stays (manual span, NOT the SDK). OTel GenAI semconv is the swappable contract so Langfuse later is a span-processor registration, not a rewrite.
5. Clay as pay-per-match (Part 5, Next, webhook-only): the existing `ClayAdapter` already enqueues and resolves via webhook; the Next work is to harden it as the assembly layer once post-paid volume justifies it (DATA-ACQUISITION.md Section 6 "Next"). REST/webhook only; MCP is read-only and CANNOT trigger the waterfall.
6. The enrichment-waterfall PROVIDERS stay here as adapters; the waterfall LOGIC stays in `@oie/orchestration` (AGENTS.md). New fallback rails (Firecrawl, Explorium-as-SignalProvider, Linkup, PDL, Ocean, Serper, Stagehand) are Later, each only when a named live-run coverage gap appears, within the 3-vendors-per-quarter cap.

## Invariants this module must preserve

- Deterministic scoring stays in code. The LLM never emits the number. No adapter, no DLD signal, no observability span, and no compliance contract feeds a model output, an eval score, or a span attribute back into `@oie/core` scoring. DLD `strength` is a clamped raw provider value in `[0,1]`, pre-decay; orchestration owns decay.
- DRY_RUN default true + a mandatory human send-gate. Adapters here trust the upstream gate; they never disable DRY_RUN. Send-capable adapters keep the `if (ctx.dryRun)` guard as the literal first statement. Compliance contracts FAIL CLOSED on unknown so DEMO_MODE stays provably safe.
- Vendor shapes never leak into core. Every new rail (DLD) and every new contract (DNCR/Consent/Audit) follows the same anti-corruption discipline: Zod-validate at the boundary in a `mapper.ts`, translate to unified DTOs, mappers stay internal, no vendor field crosses into `@oie/core`/`@oie/orchestration`/DB.
- Secrets only via env / Vercel. Adapters receive credentials via constructor options; keys are added in `@oie/config` and `.env.example`, never read from `process.env` inside this package. No secret is committed.
- UAE PDPL + TDRA gate any live voice. The compliance contracts are the code expression of that gate. They ship as fail-closed stubs and only go live on the TDRA-approved NOVA-go-live track. DLD commercial-licensing is confirmed in the spike before any adapter code.
- One Anthropic chokepoint. The OTel span is emitted INSIDE `LlmClient.complete()`; no traced/costed Claude call is routed around it. Package deps stay `@oie/core` + `zod` + (new, justified) the minimal OTel API package only.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

The TARGET-ARCHITECTURE "Now" phase (weeks 0-4) is three repo-wide items, only two of which touch THIS package: the OTel span at `LlmClient.complete()` (Part 8 item 3) and the in-repo compliance trio's PII half. The DLD spike is a Now prerequisite (no code). Tasks N1-N3 are the genuine Now work for this folder; N4 is the gating spike for the Next DLD adapter.

### N1. OTel GenAI span at `LlmClient.complete()` (to Sentry only)

Spec: wrap the single Anthropic call site in one OpenTelemetry GenAI span. Add the minimal tracing API dep and emit the span without swapping the raw-REST client.

- Add dep (the ONLY net-new dep this package may take now): `@opentelemetry/api` (API only, no SDK; the SDK/exporter is registered in `apps/web/instrumentation.ts` and the orchestration worker bootstrap, NOT here). Update `packages/integrations/package.json` `dependencies`.
- In `src/llm/client.ts`, import `trace, SpanStatusCode, type Span` from `@opentelemetry/api` and wrap the body of `complete()`:

```ts
import { trace, SpanStatusCode } from "@opentelemetry/api";
const tracer = trace.getTracer("@oie/integrations.llm");

async complete(options: CompleteOptions): Promise<CompleteResult> {
  return tracer.startActiveSpan("chat", async (span) => {
    span.setAttributes({
      "gen_ai.system": "anthropic",
      "gen_ai.operation.name": "chat",
      "gen_ai.request.model": options.model,
      "gen_ai.request.max_tokens": options.maxTokens,
    });
    try {
      // ... existing request + Zod parse + extract ...
      span.setAttributes({
        "gen_ai.response.model": response.model,
        "gen_ai.usage.input_tokens": response.usage.input_tokens,
        "gen_ai.usage.output_tokens": response.usage.output_tokens,
        "gen_ai.response.finish_reasons": response.stop_reason ? [response.stop_reason] : [],
        "gen_ai.usage.cost_usd": cost.costUsd, // non-standard, our addition
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return { text, toolInput, raw: response, cost };
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

- Do NOT put prompt/completion text on the span by default (PDPL: UAE lead data + cross-border). Gate any `gen_ai.prompt`/`gen_ai.completion` capture behind an explicit opt-in flag that is OFF by default; pin the semconv version in a comment (`gen_ai.prompt`/`gen_ai.completion` are churning).
- Pass `leadId`, `contactId`, `feature` as caller-supplied span attributes: add an optional `trace?: { leadId?: string; contactId?: string; feature?: "close-room" | "qa" | "voice-dojo" }` field to `CompleteOptions` and set them as `oie.lead_id` / `oie.contact_id` / `oie.feature` attributes when present. `apps/web/lib/llm.ts` threads them through.
- `ProviderCost` in Postgres stays the billing source of truth; the span carries cost for visibility only (no double-count: the caller still records the returned `CostRecord`).

Acceptance check: a test in `src/llm/llm.test.ts` registers an in-memory span exporter (`@opentelemetry/sdk-trace-base` `InMemorySpanProcessor`/`BasicTracerProvider` as a devDependency), drives `complete()` via `stubTransport`, and asserts exactly one span named `chat` with `gen_ai.system="anthropic"`, `gen_ai.request.model`, and `gen_ai.usage.input_tokens` set, and span status OK. A second test asserts a failed Zod parse produces a span with status ERROR and a recorded exception. A grep test asserts NO `gen_ai.prompt`/`gen_ai.completion` attribute is emitted unless the opt-in flag is set. `pnpm --filter @oie/integrations test` green. Effort: M.

### N2. Residual-PII Zod assertion at the `nova/findings.ts` boundary

Spec: after `extractFindings` recognises a finding, reject any value still matching a residual-PII pattern, with an allow-list that PRESERVES the `mobile` finding (the +971 moat) but strips emails, national IDs (Emirates ID), IBANs/card-like numbers, and stray non-mobile PII. Keep it pure (no I/O), since this is the one PII control that lives in-repo.

- Add to `src/nova/findings.ts` a Zod refinement step applied per finding:

```ts
import { z } from "zod";

// Keys whose value is allowed to be a phone/mobile (the moat). Everything else
// must be free of residual PII patterns.
const PHONE_ALLOWED_KEYS = new Set<string>(["mobile"]);

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const EMIRATES_ID_RE = /\b784-?\d{4}-?\d{7}-?\d\b/;
const IBAN_RE = /\bAE\d{2}\d{19}\b/i;
const LONG_DIGIT_RE = /\b\d{12,}\b/; // card-like / account-like runs

export function assertNoResidualPii(f: NovaFinding): NovaFinding {
  const v = f.value;
  if (EMAIL_RE.test(v) || EMIRATES_ID_RE.test(v) || IBAN_RE.test(v)) {
    throw new AdapterError({ kind: "invalid_request", provider: "nova",
      message: `residual PII rejected in finding "${f.key}"`, retryable: false });
  }
  if (!PHONE_ALLOWED_KEYS.has(f.key) && LONG_DIGIT_RE.test(v)) {
    throw new AdapterError({ kind: "invalid_request", provider: "nova",
      message: `residual numeric PII rejected in finding "${f.key}"`, retryable: false });
  }
  return f;
}
```

- Apply it in `extractFindings` (or a new exported `extractCleanFindings`) so every returned finding has passed the assertion. The `mobile` finding still flows; an `after_hours_handling` value carrying a stray email is rejected.
- Import `AdapterError` from `../base/errors`. This keeps `findings.ts` free of Prisma/I-O but allows it to depend on the base error taxonomy (already in-package).

Acceptance check: extend `src/nova/findings.test.ts`: (a) a `mobile` finding with `+971501234567` passes and is returned; (b) a finding whose value contains an email throws `AdapterError` kind `invalid_request`; (c) an Emirates-ID-shaped value throws; (d) a non-mobile finding with a 16-digit run throws while a `mobile` value with the same digits passes. `pnpm --filter @oie/integrations test` green. Effort: S.

### N3. Define (but do not wire) the fail-closed compliance contracts as types-only stubs

Spec: add the three NEW contracts to `src/contracts/` and ship in-repo Prisma-free STUBS that fail closed, so the schema/boundary is ready BEFORE the first TDRA-approved call (Part 11). They are NOT placed on any live path now; they exist so NOVA's pre-dial gate and the Inngest send-gate can both call them later. This is the cheap, in-repo half: define the boundary now; the live OneTrust/DNCR wiring is the gated NOVA-go-live track (see Later).

- New file `src/contracts/compliance.ts`:

```ts
/** Tri-state DNCR / suppression result. UNKNOWN fails closed (not callable). */
export type DncrStatus = "listed" | "clear" | "unknown";

export interface DncrProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns "clear" only on a positive clear; network/auth failure => "unknown". */
  checkNumber(e164: string, ctx: AdapterContext): Promise<DncrStatus>;
}

export interface ConsentRecord {
  subject: string;          // E.164 or email
  channel: Channel;         // from @oie/core
  basis: "opt_in" | "public_data" | "warm_intro" | "referral";
  grantedAt: Date;
  sourceUrl?: string | null;
}

export interface ConsentStore {
  readonly name: string;
  isConfigured(): boolean;
  /** True ONLY on a recorded, non-revoked consent for that subject+channel. */
  isConsented(subject: string, channel: Channel, ctx: AdapterContext): Promise<boolean>;
  record(consent: ConsentRecord, ctx: AdapterContext): Promise<void>;
}

export interface AuditEvent {
  kind: "consent" | "disclosure" | "dncr_check" | "send" | "suppression";
  subject: string;
  detail: Record<string, unknown>;
  at: Date;
}

export interface AuditSink {
  readonly name: string;
  isConfigured(): boolean;
  append(event: AuditEvent, ctx: AdapterContext): Promise<void>;
}
```

- Re-export from `src/contracts/index.ts` (`export * from "./compliance";`). These are NET-NEW contracts, justified by the AGENTS.md rule "if none of the five fits, stop and raise it": voice consent/DNCR/audit genuinely do not fit Enrichment/Signal/Email/Messaging/CRM, so a small new family is correct, not a sixth misuse of the existing five.
- Ship fail-closed stubs in `src/compliance/stub.ts` exported from root `src/index.ts`:
  - `StubDncrProvider.checkNumber()` returns `"unknown"` always (so callers treat it as not-callable).
  - `StubConsentStore.isConsented()` returns `false` always; `record()` is a no-op.
  - `StubAuditSink.append()` is a no-op that does NOT throw (so it never blocks, but records nothing until real).
- Add an `isCallable(dncr, consent, e164, channel, ctx)` PURE helper in `src/compliance/decide.ts` that returns `true` only when `dncr === "clear"` AND `isConsented === true`; ANY unknown/false/throw => `false`. The LLM is never consulted; this is the code gate.

Acceptance check: `src/compliance/compliance.test.ts` asserts: stub DNCR returns `"unknown"`; stub consent returns `false`; `isCallable` returns `false` for every combination except (`clear` + consented); a thrown error inside `checkNumber` resolves `isCallable` to `false` (fail closed). Typecheck proves the new contracts compile against `AdapterContext`/`Channel`. `pnpm --filter @oie/integrations test && pnpm --filter @oie/integrations typecheck` green. Effort: S.

### N4. The 1-day DLD / Dubai Pulse spike (NO adapter code; gates all DLD work)

Spec: before any `DubaiPulseAdapter` code, confirm against official Dubai Pulse / DLD docs (CLAUDE.md: verify CURRENT API/limits/auth against official docs):

- Dataset availability and freshness of `dld_transactions-open` and `dld_transactions-open-api` (how stale is "open"? is it usable as a "this week" signal?).
- The OAuth model and token lifetime at `https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken` (the ~30-min expiry, the key+secret two-email delivery), max-results limit, and filter syntax.
- Commercial-use LICENSING terms for the open data (is signal-product use permitted?).
- Whether an `off_plan_launch` free PROXY (first-registration spike from open datasets) is feasible, vs whether the gated Oqood/TAS API Gateway needs a registered active DLD business account.

Deliverable: a short written spike note appended to `docs/PRODUCTION-CHECKLIST.md` (NOT a code change) recording answers + the licensing verdict + the chosen `off_plan_launch` resolution path (proxy or blocked).

Acceptance check: spike note exists with all five questions answered and a GO/NO-GO on the free `transaction_spike` signal. If freshness or licensing fails, the differentiator is re-grounded and N5 (Next) does NOT start. Effort: S (1 day, research only).

## Next (1 to 3 months)

### NX1. `DubaiPulseAdapter`: free `transaction_spike` signal (gated on N4 GO)

- New `SignalType` values FIRST, in `packages/core/src/types.ts` `signalTypeValues`: add `transaction_spike` (and `off_plan_launch` ONLY once N4 settles its source). Add matching TTLs in `packages/core/src/signal-windows.ts` `DEFAULT_SIGNAL_TTL_DAYS` (e.g. `transaction_spike: 14`, a "this week" timing signal decays fast; tune from the spike's freshness finding).
- New folder `src/dubaipulse/`: `mapper.ts` (Zod schemas for the OAuth token response and the transactions query/CSV row; `dubaiPulseToSignal()` setting `provider: "dubaipulse"`, `type: "transaction_spike"`, `strength` clamped to `[0,1]` from a normalised transaction-volume delta, `sourceUrl`, `detectedAt`, `sources.<field> = "dubaipulse"`); `index.ts` (`DubaiPulseAdapter implements SignalProvider`, optionally `EnrichmentProvider` for transaction-volume firmographics).
- OAuth token-refresh: cache the bearer token with its expiry inside the adapter instance; refresh on expiry or 401. The token fetch AND the query are each routed through `httpJson(this.transport, "dubaipulse", req, ctx.signal)` and wrapped in `withRetry`. This is NOT a trivial wrapper (TARGET-ARCH Part 5): token-expiry handling + pagination + max-results limit.
- CSV-rebuild path: a periodic bulk ingest is an Inngest job in `@oie/orchestration`, NOT in this adapter; the adapter exposes only the live REST query. (Keep waterfall/scheduling out of the adapter per AGENTS.md.)
- Credentials (`DUBAI_PULSE_API_KEY`, `DUBAI_PULSE_API_SECRET`) added in `@oie/config` and `.env.example`, supplied via constructor options. Export `DubaiPulseAdapter` from `src/index.ts` under the SignalProvider section.
- Counts against the 3-net-new-vendors-per-quarter cap (this is the one).

Acceptance: fixture test under `src/dubaipulse/fixtures/` covering token-fetch -> query -> normalise, a 401-triggers-refresh path, a clean-miss returning `[]`, and `strength` always in `[0,1]`. Effort: M-L.

### NX2. `off_plan_launch` signal (path decided by N4)

- If N4 chose the free proxy: add `off_plan_launch` to `signalTypeValues` + TTL, and a `dubaiPulseToOffPlanSignal()` deriving a new-project first-registration spike from the same open datasets. Effort: S.
- If N4 found it blocked: do NOT ship code; track Oqood/TAS DLD-business-account onboarding as a PREREQUISITE in PRODUCTION-CHECKLIST. Until granted, the signal is backed by listing/index fallbacks, not assumed-Oqood code. Effort: blocked (no code).

### NX3. Harden Clay as the pay-per-match assembly layer (webhook-only)

- The `ClayAdapter` enqueue/`parseClayWebhook` pattern already IS pay-per-match (DATA-ACQUISITION.md Section 6 "Next"). Next work: confirm the inbound webhook is signature/secret-verified (extend `parseClayWebhook` to require and validate a shared secret before mapping), and that per-match cost is recorded ONCE on the inbound resolution (not on enqueue), so pay-per-match billing is accurate.
- Keep REST/webhook only; Clay's MCP stays read-only and CANNOT trigger the waterfall. No new dep.

Acceptance: a `parseClayWebhook` test asserts an unsigned/forged webhook is rejected before any field is read; a resolved-match test asserts exactly one `CostRecord` at the per-match rate. Effort: S.

### NX4. Per-provider `step.run` isolation is consumed here only as a contract note

- The orchestration change (wrap each `EnrichmentProvider.enrichCompany` in its own `step.run` so a retry memoises matched providers instead of re-billing) lives in `@oie/orchestration`, NOT this package. This package's only obligation: adapters MUST keep cost on `EnrichmentResult.cost` (recorded once by the waterfall) and stay idempotent via `ctx.idempotencyKey`, which they already do. No code change here; documented so the boundary holds. Effort: S (doc only).

## Later (post-PMF, gated)

- Fail-closed compliance contracts go LIVE (TDRA-gated NOVA-go-live track): real `DncrProvider` (in-house Prisma-backed first, then a paid DNCR scrubbing service / OneTrust), real `ConsentStore`, real `AuditSink`. NOVA's pre-dial gate AND the Inngest send-gate both call `isConsented` + DNCR through these and FAIL CLOSED on unknown. Gated on TDRA approval + DNCR access (both non-code blockers).
- Langfuse as a SECOND OTel span processor (Part 8 Later): no change to `LlmClient` (the span contract is already OTel GenAI); registration happens in the app/worker bootstrap, once a Fly/Railway host and live traffic exist. Confirm MIT-vs-EE for the specific judge feature at adoption. Route NOVA's DSPy traces into the same project.
- `PiiVault` contract (Skyflow UAE/Bahrain) at live-PSTN activation: tokenize `Contact.phone/whatsapp/email` and `CallSession.transcript` at the DB boundary, detokenize ONLY at send-adapter egress under the send-gate. A new small contract here; no work to do before a real send.
- Remaining enrichment rails as FALLBACKS, each only when a named live-run coverage gap appears (TARGET-ARCH Part 5, within 3-vendors/quarter cap): Explorium-as-SignalProvider, Linkup, PDL, Ocean.io, Serper, Stagehand. Firecrawl is special: `/extract` is deprecated and `/agent`+Fire-engine are managed-only/excluded from the self-hosted AGPL-3.0 build, so for personal data self-host Firecrawl and run extraction through `LlmClient` (in-region, on the chokepoint); reserve managed `/agent` for non-personal public pages only. Disclose AGPL-3.0 in a buyer data room.
- Microsoft Presidio for transcript PII redaction runs INSIDE NOVA's external repo, NOT here.

## Contracts / interfaces touched (exact names)

- Unchanged (preserve): `EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore` in `src/contracts/interfaces.ts`.
- New contracts (`src/contracts/compliance.ts`, re-exported via `src/contracts/index.ts`): `DncrProvider`, `DncrStatus`, `ConsentStore`, `ConsentRecord`, `AuditSink`, `AuditEvent`.
- New stubs/helpers (`src/compliance/`): `StubDncrProvider`, `StubConsentStore`, `StubAuditSink`, `isCallable()`.
- Modified: `src/llm/client.ts`, `CompleteOptions` gains optional `trace?: { leadId?; contactId?; feature? }`; `complete()` wrapped in an OTel span; export `MODEL_IDS`/`LlmClient` unchanged.
- Modified: `src/nova/findings.ts`, new `assertNoResidualPii(f: NovaFinding): NovaFinding` and `PHONE_ALLOWED_KEYS`; `extractFindings` applies it (or new `extractCleanFindings`).
- New adapter (Next): `DubaiPulseAdapter` in `src/dubaipulse/index.ts` (+ internal `mapper.ts`), exported from `src/index.ts`. New `SignalType` values `transaction_spike` (+ `off_plan_launch` when settled) in `packages/core/src/types.ts` and TTLs in `signal-windows.ts`.
- New dep (Now): `@opentelemetry/api` in `packages/integrations/package.json` `dependencies`; in-memory tracer SDK as a devDependency for the test. New env keys (Next): `DUBAI_PULSE_API_KEY`, `DUBAI_PULSE_API_SECRET` in `@oie/config` + `.env.example`.

## Verification (how each task is proven done)

- N1: `pnpm --filter @oie/integrations test` (span name/attributes/status assertions + no-prompt-leak grep test) and `pnpm --filter @oie/integrations typecheck`. Manual: `apps/web` boots with `instrumentation.ts` registering the exporter and a Close Room `ask()` produces one span visible in Sentry (post-key, behind Human Gate 1).
- N2: `pnpm --filter @oie/integrations test` (the four `nova/findings.test.ts` cases: mobile passes, email/Emirates-ID/long-digit rejected).
- N3: `pnpm --filter @oie/integrations test && pnpm --filter @oie/integrations typecheck` (fail-closed truth table for `isCallable`, stub defaults, thrown-error => false).
- N4: spike note present in `docs/PRODUCTION-CHECKLIST.md` with all five questions answered + GO/NO-GO. No code; nothing to typecheck.
- NX1/NX2/NX3: fixture tests via `stubTransport` (offline, CI-safe), `strength` clamp test, 401-refresh test, webhook-signature-rejection test. Add to `packages/core` signal-windows test that every `SignalType` has a TTL (existing test already enforces this).
- All tasks, before claiming done: `pnpm verify` at repo root (typecheck + lint + test + build). Never make a live provider call to test; live verification is post-key behind Human Gate 1.
- Dep discipline check: `grep -E '"(openai|@anthropic-ai/sdk|langchain|cohere|mistralai)"' packages/integrations/package.json` returns nothing; package deps remain `@oie/core`, `zod`, `@opentelemetry/api` only.

## Risks and do-not

- Do NOT let the OTel span carry prompt/completion text by default (PDPL cross-border): keep `gen_ai.prompt`/`gen_ai.completion` off behind an opt-in flag; pin the semconv version (it churns).
- Do NOT route any traced/costed Claude call around `LlmClient.complete()`. In particular do NOT adopt Inngest `step.ai.infer` for personalisation/scoring rationale: it bypasses the chokepoint, the OTel span, and the `CostRecord`. (TARGET-ARCH deliberately-NOT.)
- Do NOT ship DLD adapter code before N4 passes. If open-transaction data is not fresh enough for a "this week" signal or not licensable for commercial use, "transaction spike this week" is fiction; re-ground first.
- Do NOT assume Oqood/TAS access exists. Ship `off_plan_launch` only via the free proxy, or leave it blocked behind a tracked onboarding prerequisite. Never ship code that assumes the gated API.
- Do NOT make the compliance contracts fail OPEN. Unknown DNCR, missing consent, or any thrown error must resolve to NOT callable / NOT sendable. The LLM never decides callable/sendable.
- Do NOT let the residual-PII assertion strip the `mobile` finding: that +971 mobile is the verify-by-conversation moat. Allow-list it explicitly.
- Do NOT add vendor SDKs or a sixth misuse of the five enrichment/signal/send/CRM interfaces. New compliance contracts are a deliberate, small, separate family with their own discipline. `@opentelemetry/api` is the only justified net-new runtime dep now.
- Do NOT implement waterfall, provider-fallback, priority ordering, decay, the send gate, the approval queue, or rate-limit pacing in any adapter (DLD included). That is `@oie/orchestration`'s job; the adapter trusts its caller.
- Do NOT exceed 3 net-new vendors per quarter. DLD is the one this quarter; every Later rail counts against the cap and needs a named live-run coverage gap to justify it.
- Do NOT put the send path or any durable workflow behind MCP. Clay stays REST/webhook only; its MCP is read-only and cannot trigger the waterfall.
