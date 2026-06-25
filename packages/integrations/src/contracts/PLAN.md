# contracts Plan

> The stable, vendor-neutral, fail-closed interfaces every adapter implements. This plan specifies the EXACT new compliance ports (DncrProvider, ConsentStore, AuditSink) plus the Later RAG ports (KnowledgeStore, Embedder, Reranker), with method signatures, kept fail-closed and vendor-neutral. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`packages/integrations/src/contracts/` holds exactly three files:

- `interfaces.ts` (2588 bytes): the FIVE canonical interfaces and their query types.
  - `EnrichmentProvider` (`isConfigured`, `enrichCompany`, `enrichContact`, optional `discoverCompanies`)
  - `SignalProvider` (`isConfigured`, `fetchSignals`)
  - `EmailSender` (`isConfigured`, `send`; honours `ctx.dryRun`)
  - `MessagingChannel` (`isConfigured`, `send`, `readonly channel: "linkedin" | "whatsapp"`; honours `ctx.dryRun`)
  - `CrmStore` (`isConfigured`, `upsertCompany`, `upsertContact`)
  - Query types: `CompanyQuery`, `ContactQuery`, `SignalQuery`.
- `model.ts` (3794 bytes): the unified DTOs. `NormalisedCompany`, `NormalisedContact`, `NormalisedSignal`, `OutboundEmail`, `OutboundMessage`, `SendResult`, `SendOutcome`, `CrmRef`, `EnrichmentResult<T>`, `AdapterContext`, `CostRecord`, `FieldSource`, plus `SignalType`/`Seniority`/`Channel`/`EmailStatus` re-imported from `@oie/core`.
- `index.ts` (55 bytes): barrel, `export * from "./model"; export * from "./interfaces";`. Re-exported from the package root `src/index.ts` (line 1: `export * from "./contracts/index"`).

Verified facts that constrain this plan:

- The contracts are the anti-corruption boundary named in invariant #3 (TARGET-ARCHITECTURE.md line 34). The five interfaces, plus `LlmClient` and the NOVA findings parser, are the ONLY surface vendor shapes may touch.
- `AdapterContext` already carries `dryRun`, `idempotencyKey`, `signal: AbortSignal`, and `recordCost`. New ports thread the SAME context, no new context shape.
- The compliance ports are NOT in `contracts/` yet, by design. TARGET-ARCHITECTURE.md Part 11 (lines 302 to 305) puts "Fail-closed `ConsentStore`, `DncrProvider`/`SuppressionProvider` (tri-state, fail-closed on unknown), and `AuditSink` contracts in `packages/integrations/src/contracts`" on the NOVA-go-live track, "shipped as fail-closed stubs only", gated on TDRA approval, "decided in CODE (the LLM never decides callable or sendable), in-house Prisma-backed first, OneTrust later."
- The downstream callers that will consume these ports already exist: `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` (pure, total, returns `SendGateDecision`) is the Inngest send-gate authority; NOVA's own pre-dial gate lives in NOVA's EXTERNAL repo and is out of scope for code here.
- Prisma models the in-house adapters will back onto exist: `Suppression` (currently `email?`, `domain?`, `reason`, no phone/channel), `AuditLog` (append-only by convention only), `CallSession` (`consent: Boolean`, `consentBasis: String?`, `optOut: Boolean`).
- The in-repo NOVA boundary is `nova/findings.ts` (`extractFindings`, `CANONICAL_FINDING_KEYS` including `mobile` and `opt_in`). It is the residual-PII assertion site (Part 11, in-repo NOW), but it is NOT in `contracts/` and is a separate folder's plan; this plan only references it as the producer of `opt_in` consent events an `AuditSink`/`ConsentStore` would record.
- `@oie/integrations` depends ONLY on `@oie/core` and `zod` (AGENTS.md NEVER list). The RAG ports (Later) must NOT pull a vendor SDK; Voyage/Cohere/pgvector arrive as adapters behind the port, not as deps of `contracts/`.

## Target architecture for this module (from the research)

The contracts folder is the realisation of seam-discipline invariant #3 and of the rule "If none of the five fits, stop and raise it; do not invent a sixth" (AGENTS.md line 73). The research authorises a small, controlled EXPANSION of that contract set, not a free-for-all. Two distinct new families, on two different clocks:

