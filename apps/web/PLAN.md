# apps/web Plan

> The control plane: the single Next.js operator cockpit that makes the deterministic brain legible and controllable, streams Claude's reasoning into Close/Knowledge/Dojo, and emits the one human send-gate resume event. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`apps/web` is the Vercel-deployed unit (`vercel.json`, `scripts/sync-keys-to-vercel.sh`, PRODUCTION-CHECKLIST Stage 2 LIVE 2026-06-16). The repo-root `fly.toml` is STALE; `AGENTS.md` line 11 still claims a `fly.dev` URL, which is wrong against the deploy reality and should be corrected to the Vercel URL during the Now phase.

What exists today (verified):

- App Router, no `src/`. Routes under `app/`: `/`, `/leads`, `/icp`, `/signals`, `/approvals`, `/voice`, `/close`, `/knowledge`, `/dojo`, `/analytics`, `/signin`.
- The ONE Anthropic chokepoint for the control plane: `lib/llm.ts` exports `ask({ system, user, deep?, maxTokens? }): Promise<string>`. It news up `LlmClient` from `@oie/integrations`, reads `ANTHROPIC_API_KEY` lazily, routes `deep` to `MODEL_IDS.hard` (opus) and default to `MODEL_IDS.personalise` (sonnet), and calls `Sentry.captureException`/`captureMessage` on failure. It is BLOCKING: it awaits the whole completion. No streaming. The `CompleteResult.cost` (`CostRecord`) returned by `LlmClient.complete()` is currently DISCARDED in `lib/llm.ts`.
- AI server actions, all routed through `ask()`, all grounded by `grounding([...])` from `lib/canon.ts`: `app/close/actions.ts` (`generatePrep`, `generateOutreach`, `coachTranscript`, `computeRoi`), `app/knowledge/actions.ts` (`askKnowledge`), `app/dojo/actions.ts` (`prospectReply`, `scoreRoleplay`).
- Deterministic-first discipline already correct: `computeRoi` runs `computeRoiMath` (pure, unit-tested in `app/close/roi-math.test.ts`) FIRST, then the LLM only frames it. No action lets the model compute a score; scoring is `@oie/core` `scoreLead` via `lib/fixtures.ts` `scoreAndRankLeads`.
- Approval queue: `app/approvals/actions.ts` `approveMessage`/`rejectMessage` are DRY_RUN stubs that `console.info` intent and contact no provider (TODO marked Phase 7). The client `components/approvals/approval-queue.tsx` flips local UI state only. There is NO event emitted to the durable runtime yet.
- UI foundation is "shadcn DNA, hand-rolled": `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react` on Tailwind v3.4.17. Hand-built primitives in `components/ui/` (`card`, `badge`, `drawer`, `tabs`, `states`, `copy-button`, bespoke `markdown`). Leads view (`components/leads/leads-view.tsx`) hand-rolls sort/filter. Analytics (`app/analytics/page.tsx`) hand-built tiles.
- Observability: `@sentry/nextjs@10.58` installed; `instrumentation.ts` inits Sentry only if `SENTRY_DSN` present (`tracesSampleRate: 0.1`), `instrumentation-client.ts` for browser. `@opentelemetry/*` present transitively. NO GenAI span at the LLM call site, NO cost-per-lead metadata.
- NOT in `package.json` / lockfile (verified): `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`, `tremor`, `recharts`, `@tanstack/react-table`, `@tanstack/react-query`, `motion`, `promptfoo`, `shadcn`, any `@opentelemetry/sdk-*` direct dep.
- Runtime invariants enforced by `AGENTS.md`: `lib/llm.ts` and `lib/data.ts` are server-only; Node runtime pinned on `app/api/auth/[...nextauth]/route.ts` and `app/api/inngest/route.ts`; `app/api/inngest/route.ts` only SERVES `inngestFunctions` from `@oie/orchestration` (durable functions are defined in that package, not here).

## Target architecture for this module (from the research)

The control plane attaches to two of the four seams and never crosses an invariant:

