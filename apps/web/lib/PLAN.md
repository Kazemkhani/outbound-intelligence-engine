# apps/web/lib Plan

> The control-plane LLM seam: add `streamAsk()` (Vercel AI SDK) beside the existing blocking `ask()`, thread cost-per-lead metadata + an OTel GenAI span through the single Anthropic chokepoint, and make `cases.ts` the promptfoo dataset source. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`apps/web/lib` is the Next.js 15 control-plane support layer. Files (verified): `llm.ts`, `canon.ts`, `data.ts`, `fixtures.ts`, `auth-actions.ts`, `utils.ts`, plus `__tests__/{canon,fixtures}.test.ts`. This plan touches `llm.ts` (the focus) and `canon.ts` (its grounding input); it leaves `data.ts`, `fixtures.ts`, `auth-actions.ts`, `utils.ts` untouched.

- `llm.ts` is the ONE Anthropic chokepoint for the control plane (per `apps/web/AGENTS.md` "LLM chokepoint (single Anthropic client)"). It exports exactly one symbol: `ask({ system, user, deep?, maxTokens? }): Promise<string>`. It constructs `new LlmClient({ apiKey })` per call, reads `ANTHROPIC_API_KEY` lazily via `apiKey()`, routes to `DEFAULT_MODEL = MODEL_IDS.personalise` (`claude-sonnet-4-6`) or `DEEP_MODEL = MODEL_IDS.hard` (`claude-opus-4-8`) when `deep`, defaults `maxTokens` to 2000, and already calls `Sentry.captureException` / `Sentry.captureMessage` on failure. It is `// IMPORTANT: server-only`.
- `ask()` callers (verified, all server actions): `app/close/actions.ts` (4: `generatePrep`, `generateOutreach`, `coachTranscript`, ROI narrative), `app/dojo/actions.ts` (2: prospect reply, `scoreRoleplay`), `app/knowledge/actions.ts` (1: `askKnowledge`). All wait for the whole completion, then render. There is no streaming, no per-call trace metadata, and no `leadId`/`feature` carried into the client.
- `canon.ts` is ~9 to 10K tokens of pure string constants plus `grounding(keys[]): string`, which prepends `# GROUNDING CANON` + the "Answer ONLY from the methodology below ... `<CONFIRM>`" cardinal rule. It ships whole in the system prompt; this is the deliberate no-RAG design.
- The cost/observability chokepoint is one layer down: `packages/integrations/src/llm/client.ts` `LlmClient.complete()` returns `CompleteResult { text, toolInput, raw, cost: CostRecord }` and is where the OTel GenAI span will live (Part 8). `lib/llm.ts` is the call site that must pass the trace metadata in.
- Dependency reality (verified against `pnpm-lock.yaml`): `@ai-sdk/anthropic` and `ai` are NOT present (net-new). `@sentry/nextjs@^10.58` and `@opentelemetry/*` (transitive) ARE present. `apps/web/instrumentation.ts` only inits Sentry when `SENTRY_DSN` is set. `promptfoo` is NOT present. The eval dataset already exists at `packages/integrations/src/llm/evals/cases.ts` (`personalisationCases`, `extractionCases` with code-predicate `assertions`) plus `runner.ts`.

## Target architecture for this module (from the research)

TARGET-ARCHITECTURE Part 1 + Part 9 are explicit and prescriptive for this folder:

- Seam #2 (ONE Anthropic chokepoint): "Wrap, do not replace, `apps/web/lib/llm.ts` with a new `streamAsk()` built on `streamText`, reusing the same `MODEL_IDS` tiers and the canon system prompt, returning `toUIMessageStreamResponse()`. The blocking `ask()` stays for non-interactive callers." Net-new deps kept to exactly two: `@ai-sdk/anthropic` and `ai`.
- Seam #3 (ONE wire format): OpenTelemetry GenAI semantic conventions, emitted at the single `LlmClient.complete()` call site (Part 8). `lib/llm.ts` and `streamAsk()` are responsible for attaching `leadId`, `contactId`, and `feature` (close-room | qa | voice-dojo) as trace metadata so cost-per-lead is computable. NOW = Sentry-only; Langfuse is Later.
- The LLM streams prose and reasoning ONLY, never the number (Part 9): "Add a test that the score path never reads model text." `streamAsk` is text-only; scoring stays in `@oie/core`.
- Part 2: promptfoo is the CI eval gate and its dataset source is the existing `cases.ts`; its provider points at the same `apps/web/lib/llm.ts` `ask()` seam so eval traffic flows through the one Anthropic client.
- Part 3 (RAG): keep the cached whole-canon block exactly as is. The `KnowledgeStore`/`Embedder`/`Reranker` ports + pgvector are LATER, gated on corpus size. Nothing to build now.