1. Compliance ports (NEXT-shaped but TDRA-gated, so effectively Later-actionable): `DncrProvider`, `ConsentStore`, `AuditSink`. These are the code-owned authority for "is this number callable / sendable" and "is this immutably logged." They MUST be fail-closed and vendor-neutral so the in-house Prisma-backed implementation and a later OneTrust/managed-DNCR implementation are swappable behind the same port (TARGET-ARCHITECTURE.md line 305). The send-gate (`packages/orchestration`) and NOVA's external pre-dial gate both call them and FAIL CLOSED on unknown. DATA-ACQUISITION.md is explicit that DNCR screening and prior consent are TDRA Cabinet Resolution 56/57 requirements before ANY automated/at-scale channel (lines 213 to 233), and that warm 1:1 outreach runs on a separate non-blocking clock. So the CONTRACT exists now (cheap, pure TS, no service), the live DNCR data source is TDRA-gated.

2. Knowledge/RAG ports (Later, corpus-size-triggered): `KnowledgeStore`, `Embedder`, `Reranker`. TARGET-ARCHITECTURE.md Part 3 (lines 104 to 108) and the Later roadmap (line 348) authorise "a thin `KnowledgeStore` port (plus Embedder and Reranker ports) under the existing adapter discipline," with provider selection (Voyage vs Cohere) a config flip, embeddings in Neon pgvector, idempotent upsert by `contentHash`, per-chunk model id + dimension so an embedder swap is contained, and exact-citation metadata (`source`, `sourceUrl`, `contentHash`, `updatedAt`). These ports are NOT built now (canon ships whole in a cached prompt block); they are SPECIFIED now so the eventual build is a drop-in.

The folder stays pure: types and interfaces only, zero I/O, zero Prisma, zero vendor imports. Concrete adapters (Prisma-backed ConsentStore, pgvector KnowledgeStore, Voyage Embedder) live in their own `src/<vendor>/` folders behind these ports. The contracts NEVER reach for a number themselves and NEVER decide policy beyond the fail-closed default.

## Invariants this module must preserve

- Deterministic scoring stays in code; the LLM never emits the number. None of these ports take, return, or imply a score, a tier, or a model output that feeds the scorer. `KnowledgeStore` retrieval feeds Q&A prose only, never `ScoringSubject`.
- DRY_RUN default true + mandatory human send-gate. The compliance ports are GATES the send-gate consults; they can only make a send MORE restricted (fail closed), never relax DRY_RUN or auto-approve. A `ConsentStore`/`DncrProvider` "callable" answer is necessary, not sufficient: `evaluateSendGate` still requires DRY_RUN off AND human approval.
- Vendor shapes never leak into core. Every new port is vendor-neutral; OneTrust, a DNCR scrubbing vendor, Voyage, Cohere, pgvector, Turbopuffer all sit BEHIND the port in their own adapter folder. No vendor type appears in `contracts/`.
- Secrets only via env; UAE PDPL + TDRA gate any live voice. The contracts read no secrets. The live DNCR/consent data source is TDRA-gated; until access lands the only shipped implementation is a fail-closed stub. Transcript ingestion via `KnowledgeStore` is cross-border processing and is gated like live voice (prefer no-retention endpoints) at the ADAPTER, the port stays neutral.
- Do NOT adopt deliberately-NOT items. No LangChain/LlamaIndex runtime types smeared across these ports (TARGET-ARCHITECTURE.md line 104, 376). No vendor SDK added to this package (AGENTS.md line 67). No sixth "general" interface invented beyond what the research names.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

The folder's Now work is deliberately SMALL. The three official Now items (durable send-gate, promptfoo, OTel span) live in other folders. For `contracts/`, the only Now-actionable, pure-TS, zero-infra, zero-service work that the research authorises BEFORE TDRA access is: define the fail-closed compliance PORT TYPES and the shared fail-closed result enum, so the in-house stubs (built on the NOVA-go-live track) and the send-gate have a stable target. This is "cheap, in-repo, immediately demonstrable" (Part 11 spirit) and matches "the CONTRACT exists now, the data source is TDRA-gated." No concrete adapter ships in this window.

### Task N1 (Now, S): Add the shared fail-closed primitives + `AuditSink` to a new `compliance.ts`

Create `packages/integrations/src/contracts/compliance.ts`. Start with the primitives every compliance port shares (tri-state, fail-closed), and the simplest port (`AuditSink`), which has no TDRA dependency and can be exercised today against the existing `AuditLog` model.