- Seam 2 (ONE Anthropic chokepoint): `lib/llm.ts` is the control-plane face of the raw-REST `LlmClient`. Target: WRAP it with a streaming sibling `streamAsk()` built on Vercel AI SDK v5 `streamText` + `@ai-sdk/anthropic`, reusing the same `MODEL_IDS` tiers and the same canon system prompts. The blocking `ask()` stays for non-interactive callers. We do NOT swap to `@anthropic-ai/sdk`, and no traced/costed call routes around this seam (Part 1).
- Seam 3 (ONE wire format): emit ONE OpenTelemetry GenAI span at the single `LlmClient.complete()` call site, to Sentry only for now, with `leadId`/`contactId`/`feature` metadata so cost-per-lead is visible; the backend stays swappable for Langfuse later (Part 8). The control plane's part is registering the span processor in a server-only OTel init and attaching the `feature` tag (`close-room` | `qa` | `voice-dojo`) at the call site.

Frontend direction (Part 9), pruned to ONE tool per job:

- NOW: Vercel AI SDK v5 (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) plus AI Elements (Conversation, Message, Reasoning, Sources, PromptInput, Response) for streaming Close Room, Knowledge Q&A, Voice Dojo. shadcn/ui formalised as the foundation so the AI Elements and TanStack registries install through one CLI.
- NEXT: TanStack Table v8 + TanStack Query v5 for the Leads view and Approval Queue; the Tailwind v3-to-v4 migration as its own isolated `pnpm verify`-gated PR.
- DEFERRED (Later): Tremor + Recharts (analytics has no real data, per Part 7: zero sends/replies/findings), Motion, TanStack Virtual, the read-only internal MCP server, assistant-ui.

The send-gate resume event (Parts 6 + 9): the Close Room approval is the human-in-the-loop trigger that emits `oie/send.approved` (matched on `data.actionId`). The durable `step.waitForEvent` lives in `packages/orchestration` (NOT here); `apps/web` only EMITS the event and renders the gate. `evaluateSendGate` re-runs on resume in the package, so the UI can never bypass DRY_RUN.

Data-acquisition tie-in: the system is paused at Human Gate 2, 0 of 17 keys, nothing sent; the bottleneck is trust/distribution, not the cockpit. So the cockpit's job now is to make ONE lead flow legible end to end (stream a draft, approve it, watch it stay simulated), NOT to add live-send affordances. No live-send button, no DEMO_MODE exit, no "place call" button ships from this folder.

## Invariants this module must preserve

- Deterministic scoring stays in code; the LLM never emits the number. `streamAsk()` streams prose and reasoning ONLY. Add a test that the score path never reads model text. `computeRoi`'s "math first, model frames" pattern is preserved when ported to streaming.
- DRY_RUN default true + mandatory human send-gate. The approval mutation may flip UI state and emit `oie/send.approved`, but the gate stays server-enforced in `packages/orchestration` and re-runs `evaluateSendGate` on resume. No affordance bypasses approval. Never write the literal disable-flag token (content-based guard hook rejects it, even in comments).
- Vendor shapes never leak into core. The AI SDK lives in `apps/web` ONLY; nothing in `packages/*` or NOVA is touched by streaming. TanStack tables read the `@oie/db` unified model via Server Components, never a vendor shape, never computing a score. `streamObject` validates against the same `@oie/core` Zod schemas at the boundary.
- Secrets only via env/Vercel. `ANTHROPIC_API_KEY` read lazily exactly as today; AI SDK's anthropic provider reads the same env. No key in any error message or trace attribute.
- UAE PDPL + TDRA gate any live voice. The `/voice` and `/dojo` surfaces stay read-only / practice-only; no PSTN dial affordance. `getCallSessions()` keeps its no-fixture-fallback (`[]` on empty) discipline.
- Do NOT adopt deliberately-NOT items: no Vercel AI Gateway, no assistant-ui Cloud, no agent framework, no `step.ai.infer` for any traced/costed call, no Tremor/Motion/Virtual until data exists and lists are slow, no second chat paradigm.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