DATA-ACQUISITION reinforces the phasing: the bottleneck is trust/distribution, not tooling; the system is at Human Gate 2 with 0 of 17 keys and nothing sent. So this folder's NOW work must be pure-TS, near-zero-infra, and demonstrable on the existing dry-run system without standing up any hosted service.

## Invariants this module must preserve

- Deterministic scoring stays in code. `streamAsk()`/`ask()` emit prose and reasoning text only; the number comes from `@oie/core`. No model output, eval score, or trace attribute ever feeds the scorer. (Acceptance test below pins this.)
- DRY_RUN default true + human send-gate. Nothing in `lib/` sends, dials, or flips DRY_RUN. `streamAsk` produces draft copy for a human to approve in the Close Room; the gate stays in `packages/orchestration`.
- Vendor shapes never leak into core. The AI SDK lives ONLY in `apps/web`. `@ai-sdk/anthropic` types stay inside `lib/llm.ts` (and the route handler that consumes its stream); `packages/*` and NOVA are untouched. No `ai`/`@ai-sdk/*` import may appear under `packages/`.
- Secrets only via env. The key is read lazily from `process.env.ANTHROPIC_API_KEY` exactly as `ask()` does today; `streamAsk` uses the same `apiKey()` reader. No key in code, no module-load read.
- UAE PDPL + TDRA gate live voice. Out of scope for this folder (NOVA-external), but `streamAsk` for the Voice Dojo is PRACTICE-only and must never route a live dial.
- ONE chokepoint: do not route any traced or costed Claude call around `LlmClient.complete()`. `step.ai.infer` is forbidden here (it bypasses the OTel span + CostRecord). `streamAsk` is the one deliberate exception (UI streaming), and it must still attach the same trace metadata and remain `apps/web`-only.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

### NOW-1: Add the two net-new deps (`ai`, `@ai-sdk/anthropic`), pinned, apps/web only. Effort: S

Spec. Add exactly these two to `apps/web/package.json` `dependencies` (nowhere in `packages/*`):

```jsonc
// apps/web/package.json -> dependencies
"ai": "^5.0.0",
"@ai-sdk/anthropic": "^2.0.0"
```

Then `pnpm install`. Re-verify the published versions and that `@ai-sdk/anthropic` exposes the `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5` model ids at install time (model strings are exact, never date-suffixed). Do NOT add `@vercel/ai-sdk-gateway`, `assistant-ui`, or any AI Elements package in this task (AI Elements is the route/UI task, not lib).

Acceptance check.
- `grep -rE "@ai-sdk|\"ai\"|from \"ai\"" packages/` returns nothing (boundary held).
- `pnpm --filter @oie/web typecheck` passes with the new deps installed.
- `pnpm-lock.yaml` now contains `ai@` and `@ai-sdk/anthropic@` (and only those two net-new).

### NOW-2: Lift model selection + key reader into shared internals in `lib/llm.ts`. Effort: S