```ts
// packages/integrations/src/contracts/compliance.ts
import type { AdapterContext } from "./model";

/**
 * Tri-state callable/sendable verdict. UNKNOWN is NOT a pass: every caller
 * MUST treat anything other than ALLOWED as a hard block (fail closed).
 * Per docs/architecture/TARGET-ARCHITECTURE.md Part 11 and
 * docs/strategy/DATA-ACQUISITION.md section 4 (TDRA DNCR screening).
 */
export type ComplianceVerdict = "allowed" | "blocked" | "unknown";

/** A reason a verdict was reached, for the audit trail. Never PII. */
export interface ComplianceReason {
  verdict: ComplianceVerdict;
  /** Stable machine code, e.g. "on_dncr", "no_consent", "provider_unavailable". */
  code: string;
  /** Human-readable, non-PII explanation. */
  detail: string;
  /** Which port/provider produced the verdict, e.g. "dncr:stub", "consent:prisma". */
  source: string;
  /** When the underlying data was last known good; drives staleness fail-closed. */
  checkedAt: Date;
}

/** Helper contract: a verdict is only a pass when explicitly "allowed". */
export function isAllowed(reason: ComplianceReason): boolean {
  return reason.verdict === "allowed";
}

/**
 * Immutable audit sink. Append-only by construction: there is no update or
 * delete method. Backed in-house by the append-only Postgres AuditLog now,
 * by immudb later (NOVA-go-live track). Vendor-neutral.
 */
export interface AuditSink {
  readonly name: string;
  isConfigured(): boolean;
  /** Append one tamper-evident record. Returns the persisted record id. */
  append(event: AuditEvent, ctx: AdapterContext): Promise<{ id: string }>;
}

export interface AuditEvent {
  /** Who/what acted, e.g. "send-gate", "nova", "operator:gp@humai.ae". */
  actor: string;
  /** What happened, e.g. "consent.captured", "send.gated", "dncr.checked". */
  action: string;
  /** Entity kind, e.g. "Contact", "CallSession", "Suppression". */
  entity: string;
  entityId?: string;
  /** Structured, PII-minimised payload. */
  payload?: Record<string, unknown>;
  at?: Date;
}
```

Acceptance check: `pnpm --filter @oie/integrations typecheck` passes; `isAllowed({verdict:"unknown",...})` returns `false` and `isAllowed({verdict:"blocked",...})` returns `false` (one unit test in `contracts/compliance.test.ts`).

### Task N2 (Now, S): Add `DncrProvider` and `ConsentStore` port types to `compliance.ts` (types only, no adapter)

Append the two TDRA-gated ports. Types only this window: the live data source is gated, so no concrete adapter beyond a future fail-closed stub. Defining the SHAPE now is the cheap, in-repo win.

```ts
/**
 * Do-Not-Call-Registry screening (TDRA DNCR). Fail-closed: an unreachable or
 * stale provider yields "unknown", which callers MUST treat as blocked. The
 * live DNCR data source is TDRA-gated; until access lands the only shipped
 * implementation is a fail-closed stub that returns "unknown" for every number.
 */
export interface DncrProvider {
  readonly name: string;
  isConfigured(): boolean;
  /**
   * Is this E.164 number screened-clear to contact on this channel?
   * MUST default to "unknown" (-> blocked) on any error, timeout, or miss.
   */
  screen(input: DncrQuery, ctx: AdapterContext): Promise<ComplianceReason>;
}

export interface DncrQuery {
  /** E.164, e.g. "+9715xxxxxxxx". The port never stores or logs it in clear. */
  phoneE164: string;
  /** The contact channel being screened. */
  channel: "voice" | "sms" | "whatsapp";
}

/**
 * Consent system of record. Fail-closed: absence of a positive, in-date consent
 * record yields "blocked" (NOT "unknown" by default, no record means no consent).
 * In-house Prisma-backed first (CallSession.consent / opt_in findings /
 * Suppression), OneTrust later. Vendor-neutral.
 */
export interface ConsentStore {
  readonly name: string;
  isConfigured(): boolean;
  /** Is there a current, non-revoked consent for this subject + channel + purpose? */
  isConsented(input: ConsentQuery, ctx: AdapterContext): Promise<ComplianceReason>;
  /** Record a consent event (e.g. NOVA opt_in finding, inbound WhatsApp opt-in). */
  recordConsent(event: ConsentEvent, ctx: AdapterContext): Promise<{ id: string }>;
  /** Record a revocation/opt-out; writes durable cross-channel suppression. */
  recordOptOut(event: OptOutEvent, ctx: AdapterContext): Promise<{ id: string }>;
}

/** A subject is identified by a contactId and/or a hashed channel handle. */
export interface ConsentSubject {
  contactId?: string;
  /** Channel handle (E.164, email, WhatsApp). Adapter hashes/tokenises at rest. */
  handle?: string;
  channel: "voice" | "sms" | "whatsapp" | "email" | "linkedin";
}

export interface ConsentQuery extends ConsentSubject {
  /** Why we want to contact, e.g. "qualify_interest". Purpose limitation (PDPL). */
  purpose: string;
}

export interface ConsentEvent extends ConsentSubject {
  purpose: string;
  /** Lawful basis, e.g. "made_public_by_subject", "inbound_opt_in", "demo". */
  basis: string;
  /** Provenance: where the consent came from (source URL, callSessionId, etc.). */
  evidence?: Record<string, unknown>;
  at?: Date;
}

export interface OptOutEvent extends ConsentSubject {
  reason: string;
  at?: Date;
}
```