The three top "Now" items in the roadmap that touch this folder are: the OTel GenAI span emitting cost-per-lead (Part 8, the `feature` tag is wired here), and the streaming Close Room (Part 9). The durable send-gate suspend itself lives in `packages/orchestration`; this folder's Now contribution to it is the approval mutation that EMITS the resume event. The streaming work is sequenced as the cheap in-repo win after the three core roadmap items, per roadmap line "if time remains."

### NOW-1. Wire the OTel GenAI `feature` tag + cost-per-lead metadata at the control-plane call site (S)

The single OTel GenAI span is emitted inside `LlmClient.complete()` in `packages/integrations` (Part 8 owns that). This folder's job: register the server-only OTel init and pass `feature`/`leadId`/`contactId` through `ask()` so the span carries cost-per-lead dimensions.

Spec:
- Extend `AskOptions` in `apps/web/lib/llm.ts` with optional trace metadata, forwarded to `LlmClient.complete()` (which Part 8 extends to accept an OTel attribute bag; until then, set the active-span attributes here using `@opentelemetry/api` `trace.getActiveSpan()`):

```ts
// apps/web/lib/llm.ts, additive, no behaviour change when metadata absent
export type LlmFeature = "close-room" | "qa" | "voice-dojo";
export interface AskOptions {
  system: string;
  user: string;
  deep?: boolean;
  maxTokens?: number;
  /** Cost-per-lead trace dimensions. Never PII; ids only. */
  trace?: { feature: LlmFeature; leadId?: string; contactId?: string };
}
```
- In `ask()`, after resolving the key, set attributes on the active span (no-op when no provider is registered):

```ts
import { trace } from "@opentelemetry/api";
// inside ask(), before client.complete:
const span = trace.getActiveSpan();
if (span && opts.trace) {
  span.setAttribute("oie.feature", opts.trace.feature);
  if (opts.trace.leadId) span.setAttribute("oie.lead_id", opts.trace.leadId);
  if (opts.trace.contactId) span.setAttribute("oie.contact_id", opts.trace.contactId);
}
```
- Add `@opentelemetry/api` to `apps/web/package.json` dependencies (it is the API-only surface, no SDK; pin to the version already resolved transitively). The NodeSDK bootstrap and span-processor registration are added in `apps/web/instrumentation.ts` by Part 8; this task only consumes the active span.
- Update the three action callers to pass `trace`: `app/close/actions.ts` (`feature: "close-room"`, `leadId`), `app/knowledge/actions.ts` (`feature: "qa"`), `app/dojo/actions.ts` (`feature: "voice-dojo"`).

Acceptance check:
- `pnpm --filter web typecheck && pnpm --filter web test` pass.
- Unit test `apps/web/lib/__tests__/llm-trace.test.ts`: with a stub `LlmClient` transport and an in-memory OTel span (or a mocked `trace.getActiveSpan`), `ask({ ..., trace: { feature: "close-room", leadId: "x" } })` sets `oie.feature` and `oie.lead_id` on the span and NEVER sets any attribute containing the api key.

### NOW-2. The streaming chokepoint: `streamAsk()` in `lib/llm.ts` (M)

Spec:
- Add dependency pair ONLY: `ai` (Vercel AI SDK v5) and `@ai-sdk/anthropic` to `apps/web/package.json`. Re-verify v5 API + `@ai-sdk/anthropic` model-id strings against current AI SDK docs before coding (CLAUDE.md provider rule).
- Add a streaming sibling to `ask()` in `apps/web/lib/llm.ts`. It REUSES the same key-read, the same `DEFAULT_MODEL`/`DEEP_MODEL` (`MODEL_IDS.personalise`/`MODEL_IDS.hard`), and the same `system`/`user` shape. It returns a UI message stream response:

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type UIMessageStreamResponse } from "ai";

export interface StreamAskOptions extends AskOptions {} // same system/user/deep/maxTokens/trace

/** Streaming sibling of ask(). Streams prose + reasoning ONLY; never a score.
 *  Server-only. The blocking ask() stays for non-interactive callers. */