Spec. Before adding `streamAsk`, factor the model + key logic so `ask()` and `streamAsk()` share ONE source of truth (keeps Seam #2 single-chokepoint). In `apps/web/lib/llm.ts` keep `apiKey()` and the `MODEL_IDS`-derived tiers, and add a `feature` tag type and a model resolver:

```ts
// apps/web/lib/llm.ts (add near DEFAULT_MODEL/DEEP_MODEL)
import { MODEL_IDS, type ModelId } from "@oie/integrations";

/** Which control-plane surface issued the call. Used only as trace metadata. */
export type LlmFeature = "close-room" | "knowledge-qa" | "voice-dojo";

/** Resolve the model tier. `deep` => Opus (hard judgement / post-call review). */
export function resolveModel(deep?: boolean): ModelId {
  return deep ? MODEL_IDS.hard : MODEL_IDS.personalise;
}
```

Leave `ask()` behaviour identical (it now calls `resolveModel(opts.deep)`). This is a pure refactor: no caller changes.

Acceptance check.
- `pnpm --filter @oie/web test apps/web/lib/__tests__` still green.
- `pnpm --filter @oie/web typecheck` passes.
- `ask()` public signature unchanged (`apps/web/AGENTS.md` "Public contracts" lists `ask({ system, user, deep?, maxTokens? })`); grep the 7 call sites compile unchanged.

### NOW-3: Add `streamAsk()` in `lib/llm.ts` via `@ai-sdk/anthropic` `streamText`. Effort: M

Spec. Add a streaming sibling to `ask()`, reusing the SAME canon system prompt and `MODEL_IDS` tiers, returning a UI message stream. Text-and-reasoning only. Server-only.

```ts
// apps/web/lib/llm.ts (new export; keep ask() exactly as-is)
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type UIMessage } from "ai";

export interface StreamAskOptions {
  system: string;                 // grounding(...) + instruction template (same as ask)
  user: string;                   // the prospect/transcript/question turn
  deep?: boolean;                 // route to Opus tier
  maxTokens?: number;             // defaults to 2000, matching ask()
  feature: LlmFeature;            // trace metadata (cost-per-lead lens)
  leadId?: string;                // trace metadata
  contactId?: string;             // trace metadata
}

/**
 * Stream Claude's prose/reasoning into an interactive surface (Close Room,
 * Knowledge Q&A, Voice Dojo). Wraps the AI SDK; the SDK never leaves apps/web.
 * The model emits TEXT ONLY, it never emits a score. Returns a Response whose
 * body is a UI message stream for the route handler to forward.
 */
export function streamAsk(opts: StreamAskOptions): Response {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "AI features need ANTHROPIC_API_KEY. Add it to apps/web/.env.local and restart the dev server.",
    );
  }
  const anthropic = createAnthropic({ apiKey: key });

  const result = streamText({
    model: anthropic(resolveModel(opts.deep)),
    system: opts.system,
    prompt: opts.user,
    maxOutputTokens: opts.maxTokens ?? 2000,
    // Adaptive thinking on the Anthropic provider (Opus 4.8 / Sonnet 4.6).
    providerOptions: { anthropic: { thinking: { type: "adaptive" } } },
    // Cost-per-lead + regression metadata. Mirrors the OTel attributes the
    // blocking path attaches at LlmClient.complete() (see NOW-4). Telemetry is
    // a no-op until an exporter is registered, so this is safe with no DSN.
    experimental_telemetry: {
      isEnabled: true,
      functionId: `streamAsk:${opts.feature}`,
      metadata: {
        feature: opts.feature,
        ...(opts.leadId ? { leadId: opts.leadId } : {}),
        ...(opts.contactId ? { contactId: opts.contactId } : {}),
        tier: opts.deep ? "deep" : "default",
      },
    },
    onError: ({ error }) => {
      Sentry.captureException(error, {
        tags: { area: "llm", surface: "stream", feature: opts.feature, tier: opts.deep ? "deep" : "default" },
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
```

Notes pinned to the API reference: model ids are the exact strings `claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5` (never date-suffixed); adaptive thinking is the only on-mode for Opus 4.8 / Sonnet 4.6 (no `budget_tokens`, no `temperature`); re-verify the AI SDK option names (`maxOutputTokens`, `providerOptions.anthropic.thinking`, `experimental_telemetry`, `toUIMessageStreamResponse`) against the installed `ai`@5 version, since these are the churn-prone surface. Re-verify whether `streamText` returns synchronously (it does in AI SDK v5; if the installed version requires `await`, adjust the signature to `Promise<Response>`). `streamAsk` does NOT construct `LlmClient` (that path is for `ask()`); it is the deliberate, documented second path, kept apps/web-only and carrying the identical trace metadata so the cost lens stays whole.

Acceptance check.
- New unit test `apps/web/lib/__tests__/llm.test.ts`: `streamAsk({ system, user, feature: "close-room" })` with no key throws the actionable "AI features need ANTHROPIC_API_KEY" error; with a fake key + a mocked `@ai-sdk/anthropic` it returns a `Response` (assert `instanceof Response` / has a `body`).
- `grep -rE "@ai-sdk|from \"ai\"" packages/` still empty.
- `pnpm --filter @oie/web typecheck && pnpm --filter @oie/web lint` pass.

### NOW-4: Pass cost-per-lead trace metadata through the blocking `ask()` path. Effort: S

Spec. The blocking path must produce the SAME `feature` / `leadId` / `contactId` cost-per-lead metadata as `streamAsk`, attached at the OTel GenAI span that Part 8 places at `LlmClient.complete()`. `lib/llm.ts` is the call site that supplies it. Extend `AskOptions` (additive, all optional so the 7 existing callers compile unchanged) and forward into the client call:

```ts
// apps/web/lib/llm.ts -> AskOptions
export interface AskOptions {
  system: string;
  user: string;
  deep?: boolean;
  maxTokens?: number;
  /** Trace metadata for the cost-per-lead lens (Part 8). Never affects routing. */
  feature?: LlmFeature;
  leadId?: string;
  contactId?: string;
}
```

`ask()` passes a `telemetry` object through to `client.complete(...)`. This requires a small, additive change to `CompleteOptions` in `packages/integrations/src/llm/client.ts` (an optional `telemetry?: { feature?: string; leadId?: string; contactId?: string }` that `complete()` sets as OTel span attributes `gen_ai.huscribe.feature` / `.lead_id` / `.contact_id`). That packages-side span is the Part 8 task; this folder's job is to define the metadata shape in `lib/llm.ts` and pass it. If the Part 8 span is not yet merged, `ask()` still accepts the fields and forwards them (the client ignores unknown options today), so this task is independently shippable.

Then thread real ids at the call sites that have them (not part of lib, but the reason lib carries the fields): `app/close/actions.ts` already loads `lead`, pass `feature: "close-room", leadId: lead.id, contactId: lead.contact.id`; `app/knowledge/actions.ts` passes `feature: "knowledge-qa"`; `app/dojo/actions.ts` passes `feature: "voice-dojo"`.

Acceptance check.
- `AskOptions` gains 3 optional fields; all 7 existing `ask()` callers still typecheck with no edit (additive proof).
- A test asserts the metadata object is constructed and forwarded (spy on a mocked `LlmClient.complete` and assert it received `telemetry.feature === "close-room"`).
- `pnpm --filter @oie/web typecheck` passes.

### NOW-5: Make `cases.ts` the promptfoo dataset source, wired through the `ask()` seam. Effort: M

Spec. promptfoo is the CI eval gate (Part 2), and its dataset source is the existing `packages/integrations/src/llm/evals/cases.ts`. This folder's contribution is the bridge that lets promptfoo's provider call Claude through the ONE control-plane client (`apps/web/lib/llm.ts ask()`), so eval traffic flows the same seam as production.

1. Add a thin promptfoo custom provider at `apps/web/lib/eval/promptfoo-provider.ts` that calls `ask()`:

```ts
// apps/web/lib/eval/promptfoo-provider.ts (server-only; used only by promptfoo CLI)
import { ask } from "../llm";

export default {
  id: () => "huscribe-ask",
  async callApi(prompt: string, ctx: { vars: { system?: string; deep?: boolean } }) {
    const output = await ask({
      system: ctx.vars.system ?? "",
      user: prompt,
      deep: ctx.vars.deep ?? false,
      feature: "knowledge-qa",
    });
    return { output };
  },
};
```

2. Add `apps/web/promptfooconfig.yaml` whose `tests` are GENERATED from `cases.ts` (a tiny `apps/web/lib/eval/build-dataset.ts` script imports `personalisationCases` / `extractionCases` and emits a promptfoo `tests` file; the code predicates in `cases.ts` become `javascript` asserts so CODE still judges and the LLM never emits the number). Add an `llm-rubric` assert ONLY for the scoring RATIONALE prose, never the tier.
3. `cases.ts` stays the labelled data of record; this folder consumes it, it does not duplicate it.

Why the provider lives in `apps/web/lib/eval`: it must reuse the same `ask()` chokepoint and the same env-key reader; putting it here keeps eval and runtime on one Anthropic client per Part 2.

Acceptance check.
- `npx promptfoo eval -c apps/web/promptfooconfig.yaml --no-cache` runs the cases via `ask()` (offline-capable when `cases.ts` predicates are pure; live only when a key is present).
- The generated `tests` count equals `personalisationCases.length + extractionCases.length` (currently 11 + 8 = 19).
- `grep -r "llm-rubric" apps/web/promptfooconfig.yaml` shows the rubric judge scoped to rationale prose, with no rubric asserting a numeric tier/score.
- The turbo task + GitHub Action that gate on pass-rate are owned by the Part 2 (integrations/CI) plan; this folder only proves the provider + dataset bridge runs.

### NOW-6: Lock the "score path never reads model text" invariant with a test. Effort: S

Spec. Add `apps/web/lib/__tests__/llm-boundary.test.ts` proving the deterministic-scoring invariant for this seam: the scoring/ranking path (`scoreAndRankLeads` in `lib/fixtures.ts`, backed by `@oie/core`) produces identical output whether or not `ask()`/`streamAsk()` are called, and never imports them.

```ts
// apps/web/lib/__tests__/llm-boundary.test.ts (sketch)
import { describe, it, expect } from "vitest";
import { scoreAndRankLeads, SEED_ICP, FIXTURE_LEADS } from "@/lib/fixtures";

describe("scoring is code-owned, not model-owned", () => {
  it("ranks identically with no LLM involvement", () => {
    const a = scoreAndRankLeads(SEED_ICP, new Date("2026-06-25"));
    const b = scoreAndRankLeads(SEED_ICP, new Date("2026-06-25"));
    expect(a.map((l) => l.composite)).toEqual(b.map((l) => l.composite));
  });
});
```

Plus a static guard: `grep -L` proof that neither `lib/fixtures.ts` nor `lib/data.ts` imports `lib/llm`.

Acceptance check.
- `pnpm --filter @oie/web test apps/web/lib/__tests__/llm-boundary.test.ts` green.
- `grep -nE "from \"(\\./|@/lib/)llm\"" apps/web/lib/fixtures.ts apps/web/lib/data.ts` returns nothing (the score seam never reads model text).

## Next (1 to 3 months)

- Convert the Close Room, Knowledge Q&A, and Voice Dojo server actions from blocking `ask()` to `streamAsk()` + AI Elements (Reasoning, Sources, Conversation, PromptInput) in `apps/web/app/*`. The lib layer is ready after NOW-3; this is the route/UI wiring (Part 9), kept apps/web-only. Use `streamObject` + the SAME `@oie/core` Zod schemas for typed findings/objection-maps validated at the boundary. AI Elements `Sources` cites canon passages returned by `grounding()`.
- Register the OTel GenAI span processor (`apps/web/instrumentation.ts` NodeSDK bootstrap) so the metadata `lib/llm.ts` already attaches (NOW-4) becomes visible in Sentry as cost-per-lead and latency. This is Part 8's apps/web half; the lib-side metadata contract is done in NOW-4.
- Promote `cases.ts` code predicates to promptfoo `javascript` asserts in full, wire `promptfoo eval --no-cache` as a turbo task + a GitHub Action gated on pass-rate (Part 2 CI ownership), with the `llm-rubric` judge grading only rationale prose.
- Add a `parse` (Haiku) tier path to `resolveModel` only if a high-volume classification surface appears in `apps/web` (today none does; `MODEL_IDS.parse` exists but no control-plane caller needs it).

## Later (post-PMF, gated)

- Canon RAG ports, gated strictly on corpus size (Part 3): when transcripts + per-deal `CallFinding` + playbook history outgrow the cached `canon.ts`, add a thin `KnowledgeStore` (+ `Embedder`, `Reranker`) port under `packages/integrations` and a Neon-pgvector + pg_search hybrid (RRF k=60) with Anthropic Contextual Retrieval ingestion; Voyage `voyage-3.5` / `rerank-2.5` (Cohere Embed v4 / Rerank 3.5 for Arabic) behind the port; Turbopuffer as the escape hatch. `lib/llm.ts` Q&A would call the port, never raw SQL, and `grounding()` would compose retrieved chunks instead of the whole canon. Build none of this now: `canon.ts` ships whole with zero retrieval-failure risk.
- Self-hosted Langfuse as a second OTel span processor registered alongside Sentry's (Part 8), once a Fly/Railway host exists and there is live traffic; the metadata shape from NOW-4 fans out unchanged. Confirm MIT-vs-EE for any judge feature at adoption.
- Ax (`@ax-llm/ax`) offline prompt optimizer in `scripts/optimize-prompt.ts`, evolving the wrapper around `canon.ts` against the same promptfoo dataset; freeze and check in the winner. Runtime keeps using the `ask()` seam.
- Read-only internal MCP server: never on the send path, build-time/operator only (ADR-0002). Not a lib concern.

## Contracts / interfaces touched (exact names)

- `apps/web/lib/llm.ts`: unchanged export `ask(opts: AskOptions): Promise<string>`; new exports `streamAsk(opts: StreamAskOptions): Response`, `resolveModel(deep?: boolean): ModelId`, types `LlmFeature`, `StreamAskOptions`; extended `AskOptions` (additive optionals `feature?`, `leadId?`, `contactId?`).
- `apps/web/lib/canon.ts`: `grounding(keys: string[]): string` and the named blocks (`FRAMEWORKS`, `OBJECTIONS`, `VOSS`, `PERSONALIZATION`, `DUBAI_PLAYBOOK`, `DISCOVERY`, `CLOSING`, `HUSCRIBE_FACTS`) reused as-is by both `ask()` and `streamAsk()`. No edits.
- `apps/web/lib/eval/promptfoo-provider.ts` (new), `apps/web/lib/eval/build-dataset.ts` (new), `apps/web/promptfooconfig.yaml` (new): the bridge from `packages/integrations/src/llm/evals/cases.ts` (`personalisationCases`, `extractionCases`) to promptfoo, calling through `ask()`.
- `@oie/integrations` consumed: `LlmClient`, `MODEL_IDS`, `ModelId`. New net-new deps: `ai`, `@ai-sdk/anthropic` (apps/web only).
- Coordinated, owned by other plans (named so they line up): `CompleteOptions` in `packages/integrations/src/llm/client.ts` gains optional `telemetry?: { feature?: string; leadId?: string; contactId?: string }` (Part 8); the OTel GenAI span + `gen_ai.*` attributes are emitted in `LlmClient.complete()`, not in lib.

## Verification (how each task is proven done)

- NOW-1: `pnpm install` clean; `grep -rE "@ai-sdk|from \"ai\"" packages/` empty; lockfile contains the two new deps.
- NOW-2: `pnpm --filter @oie/web typecheck`; existing `__tests__/{canon,fixtures}.test.ts` stay green; `ask()` signature unchanged.
- NOW-3: `pnpm --filter @oie/web test apps/web/lib/__tests__/llm.test.ts` (no-key throw + Response-returned); `pnpm --filter @oie/web lint`; boundary grep empty.
- NOW-4: additive-compile proof (7 callers unedited typecheck); spy test that `telemetry.feature` reaches the (mocked) client; `pnpm --filter @oie/web typecheck`.
- NOW-5: `npx promptfoo eval -c apps/web/promptfooconfig.yaml --no-cache` runs; generated test count == 19; rubric scoped to rationale prose only.
- NOW-6: `pnpm --filter @oie/web test apps/web/lib/__tests__/llm-boundary.test.ts` green; score-path grep proves no `lib/llm` import.
- Whole folder: `pnpm verify` (typecheck + lint + test + build) green before claiming done, per CLAUDE.md.

## Risks and do-not

- Do NOT route `streamAsk` through `LlmClient.complete()` AND also through the AI SDK, that double-bills and double-traces. `streamAsk` is the ONE deliberate apps/web-only streaming path; it carries the identical trace metadata so the cost-per-lead lens stays whole, and the blocking `ask()` stays on `LlmClient`.
- Do NOT use `step.ai.infer` for any control-plane Claude call: it bypasses `LlmClient.complete()`, so no OTel span and no `CostRecord` (TARGET-ARCHITECTURE Part 6 / "deliberately NOT").
- Do NOT let `@ai-sdk/*` or `ai` types cross into `packages/*` or NOVA. Enforce with the boundary grep in every acceptance check; if a shared shape is needed, define it in `lib/llm.ts` with `@oie/core` Zod types, not vendor types.
- Do NOT emit a score, tier, or any number from `streamAsk`/`ask`; do NOT add an `llm-rubric` that grades a numeric tier. The model writes prose and reasoning only; the number is `@oie/core`'s (NOW-6 pins this).
- Do NOT build canon RAG now: `canon.ts` is ~9 to 10K tokens, ships whole prompt-cached with zero retrieval-failure risk and trivial citation. Gate strictly on corpus size (Part 3).
- Do NOT pin AI SDK option names from memory: `maxOutputTokens`, `providerOptions.anthropic.thinking`, `experimental_telemetry`, `toUIMessageStreamResponse`, and whether `streamText` is sync are version-churn-prone, verify against the installed `ai`@5 before claiming done (CLAUDE.md: verify provider APIs against current docs).
- Do NOT exceed three net-new vendors/quarter: this folder spends exactly two SDK packages (`ai`, `@ai-sdk/anthropic`) plus promptfoo (Part 2), at the cap; add nothing else (no AI Gateway, no assistant-ui Cloud, no Langfuse now).
- Do NOT read the key at module load or hardcode a DSN/key; keep the lazy `apiKey()` reader so a missing key is an actionable runtime error, not a build crash.