Acceptance check: `pnpm --filter @oie/integrations typecheck` passes. A type-level test asserts `DncrProvider.screen` and `ConsentStore.isConsented` both return `Promise<ComplianceReason>` (the same fail-closed shape). No adapter, no Prisma import in this file.

### Task N3 (Now, S): Wire the barrel + a doc comment block; keep mappers internal

Add `export * from "./compliance";` to `contracts/index.ts` (so the ports surface via the package root and the `./contracts` subpath). Add a header comment in `compliance.ts` linking to TARGET-ARCHITECTURE.md Part 11 and noting "fail-closed, vendor-neutral, no adapter ships until TDRA access (NOVA-go-live track)." Do NOT add any new dependency (AGENTS.md line 67).

```ts
// packages/integrations/src/contracts/index.ts
export * from "./model";
export * from "./interfaces";
export * from "./compliance";
```

Acceptance check: `import type { DncrProvider, ConsentStore, AuditSink, ComplianceVerdict } from "@oie/integrations"` resolves from `packages/orchestration` (typecheck); `pnpm --filter @oie/integrations build` (tsc --noEmit) passes; `pnpm verify` at root stays green.

## Next (1 to 3 months)

Tied to the NOVA-go-live track and gated on TDRA approval (a non-code blocker). The PORTS exist after Now; the fail-closed stub ADAPTERS and the in-house Prisma-backed implementation are Next.

- N4 (Next, S): `src/dncr/index.ts`: a fail-closed `DncrStubAdapter implements DncrProvider` whose `screen()` always returns `{ verdict: "unknown", code: "dncr_not_provisioned", source: "dncr:stub", ... }`. Lets DEMO_MODE stay provably safe (TARGET-ARCHITECTURE.md line 311). Fixture test: every input returns a non-allowed verdict.
- N5 (Next, M): `src/consent/index.ts`: a `PrismaConsentStore implements ConsentStore` backed by `CallSession.consent`/`consentBasis`, the `opt_in` CallFinding (from `nova/findings.ts`), and the extended `Suppression` model (phone + channel). `isConsented` returns "blocked" when no positive in-date record exists; "allowed" only on a matching consent and NO matching suppression. Prereq: the Suppression phone+channel migration (Part 11 Now, owned by `packages/db`), and the channel param on `Suppression`.
- N6 (Next, S): `src/audit/index.ts`: a `PrismaAuditSink implements AuditSink` writing to the append-only `AuditLog` (the DB trigger that blocks UPDATE/DELETE is the `packages/db` Part 11 Now item). `append` is the only method; there is structurally no mutate path.
- N7 (Next, S): Make `evaluateSendGate`'s caller in `packages/orchestration/src/sequencing/inngest.ts` call `DncrProvider.screen` + `ConsentStore.isConsented` BEFORE `evaluateSendGate`, treating any non-"allowed" as a hard block, and `AuditSink.append` after. The PURE `evaluateSendGate` signature is unchanged; the compliance checks wrap it. (Orchestration's plan owns this; listed here because it consumes these contracts.)
- N8 (Next, S): Add `transaction_spike` (and, once its source is settled, `off_plan_launch`) to `signalTypeValues` in `@oie/core` so the DLD adapter maps into `NormalisedSignal.type` without a contract change. No change to `contracts/` itself; the DLD adapter sits behind the existing `SignalProvider`. (Listed so the contract owner confirms no new interface is needed for DLD: it is NOT a sixth interface.)