export function streamAsk(opts: StreamAskOptions): UIMessageStreamResponse {
  const key = apiKey();
  if (!key) throw new Error("AI features need ANTHROPIC_API_KEY. Add it to apps/web/.env.local and restart the dev server.");
  const model = anthropic(opts.deep ? DEEP_MODEL : DEFAULT_MODEL);
  const result = streamText({
    model,
    system: opts.system,
    prompt: opts.user,
    maxOutputTokens: opts.maxTokens ?? 2000,
    onError: ({ error }) => Sentry.captureException(error, { tags: { area: "llm-stream", feature: opts.trace?.feature ?? "unknown" } }),
  });
  return result.toUIMessageStreamResponse();
}
```
- Provider key: `@ai-sdk/anthropic` reads `ANTHROPIC_API_KEY` from env by default, which matches the lazy read; if the SDK requires explicit config, pass `createAnthropic({ apiKey: key })`. Do NOT use the Vercel AI Gateway.
- Keep `streamAsk` server-only (same file, same `server-only`-by-convention rules). It is consumed by a Route Handler (NOW-3), not imported into a client component.

Acceptance check:
- `pnpm --filter web typecheck && pnpm --filter web build` pass.
- Unit test `apps/web/lib/__tests__/stream-ask.test.ts`: with a mocked `@ai-sdk/anthropic` model, `streamAsk({ system, user })` returns a `Response` whose body is a readable stream; calling with no key throws the actionable error string.
- Grep proof that vendor leakage stays contained: `grep -rl "@ai-sdk\|from \"ai\"" packages/` returns nothing.

### NOW-3. Stream the Close Room, Knowledge Q&A, and Voice Dojo with AI Elements (M)

Spec:
- Formalise shadcn/ui first: run `npx shadcn@latest init` in `apps/web` (Tailwind v3 mode; the v4 migration is NEXT, isolated). Adopt AI Elements via the shadcn registry: `npx shadcn@latest add` for `conversation`, `message`, `response`, `reasoning`, `sources`, `prompt-input`. These are copy-in MIT/Apache source under `components/ai/` (or the registry default path); they become code we own. Do not let the CLI overwrite existing `components/ui/` primitives without diffing.
- Add ONE Route Handler per streaming surface that calls `streamAsk()`:
  - `app/api/close/stream/route.ts` (`export const runtime = "nodejs"`): reads `{ leadId, tool }` from the request, rebuilds the SAME grounded system prompt the matching `app/close/actions.ts` builder produces (extract the `PREP_SYSTEM`/`OUTREACH_SYSTEM`/`COACH_SYSTEM` builders and `leadBrief` into a shared `app/close/prompts.ts` so the streaming route and the blocking action share one source of truth), then `return streamAsk({ system, user, deep, trace: { feature: "close-room", leadId } })`.
  - `app/api/knowledge/stream/route.ts`: same pattern over `KNOWLEDGE_SYSTEM` + `grounding(ALL_CANON)`, `trace.feature: "qa"`.
  - `app/api/dojo/stream/route.ts`: same over `PROSPECT_SYSTEM`/`SCORE_SYSTEM`, `trace.feature: "voice-dojo"`. Keep `sanitizeHistory`/`transcript` validation at the boundary before streaming.
- Convert the client workspaces to stream via `@ai-sdk/react` `useChat` pointed at those routes, rendering tokens through AI Elements `Conversation`/`Message`/`Response`, model reasoning through `Reasoning`, and cited canon blocks through `Sources` (pass the `grounding` keys used as the source list). Keep the bespoke markdown renderer only where a non-chat structured artifact still needs it (ROI one-pager); prefer AI Elements `Response` for streamed prose.
- ROI stays deterministic-first: `computeRoiMath` runs in the route BEFORE streaming, the header (`Recovered pipeline: AED ...`) is rendered from the math, and only the narrative streams. The model never receives a number it can recompute the score from.
- The blocking `ask()` actions stay in place as the no-JS fallback and for any caller that needs a single string (eval traffic, tests).

Acceptance check:
- `pnpm --filter web dev`, open `/close`, `/knowledge`, `/dojo`: with `ANTHROPIC_API_KEY` set, Claude's reasoning streams token-by-token; with the key unset, each surface shows the actionable "needs ANTHROPIC_API_KEY" error (not a 500).
- `pnpm --filter web build && pnpm --filter web lint` pass (lint `--max-warnings 0`).
- Score-isolation test `apps/web/components/__tests__/no-score-from-model.test.ts`: assert the streaming surfaces never call `scoreLead`/`scoreAndRankLeads` with model output, and the rendered score in the Close/Leads UI comes only from `lead.score` (the `@oie/core` deterministic value), never from streamed text.

### NOW-4. Approval mutation emits the `oie/send.approved` resume event (S)

This is `apps/web`'s contribution to the bet-#1 durable send-gate. The `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })` suspend is added in `packages/orchestration/src/sequencing/inngest.ts` (Part 6, not this folder). Here we make the Close Room / Approval Queue approval EMIT that event.

Spec:
- In `app/approvals/actions.ts`, keep the function pure of any provider call, and ADD the durable-event emit (still no send, still DRY_RUN-safe):

```ts
import { inngest } from "@oie/orchestration"; // already the registered client
export async function approveMessage(actionId: string): Promise<ActionResult> {
  if (!actionId || typeof actionId !== "string") return { ok: false, error: "Invalid action ID." };
  // Persist approval state (Prisma), Part 6/Phase 7 wires the DB write.
  await inngest.send({ name: "oie/send.approved", data: { actionId } });
  return { ok: true, message: `Action ${actionId} approved. The send-gate re-evaluates on resume; DRY_RUN stays authoritative.` };
}
```
- The `match` key is `data.actionId`; the emitted `data.actionId` MUST equal the suspended run's `actionId`. Document that contract in `app/approvals/actions.ts` and mirror the name in the orchestration package.
- The UI copy in `components/approvals/approval-queue.tsx` already says "Approval records your intent; the dry-run gate stays active until explicitly disabled." Keep that; add that approval now ALSO resumes a suspended run which re-checks the gate. No new send affordance.

Acceptance check:
- `pnpm --filter web typecheck` passes.
- Unit test `apps/web/app/approvals/actions.test.ts`: with a mocked `inngest.send`, `approveMessage("a1")` calls `inngest.send` exactly once with `{ name: "oie/send.approved", data: { actionId: "a1" } }`, and `approveMessage("")` returns `{ ok: false }` without sending.
- The cross-package invariant (suspend + resume + DRY_RUN-on still returns "simulate") is proven by Part 6's regression test in `packages/orchestration`.

### NOW-5. Correct the stale deploy URL in `AGENTS.md` (S)

Spec: edit `apps/web/AGENTS.md` line 11 from the `huscribe-revenue-os.fly.dev` claim to the Vercel URL (`https://web-five-kappa-67.vercel.app`, per TARGET-ARCHITECTURE) and the deploy-config row to "`vercel.json` (deployed unit); repo-root `fly.toml` is STALE, not the origin." Keeps agent guidance honest against topology.

Acceptance check: `grep -n "fly.dev" apps/web/AGENTS.md` returns nothing; `grep -n "vercel" apps/web/AGENTS.md` matches the corrected line.

## Next (1 to 3 months)

- TanStack Table v8 + TanStack Query v5 for `/leads` and `/approvals`: replace the hand-rolled sort/filter in `components/leads/leads-view.tsx` with a TanStack table reading `@oie/db` via Server Components; the Approval Queue uses a TanStack Query mutation that calls `approveMessage` (which emits `oie/send.approved`). Dense, sortable, instantly responsive grids. Install via the shadcn TanStack registry. (M)
- Tailwind v3-to-v4 migration as its OWN isolated `pnpm verify`-gated PR, not bundled with streaming. This is the one upgrade with real blast radius. (M)
- Feature flags behind a tiny `apps/web/lib/flags.ts` (PostHog or self-hosted Flagsmith): gate REACHABILITY of live-send and NOVA DEMO_MODE-exit and model-tier rollouts. NEVER flip DRY_RUN or compute a score. (S)
- Upstash `@upstash/ratelimit` behind a thin internal `RateLimiter` helper (INFRA, not a vendor adapter) wired into `apps/web/middleware.ts` and around `lib/llm.ts`: fail-OPEN for read paths, fail-CLOSED for the send-gate path; PII never enters Upstash; pin EU/Frankfurt for PDPL. (S)
- Vercel WAF / firewall rules (Vercel-native, NOT a Cloudflare-IP allow-list) protecting `/signin`, `/api/inngest`, `/api/health`, future NOVA webhooks; stage in log/observe mode first. (S)
- The streaming `streamObject` path for typed Close artifacts (objection maps, findings) validated against `@oie/core` Zod schemas at the boundary, with AI Elements `Sources` citing the exact canon passage. (M)