## Later (post-PMF, gated)

Corpus-size-triggered (Part 3) and live-PSTN-triggered. Specify the RAG ports now; build when the trigger fires.

- L1 (Later, M): `KnowledgeStore`, `Embedder`, `Reranker` port types in a new `packages/integrations/src/contracts/knowledge.ts`. Built only when the corpus (NOVA transcripts + per-deal CallFindings + playbooks) outgrows the cached canon (TARGET-ARCHITECTURE.md line 104). Proposed signatures:

```ts
// packages/integrations/src/contracts/knowledge.ts
import type { AdapterContext } from "./model";

/** A retrievable chunk with exact-citation metadata (TARGET-ARCHITECTURE line 106). */
export interface KnowledgeChunk {
  id: string;
  content: string;
  /** Logical source, e.g. "canon", "transcript", "playbook". */
  source: string;
  sourceUrl?: string | null;
  /** sha256 of content; the idempotent upsert key. */
  contentHash: string;
  /** Embedding model id + dimension per chunk so an embedder swap is contained. */
  embeddingModel?: string | null;
  embeddingDim?: number | null;
  updatedAt: Date;
  /** Same-SQL filter keys (companyId, language "en"|"ar", etc.). PDPL-aware. */
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk extends KnowledgeChunk {
  /** Fused relevance score (RRF), retrieval-only; NEVER feeds the scorer. */
  relevance: number;
}

export interface KnowledgeQuery {
  text: string;
  topK: number;
  /** e.g. { language: "ar" } for bilingual queries (TARGET-ARCHITECTURE line 108). */
  filter?: Record<string, unknown>;
}

/** Vector + BM25 store (Neon pgvector + pg_search, RRF k=60). Vendor-neutral. */
export interface KnowledgeStore {
  readonly name: string;
  isConfigured(): boolean;
  /** Idempotent upsert by contentHash. */
  upsert(chunks: KnowledgeChunk[], ctx: AdapterContext): Promise<{ upserted: number }>;
  retrieve(query: KnowledgeQuery, ctx: AdapterContext): Promise<RetrievedChunk[]>;
}

/** Embedding provider (Voyage voyage-3.5; Cohere Embed v4 for Arabic). */
export interface Embedder {
  readonly name: string;
  readonly model: string;
  readonly dimension: number;
  isConfigured(): boolean;
  embed(texts: string[], ctx: AdapterContext): Promise<number[][]>;
}

/** Reranker (Voyage rerank-2.5; Cohere Rerank 3.5). */
export interface Reranker {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  rerank(
    query: string,
    candidates: RetrievedChunk[],
    topK: number,
    ctx: AdapterContext,
  ): Promise<RetrievedChunk[]>;
}
```

- L2 (Later, M-L): pgvector `KnowledgeStore` adapter + Voyage/Cohere `Embedder`/`Reranker` adapters behind these ports; provider selection a config flip in `packages/config`; Contextual Retrieval ingest job in `packages/orchestration`. Turbopuffer as the one-adapter escape hatch behind `KnowledgeStore`. None pulls a vendor SDK into `contracts/`.
- L3 (Later, gated on live PSTN): the OneTrust/managed-DNCR adapter behind `DncrProvider`; a `PiiVault` port + Skyflow adapter for tokenising `Contact.phone`/`whatsapp`/`email`/`CallSession.transcript` (TARGET-ARCHITECTURE line 306), detokenised only at send-adapter egress under the send-gate. The `PiiVault` contract is specified at live-PSTN activation, not now.
- L4 (Later, gated on real cohort data): a read-only `AnalyticsStore` contract (TARGET-ARCHITECTURE line 212), downstream and de-identified, never on the OLTP/scoring/send path.

## Contracts / interfaces touched (exact names)

New files: `packages/integrations/src/contracts/compliance.ts` (Now), `packages/integrations/src/contracts/knowledge.ts` (Later), `packages/integrations/src/contracts/compliance.test.ts` (Now).

New exported symbols (Now): `ComplianceVerdict`, `ComplianceReason`, `isAllowed`, `AuditSink`, `AuditEvent`, `DncrProvider`, `DncrQuery`, `ConsentStore`, `ConsentSubject`, `ConsentQuery`, `ConsentEvent`, `OptOutEvent`.

New exported symbols (Later): `KnowledgeStore`, `KnowledgeChunk`, `RetrievedChunk`, `KnowledgeQuery`, `Embedder`, `Reranker`.