## Later (post-PMF, gated)

- Self-hosted Langfuse as a SECOND OTel span processor registered alongside Sentry in `apps/web/instrumentation.ts` (same spans fan out to both); gated on a Fly/Railway host existing and live traffic to evaluate. Confirm MIT-vs-EE for the specific judge feature at adoption (MIT core; some managed evaluators / RBAC / SSO are EE-licensed). (Part 8)
- Tremor + Recharts analytics dashboards on `/analytics`, ONLY once there are N weeks of real send-and-reply data worth a cohort question (Part 7: today zero sends/replies/findings). Read-only, downstream, never on the OLTP/scoring/send path. (Part 9 deferred)
- Motion micro-interactions and TanStack Virtual: only when a real list is slow. (Part 9 deferred)
- The read-only internal MCP server (`@modelcontextprotocol/sdk`): operator convenience only, read-only, build-time; never flips DRY_RUN, sends, or mutates the approval queue (ADR-0002). (Part 1 Later)
- Knowledge Q&A RAG citations (KnowledgeStore/Embedder/Reranker ports + Neon pgvector) only when the canon corpus outgrows the cached whole-canon block; the UI's `Sources` component is already the citation surface that will render exact-passage + freshness stamps. (Part 3 Later)
- Better Auth / WorkOS AuthKit on a second-seat / SSO / SCIM customer trigger; keep Auth.js v5 JWT single-operator until then. (Part 10 Later)

## Contracts / interfaces touched (exact names)

- `apps/web/lib/llm.ts`: existing `ask(opts: AskOptions): Promise<string>`, `MODEL_IDS` re-use; NEW `streamAsk(opts: StreamAskOptions): UIMessageStreamResponse`, NEW `LlmFeature` type, extended `AskOptions.trace`.
- `apps/web/app/close/actions.ts`: existing `generatePrep`, `generateOutreach`, `coachTranscript`, `computeRoi` returning `CloseResult`; NEW shared `app/close/prompts.ts` exporting the `PREP_SYSTEM`/`OUTREACH_SYSTEM`/`COACH_SYSTEM`/`ROI_SYSTEM` builders + `leadBrief` (one source of truth for streaming routes and blocking actions).
- `apps/web/app/knowledge/actions.ts`: `askKnowledge`, `KNOWLEDGE_SYSTEM`, `ALL_CANON`.
- `apps/web/app/dojo/actions.ts`: `prospectReply`, `scoreRoleplay`, `PROSPECT_SYSTEM`, `SCORE_SYSTEM`; `sanitizeHistory`, `transcript` (boundary validation).
- `apps/web/app/approvals/actions.ts`: `approveMessage`, `rejectMessage` returning `ActionResult`; NEW `inngest.send` of event `oie/send.approved` with `data.actionId`.
- NEW Route Handlers: `app/api/close/stream/route.ts`, `app/api/knowledge/stream/route.ts`, `app/api/dojo/stream/route.ts` (all `runtime = "nodejs"`).
- `apps/web/lib/canon.ts`: `grounding(keys[])` + the named blocks `FRAMEWORKS`, `OBJECTIONS`, `VOSS`, `PERSONALIZATION`, `DUBAI_PLAYBOOK`, `DISCOVERY`, `CLOSING`, `HUSCRIBE_FACTS` (unchanged; consumed by streaming routes).
- `apps/web/instrumentation.ts`: `register()` (Part 8 adds NodeSDK + OTel GenAI span processor; this folder consumes the active span via `@opentelemetry/api` `trace.getActiveSpan()`).
- Event contract (cross-package): `oie/send.approved` matched on `data.actionId` against `step.waitForEvent('await-approval', ...)` in `packages/orchestration/src/sequencing/inngest.ts`. Sits alongside existing `oie/sequence.enrol` / `oie/sequence.stop`.
- Consumed from workspace (unchanged signatures): `@oie/integrations` `LlmClient`, `MODEL_IDS`; `@oie/orchestration` `inngest`, `inngestFunctions`; `@oie/core` `scoreLead`, `rankByComposite`, `icpProfile`, `Tier`; `@oie/db` `prisma`.

## Verification (how each task is proven done)

- NOW-1: `pnpm --filter web typecheck && pnpm --filter web test`; new `llm-trace.test.ts` asserts span attributes set, key never set as an attribute.
- NOW-2: `pnpm --filter web typecheck && pnpm --filter web build`; `stream-ask.test.ts` returns a streaming `Response`, throws on missing key; `grep -rl "@ai-sdk\|from \"ai\"" packages/` is empty (no vendor leak past `apps/web`).
- NOW-3: `pnpm --filter web build && pnpm --filter web lint`; manual `pnpm --filter web dev` confirms token-by-token streaming on `/close`, `/knowledge`, `/dojo` with key set and clean error without; `no-score-from-model.test.ts` proves the score path never reads streamed text.
- NOW-4: `pnpm --filter web typecheck`; `app/approvals/actions.test.ts` asserts exactly one `inngest.send` with `{ name: "oie/send.approved", data: { actionId } }`, and no send on invalid input. Cross-package suspend/resume/DRY_RUN-on-still-simulate regression is Part 6's test.
- NOW-5: `grep -n "fly.dev" apps/web/AGENTS.md` empty.
- Whole-folder gate before claiming done: `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`, then `pnpm verify` for the monorepo. The `apps/web` typecheck excludes `.next`; `noUncheckedIndexedAccess` is on (guard array indexing).

## Risks and do-not

- Do NOT route any traced/costed Claude call around `lib/llm.ts`. `streamAsk()` and `ask()` are the only two control-plane faces; both keep the OTel span and (via Part 8) the `CostRecord`. Do not use `step.ai.infer` for these (it bypasses `LlmClient.complete()`, splitting the chokepoint).
- Do NOT let the AI SDK leak into `packages/*` or NOVA. It is an `apps/web`-only dependency. Verify with the grep above.
- Do NOT add a live-send button, a DEMO_MODE-exit toggle, or a "place call" button. The approval mutation emits an event; the gate stays in `packages/orchestration` and re-runs `evaluateSendGate` on resume. DRY_RUN stays true. Never write the literal disable-flag token (the content-based guard hook rejects it, even in comments and docs).
- Do NOT let the LLM compute or rank a score. Streaming surfaces render `lead.score` from `@oie/core` only; the `no-score-from-model` test guards this.
- Do NOT bundle the Tailwind v3-to-v4 migration into the streaming PR. It has real blast radius and is a separate `pnpm verify`-gated PR (Next).
- Do NOT adopt the Vercel AI Gateway, assistant-ui Cloud, a second chat paradigm, Tremor/Motion/Virtual (no data yet, nothing slow yet), an agent framework, or the MCP server now. Cap: 3 net-new vendors/quarter; the AI SDK pair (`ai` + `@ai-sdk/anthropic`) is the streaming vendor for this quarter from this folder.
- Re-verify the AI SDK v5 API surface, `@ai-sdk/anthropic` model-id strings, and `toUIMessageStreamResponse()` shape against current docs before coding (CLAUDE.md: never assume a provider API from memory). Pin OTel semconv to avoid `gen_ai.*` deprecation churn.
- PDPL/TDRA: keep `/voice` and `/dojo` read-only/practice; no PSTN affordance ships here. Trace attributes carry ids only, never PII, never transcript text, never the api key.