Edited: `packages/integrations/src/contracts/index.ts` (add `export * from "./compliance";`, and later `export * from "./knowledge";`). Unchanged: `interfaces.ts`, `model.ts` (the five interfaces and DTOs are stable; new ports reuse `AdapterContext` verbatim).

Consumers (no signature change in this folder): `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` stays pure; the Inngest send step wraps it with `DncrProvider`/`ConsentStore`/`AuditSink` calls. `@oie/core` `signalTypeValues` gains DLD values (separate folder).

## Verification (how each task is proven done)

- N1: `pnpm --filter @oie/integrations test` runs `contracts/compliance.test.ts`: `isAllowed` is true ONLY for `verdict === "allowed"`; `AuditEvent` typechecks with and without `entityId`/`payload`.
- N2: `pnpm --filter @oie/integrations typecheck`. A type-only assertion (e.g. `const _x: (i: DncrQuery, c: AdapterContext) => Promise<ComplianceReason> = ({} as DncrProvider).screen;`) compiles. Grep proves no `import ... from "@prisma/client"` and no vendor import in `compliance.ts`.
- N3: `pnpm --filter @oie/integrations build` (tsc --noEmit) and root `pnpm verify` both green. `node -e` / a tsx scratch import of `{ DncrProvider, ConsentStore, AuditSink }` from `@oie/integrations` resolves (type-only, so verified via typecheck of a consumer file in `packages/orchestration`).
- N4 to N6 (Next): `pnpm --filter @oie/integrations test` with `stubTransport` where relevant: DncrStub returns non-allowed for every input; PrismaConsentStore returns "blocked" on no record; PrismaAuditSink has no mutate method (compile-time) and `append` returns an id.
- N7 (Next): a regression test in `packages/orchestration`: a send where `DncrProvider.screen` -> "unknown" is BLOCKED even with DRY_RUN off and human approval (fail-closed), and an `AuditSink.append` row is written.
- L1 (Later): `knowledge.ts` typechecks; `Embedder.dimension` matches `KnowledgeChunk.embeddingDim` in a fixture test of the eventual adapter.
- All: `pnpm verify` (typecheck + lint + test + build) at repo root is the gate per CLAUDE.md before claiming done.

## Risks and do-not

- DO NOT ship a DNCR or ConsentStore adapter that returns "allowed" by default. The default for `DncrProvider` is "unknown" (-> blocked) and for `ConsentStore` is "blocked" (no record = no consent). A wrong AI-voice campaign can exceed runway (DATA-ACQUISITION.md line 224). Fail closed, always.
- DO NOT let a compliance verdict relax the send-gate. "allowed" from DncrProvider/ConsentStore is necessary, not sufficient; `evaluateSendGate` still requires DRY_RUN off AND human approval AND channel-enabled. The ports can only ADD blocks.
- DO NOT invent a sixth general-purpose interface. These ports are the SPECIFIC ones the research names (Part 11, Part 3). If a new vendor needs something none of these fit, stop and raise it (AGENTS.md line 73).
- DO NOT add a dependency to `@oie/integrations`. It stays `@oie/core` + `zod` only. OneTrust, Skyflow, Voyage, Cohere, pgvector, Turbopuffer all sit BEHIND the port in their own adapter folder; none imports into `contracts/`.
- DO NOT put any vendor type, a LangChain/LlamaIndex retriever type, or raw Prisma rows into `contracts/`. The ports are pure TS interfaces over the unified DTOs.
- DO NOT let `KnowledgeStore.retrieve` results reach the scorer. Retrieval feeds Q&A/Close Room prose only; `relevance` is retrieval-only and never a scoring input (invariant #1).
- DO NOT build the RAG ports' adapters or the consent/DNCR adapters before their trigger: corpus-outgrows-canon for RAG, TDRA approval for DNCR/consent. Specifying the contract is cheap; building the unexercised adapter is scaffolding cost (TARGET-ARCHITECTURE.md line 291).
- DO NOT log raw PII in `ComplianceReason`/`AuditEvent`. Codes and detail strings are non-PII; the E.164 in `DncrQuery` is consumed by the adapter and hashed/tokenised at rest, never echoed into the audit payload in clear.
- DO NOT make `AuditSink` mutable. There is intentionally no update/delete method; tamper-evidence is a property of the contract, enforced at the adapter (append-only AuditLog trigger now, immudb later).
