# apps/web/app Plan

> Per-route and per-server-action upgrade plan for the Next.js App Router control plane: stream the AI surfaces, put a real analytics route on the data spine, make the approvals route fire the durable send-gate event, and keep the score path provably free of model text. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

Routes under `apps/web/app/` (verified by `find`):
- Pages (server components, all `export const dynamic = "force-dynamic"`): `/` (`page.tsx`), `/leads`, `/icp`, `/signals`, `/approvals`, `/voice`, `/close`, `/analytics`, `/knowledge`, `/dojo`, `/signin`.
- API route handlers: `api/auth/[...nextauth]/route.ts` (Node runtime), `api/inngest/route.ts` (Node runtime, serves `inngestFunctions` from `@oie/orchestration`), `api/health/route.ts` (public liveness, no DB).
- Server-action files (`"use server"`): `close/actions.ts` (`generatePrep`, `generateOutreach`, `coachTranscript`, `computeRoi`), `knowledge/actions.ts` (`askKnowledge`), `dojo/actions.ts` (`prospectReply`, `scoreRoleplay`), `approvals/actions.ts` (`approveMessage`, `rejectMessage`).
- Pure, unit-tested co-located helpers: `close/roi-math.ts` (+ `.test.ts`), `dojo/sanitize.ts` (+ `.test.ts`), `dojo/scenarios.ts` (+ `.test.ts`).

How AI flows today: every AI action calls the blocking `ask({ system, user, deep?, maxTokens? })` in `apps/web/lib/llm.ts`, which constructs a `LlmClient` (raw-REST Anthropic, from `@oie/integrations`) and `await`s the whole completion. There is NO streaming anywhere: the Close Room, Knowledge Q&A, and Voice Dojo all block until the full text returns. `lib/llm.ts` already wraps Sentry `captureException`/`captureMessage` around the call but emits no OTel span. Models come from `MODEL_IDS` (`personalise` = sonnet default, `hard` = opus when `deep:true`); ids are never hardcoded.

How the score is computed today: `lib/data.ts` builds a `ScoringSubject` and calls `scoreLead(subject, icp, NOW)` from `@oie/core` in pure code. The number is computed in the data layer and passed to pages as props (`lead.score`). No server action reads model text into a score. The Close Room actions read `lead.score` only to print a human-readable line (`scoreLine`); they never recompute or let the model rank.

The approvals route today: `approvals/actions.ts` is an explicit DRY_RUN stub. `approveMessage`/`rejectMessage` validate the id, `console.info` a `[STUB]` line, and return `{ ok, message }`. They DO NOT touch Prisma and DO NOT emit any Inngest event. The TODOs say "Phase 7: persist approval state to DB via prisma and enqueue the Inngest send step." The client (`components/approvals/approval-queue.tsx`) flips local UI state only.

The analytics route today: `analytics/page.tsx` is a server component that calls `getAnalytics()` + `getLeads()` from `lib/data.ts` and renders hand-built KPI tiles and bar/meter divs. `getAnalytics()` already reads the real data spine (Prisma: `score.findMany`, `signal.count`, `message.count` for `awaiting_approval`, `providerCost.aggregate` for `costUsd`) with a fixture fallback via `tryDb()`. There is NO machine-readable analytics endpoint, no provenance/freshness surface, and `estimatedCostUsd` falls back to a hardcoded `4.32`.

The durable runtime today: `packages/orchestration/src/sequencing/inngest.ts` defines `runEnrolment` triggered by `oie/sequence.enrol`. It loops steps with `step.run` + `step.sleepUntil`, runs `executeSendStep` (which calls `evaluateSendGate`) inside `send-step-${i}`, and writes `Message` + `AuditLog`. There is NO `step.waitForEvent` and NO `oie/send.approved` event anywhere in the repo (verified by grep: zero hits for `send.approved`, `waitForEvent`, `oie/send`). Approval is passed as a static `approval: ApprovalState` field in the enrol payload, not awaited.

Dependency reality (verified against `apps/web/package.json` and `pnpm-lock.yaml`): `inngest`, `@sentry/nextjs`, `zod`, `react@19`, `next@15` present. `@ai-sdk/anthropic`, `ai`, `promptfoo`, `@tanstack/react-table`, `@tanstack/react-query` are NOT present. `@opentelemetry/*` is present transitively.

Deploy reality: the deployed unit is `apps/web` on Vercel (per TARGET-ARCHITECTURE). The `apps/web/AGENTS.md` "LIVE ... fly.dev" line and the root `fly.toml` are STALE; treat Vercel as the origin. Secrets are Vercel project env vars synced via `scripts/sync-keys-to-vercel.sh`; `lib/llm.ts` reads `process.env.ANTHROPIC_API_KEY` lazily.

## Target architecture for this module (from the research)

This folder is the human-in-the-loop control plane and one of the four seams' surface: it is where the Anthropic chokepoint (`lib/llm.ts` -> `LlmClient`) is exposed to the operator, and where the durable brain's send-gate is approved. The research assigns this folder four concrete jobs:

1. Streaming AI surfaces (Part 1, Part 9). Wrap (do not replace) `lib/llm.ts` with a `streamAsk()` built on Vercel AI SDK v5 `streamText` + `@ai-sdk/anthropic`, reusing the same `MODEL_IDS` tiers and canon system prompts, returning `toUIMessageStreamResponse()` from new streaming route handlers (`app/api/.../route.ts`). The blocking `ask()` stays for non-interactive callers. AI Elements render reasoning/sources. The LLM streams prose and reasoning ONLY: never the number.

2. A real analytics route on the data spine (Part 7). The "one Part-7 item worth doing early" is data-contract assertions as plain Prisma/SQL CI tests, plus surfacing provenance/freshness in the analytics route. The analytics route stays read-only and downstream, never on the OLTP scoring or send path. No dbt, no DuckDB, no ClickHouse, no Metabase now (zero sends, zero replies, nothing to model). The route reads the existing spine (`getAnalytics()` and a new provenance reader) and adds a machine-readable `GET /api/analytics`.

3. The approvals route firing the durable send-gate event (Part 6, Top bet #1). `approveMessage` becomes the trigger that emits `oie/send.approved` (matched on `data.actionId`) to resume an Inngest run suspended at a new `step.waitForEvent('await-approval', ...)` placed immediately before `executeSendStep`. `evaluateSendGate` STILL re-runs on resume as the final non-memoised code gate, so DRY_RUN can never be replayed away. The server action emits the event; it never sends and never flips DRY_RUN.

4. The score path never reads model text (the invariant, made a test). Every AI route returns prose; the score is computed in `@oie/core` in `lib/data.ts` and only ever read, never derived from a completion. A regression test asserts this.

Per the phasing rules: the durable send-gate (job 3 wiring + the orchestration-side suspend) is Now bet #1. promptfoo and the OTel span are the other two Now items but land mostly outside this folder (they touch `lib/llm.ts` and the eval harness); this plan wires only the apps/web/app touchpoints. Streaming and the analytics route are the next-cheapest in-folder wins. The Tailwind v4 migration and TanStack grids are Next, sequenced as their own gated PRs and NOT bundled into streaming.

DATA-ACQUISITION grounding: nothing here triggers a live send. The system is pre-PMF, paused at Human Gate 2, 0 of 17 keys, DEMO_MODE on, nothing ever sent. So these routes make the gate more provably controlled and the cockpit more legible; they do not move toward outreach. Voice stays DEMO_MODE; no "place call" button is added.

## Invariants this module must preserve

- Deterministic scoring stays in code; the LLM never emits the number. Every streaming route streams prose/reasoning only. The score is `scoreLead(...)` in `lib/data.ts`, read as a prop. A test enforces it (Now task 5).
- DRY_RUN default true + a mandatory human send-gate. The approvals route emits an approval EVENT; it does not send, does not flip DRY_RUN, and does not write the disable-flag token (a content-based guard hook rejects that literal even in comments). `evaluateSendGate` re-runs on resume. (Per CLAUDE.md and `apps/web/AGENTS.md`.)
- Vendor shapes never leak into core. The AI SDK and AI Elements live in `apps/web` ONLY; `packages/*` and NOVA are untouched. Streaming route handlers consume `@oie/db` unified shapes via `lib/data.ts`, never a raw Prisma row or a vendor shape. The analytics route returns the existing UI-safe types.
- Secrets only via env/Vercel. `streamAsk()` reads `ANTHROPIC_API_KEY` lazily exactly as `ask()` does, never logs it, never includes it in an error. New env keys (if any) are added to `.env.example`.
- UAE PDPL + TDRA gate any live voice. Voice/dojo surfaces stay DEMO_MODE and dry-run; no dialing affordance is added in this folder. (Per `apps/web/AGENTS.md` gotchas.)
- Server-only boundary. `lib/data.ts`, `lib/llm.ts`, and any new `lib/llm-stream.ts` stay server-only and are never imported into a `"use client"` module. Streaming route handlers run server-side; clients consume them via `fetch`/AI SDK hooks.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

### Now-1. Wire the approvals route to emit the durable send-gate event (Top bet #1, apps/web side)

This is the apps/web half of Part 6's `waitForEvent` suspend. The orchestration half (the `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })` before `executeSendStep` in `sequencing/inngest.ts`, plus its regression test) is specified in the orchestration plan; this task wires the route that fires the event and does it without ever sending.

Spec, in `apps/web/app/approvals/actions.ts` (replace the stub bodies, keep the `ActionResult` contract and the never-send discipline):

```ts
"use server";

import { inngest } from "@oie/orchestration"; // already re-exported from the package root
import { prisma } from "@oie/db";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Approve a queued message. This records operator intent and EMITS the durable
 * send-gate event that resumes a suspended Inngest run. It does NOT send, does
 * NOT flip the dry-run flag, and does NOT compute anything. The run resumes at a
 * step that re-runs evaluateSendGate, which still returns "simulate" while
 * DRY_RUN is on. actionId is the stable per-action key the orchestration
 * waitForEvent matches on (match: 'data.actionId').
 */
export async function approveMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }
  try {
    // Persist intent (append-only AuditLog; status mark on the Message row).
    await prisma.message.update({
      where: { id: messageId },
      data: { status: "approved" },
    });
    await prisma.auditLog.create({
      data: {
        actor: "operator",
        action: "message.approved",
        entity: "Message",
        entityId: messageId,
        payload: { via: "approvals-route" },
      },
    });
    // Emit the resume event. The suspended run matches on data.actionId.
    await inngest.send({ name: "oie/send.approved", data: { actionId: messageId } });
    return {
      ok: true,
      message:
        `Message ${messageId} approved and the run was resumed. No send was performed: ` +
        `the dry-run gate re-evaluates on resume and returns simulate.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approve failed." };
  }
}

export async function rejectMessage(messageId: string): Promise<ActionResult> {
  if (!messageId || typeof messageId !== "string") {
    return { ok: false, error: "Invalid message ID." };
  }
  try {
    await prisma.message.update({ where: { id: messageId }, data: { status: "rejected" } });
    await prisma.auditLog.create({
      data: {
        actor: "operator",
        action: "message.rejected",
        entity: "Message",
        entityId: messageId,
        payload: { via: "approvals-route" },
      },
    });
    // No event emitted: a rejected action's run will time out at the suspend, or
    // (Next) we add a paired oie/send.rejected the function cancelsOn.
    return { ok: true, message: `Message ${messageId} rejected and will not be sent.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Reject failed." };
  }
}
```

Notes that preserve invariants:
- The event name `oie/send.approved` and the match key `data.actionId` MUST match the orchestration-side `waitForEvent` exactly. `actionId` is the `Message.id` here (the per-action key), consistent with the existing `idempotencyKey` shape `enrolment:...:step:N:channel:...` only if orchestration chooses to use that key instead; agree the key once in the orchestration plan and use the SAME string here.
- This action never imports `lib/llm.ts` and never calls a provider adapter. It emits an event and writes an `AuditLog` row. The actual send still cannot happen: on resume `evaluateSendGate` returns `simulate` under DRY_RUN.
- Keep the `approval-queue.tsx` copy honest: it already says "Records intent only. Nothing sends while the dry-run gate is active." Update it to "Records intent and resumes the run. Nothing sends while the dry-run gate is active." (one string change in `components/approvals/approval-queue.tsx`).
- DB-unavailable safety: wrap reads in the same defensive style as `lib/data.ts` if you want local dev to stay green, but the WRITE path here legitimately requires a DB; surface the error as `{ ok:false }` rather than faking success.

Acceptance check:
- `pnpm --filter web typecheck` passes (the `inngest.send` call typechecks against the re-exported client).
- With Inngest dev + Neon up: enrol a contact (orchestration test harness) so a run suspends at `await-approval`; click Approve in `/approvals`; confirm in the Inngest dev dashboard the run RESUMES and the resumed `send-step` `AuditLog` row shows `gateOutcome: "simulate"` (DRY_RUN on). The cross-file regression test ("suspend, approve, resume, still simulate") lives in the orchestration package per its plan; here, assert the route emits exactly one `oie/send.approved` with `data.actionId === messageId` (unit test with a mocked `inngest.send`).
- Grep proof: `grep -rn "oie/send.approved" apps/web packages/orchestration` shows the producer (here) and the consumer (orchestration) using the identical string.

Effort: S (one file rewrite + one client copy string + one unit test; the durable suspend itself is the orchestration plan's S task).

### Now-2. A real analytics route on the data spine (machine-readable + provenance/freshness)

Add a downstream, read-only analytics surface that proves the provenance/freshness data-contract story without any new infra. Two pieces: a JSON route handler and a provenance reader.

Spec A, new reader in `apps/web/lib/data.ts` (sits beside `getAnalytics`, uses the same `tryDb` discipline, returns a UI-safe type):

```ts
/** Read-only provenance + freshness rollup for the analytics route. Aggregate
 *  only; never per-PII. Reads the OLTP spine read-only; never on the send path. */
export type ProvenanceRollup = {
  companiesTotal: number;
  companiesWithSources: number;      // Company.sources is a non-empty JSON object
  signalsTotal: number;
  signalsFresh: number;              // expiresAt is null OR expiresAt > now
  signalsStale: number;
  oldestActiveSignalDays: number | null;
  providerCostUsd: number;           // sum(ProviderCost.costUsd), the billing source of truth
};

export async function getProvenanceRollup(): Promise<ProvenanceRollup> { /* tryDb(...) */ }
```

Implementation rules: aggregate with Prisma (`company.count`, `signal.count` with `expiresAt` filters, `providerCost.aggregate`); compute `companiesWithSources` by counting companies whose `sources` JSON is non-empty. De-identified and aggregate only (PDPL egress control per Part 7). Fall back to fixtures/zeros on DB error via `tryDb`.

Spec B, new route handler `apps/web/app/api/analytics/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAnalytics } from "@/lib/data";
import { getProvenanceRollup } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator-only JSON analytics over the data spine. Read-only, aggregate,
 *  never on the OLTP scoring or send path. NOT in the public auth allowlist. */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [tiles, provenance] = await Promise.all([getAnalytics(), getProvenanceRollup()]);
  return NextResponse.json({ tiles, provenance, generatedAt: new Date().toISOString() });
}
```

Spec C: extend `analytics/page.tsx` to render a small "Data provenance" card from `getProvenanceRollup()` (companies-with-sources ratio, fresh vs stale signals, real `providerCostUsd`). Replace the hardcoded `4.32` fallback in `getAnalytics()` so the cost tile reads the real `ProviderCost` sum (keep a `0` fallback, not a fake number).

Auth note: `api/analytics` must NOT be added to the `auth.config.ts` `authorized()` allowlist (only `/signin`, `/api/auth`, `/api/inngest` stay public). The `auth()` check inside the handler is belt-and-suspenders.

Acceptance check:
- `curl -s -H "Cookie: <operator-session>" http://localhost:3000/api/analytics | jq` returns `{ tiles, provenance, generatedAt }`; unauthenticated `curl` returns 401.
- `/analytics` renders the provenance card; with an empty DB it shows zeros (fixture fallback), not a crash.
- `pnpm --filter web typecheck && pnpm --filter web build` pass.
- The data-contract CI test (Now-4) asserts the provenance invariant the route surfaces.

Effort: M (one reader + one route + one card + the cost-fallback fix).

### Now-3. Stream the Close Room, Knowledge Q&A, and Voice Dojo (prose only, never the number)

Wrap `lib/llm.ts` with a streaming sibling and add streaming route handlers. The blocking `ask()` stays for ROI (which prints a deterministic header first) and any non-interactive caller.

Spec A, new `apps/web/lib/llm-stream.ts` (server-only, mirrors `ask()`'s key-read and model tiering, built on the AI SDK):

```ts
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { MODEL_IDS } from "@oie/integrations";

export interface StreamAskOptions {
  system: string;       // instruction template + injected grounding canon
  user: string;         // the prospect details / question / transcript
  deep?: boolean;       // route to the hard (opus) tier
  maxTokens?: number;
}

/** Stream a grounded completion as a UI message stream. Reasoning + prose ONLY;
 *  the deterministic score is NEVER produced here. Reads ANTHROPIC_API_KEY lazily. */
export function streamAsk(opts: StreamAskOptions) {
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!key) throw new Error("AI features need ANTHROPIC_API_KEY.");
  const model = anthropic(opts.deep ? MODEL_IDS.hard : MODEL_IDS.personalise);
  return streamText({
    model,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    maxOutputTokens: opts.maxTokens ?? 2000,
  });
}
```

Dependency note: add ONLY `@ai-sdk/anthropic` and `ai` to `apps/web/package.json` (net-new pair per Part 1). The AI SDK reads `ANTHROPIC_API_KEY` from env; pass it explicitly via the provider factory if needed so the lazy-read discipline holds. Verify the current AI SDK v5 provider option name for the key at adoption time (the SDK auto-reads `ANTHROPIC_API_KEY`; do not hardcode).

Spec B, streaming route handlers (one per interactive surface), each reusing the EXACT canon grounding and system-prompt builders that already live in the action files (export the `*_SYSTEM` builders from the action files, or move them to a shared `app/<surface>/prompts.ts` and import in both):
- `apps/web/app/api/close/prep/route.ts`, `.../close/outreach/route.ts`, `.../close/coach/route.ts` -> reuse `PREP_SYSTEM`/`OUTREACH_SYSTEM`/`COACH_SYSTEM` + `leadBrief` + `grounding([...])`, then `return streamAsk({...}).toUIMessageStreamResponse();`
- `apps/web/app/api/knowledge/route.ts` -> reuse `KNOWLEDGE_SYSTEM(grounding(ALL_CANON))`.
- `apps/web/app/api/dojo/reply/route.ts` -> reuse `PROSPECT_SYSTEM`. (Keep `scoreRoleplay` BLOCKING via `ask({deep:true})`: the dojo scorecard is structured JSON the bespoke renderer parses; streaming it adds no value and the existing `deep` path stays. The dojo "score" is qualitative coaching, NOT the deterministic ICP score.)

Each handler: `export const runtime = "nodejs"`, `auth()`-guard at the top (these are operator surfaces, not in the public allowlist), Zod-validate the request body at the boundary (reuse `@oie/core` schemas where they exist; for free-text reuse the existing length guards from `askKnowledge`), load the lead via `findLead`/`getLeads` from `lib/data.ts`, build the canon-grounded system prompt, return `streamAsk(...).toUIMessageStreamResponse()`.

Spec C, clients: convert the interactive panels in `components/close/close-workspace.tsx`, the Knowledge view, and the Dojo view from `startTransition(async () => await action(...))` to the AI SDK `useChat`/`useCompletion` hook pointed at the new route, rendering tokens as they arrive. Keep the bespoke markdown renderer for the final text; AI Elements (Reasoning, Sources, Conversation) are optional copy-in for the reasoning/citation chrome and can land incrementally. Do NOT remove the blocking actions until the streaming clients are proven; keep ROI on the blocking path (it prints `computeRoiMath` header first, then frames).

Invariant guards in this task:
- The streamed output is prose/reasoning ONLY. No route returns or accepts a score. `leadBrief` already only PRINTS `lead.score` (computed in `@oie/core`); it never asks the model to produce it. Keep it that way.
- `streamAsk` and `lib/llm-stream.ts` are server-only (`import "server-only"`), never imported into a `"use client"` module.
- Keep the `<CONFIRM>` / "never invent Huscribe specifics" discipline: the system prompts are reused verbatim, so the discipline carries over unchanged.

Acceptance check:
- `pnpm --filter web build` succeeds with the new dep pair; `grep -rn "@ai-sdk\|from \"ai\"" apps/web` shows the SDK only under `apps/web` (never in `packages/*`).
- Manual: `/close` Prep streams tokens into the result pane; `/knowledge` streams; `/dojo` prospect replies stream; the dojo scorecard still renders (blocking). With no key, the surface shows a clean "needs ANTHROPIC_API_KEY" error (same as today).
- The score-path test (Now-4/5) passes: no streaming route reads model text into a number.

Effort: M (the streaming wrap, three to four route handlers, and incremental client conversion).

### Now-4. Plain Prisma/SQL data-contract CI test for the analytics spine (no new tool)

The "one Part-7 item worth doing early," expressed as a Vitest test (no dbt, no DuckDB). Co-locate near the data layer so the analytics route's provenance claims are enforced.

Spec, new `apps/web/lib/__tests__/data-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { prisma } from "@oie/db";

describe("data contracts (provenance + freshness)", () => {
  it("every Company has a non-empty sources provenance object", async () => {
    const companies = await prisma.company.findMany({ select: { id: true, sources: true } });
    const missing = companies.filter(
      (c) => !c.sources || (typeof c.sources === "object" && Object.keys(c.sources as object).length === 0),
    );
    expect(missing, `companies without provenance: ${missing.map((c) => c.id).join(", ")}`).toHaveLength(0);
  });

  it("every Signal carries detectedAt and a coherent expiresAt", async () => {
    const signals = await prisma.signal.findMany({ select: { id: true, detectedAt: true, expiresAt: true } });
    const bad = signals.filter((s) => !s.detectedAt || (s.expiresAt && s.expiresAt < s.detectedAt));
    expect(bad, `signals with bad freshness: ${bad.map((s) => s.id).join(", ")}`).toHaveLength(0);
  });
});
```

Guard so CI without a DB stays green: skip when `process.env.DATABASE_URL` is unset (`describe.skipIf(!process.env.DATABASE_URL)`), matching the fixture-fallback posture of the rest of the app. When a seeded DB is present (CI job with Neon branch), it runs for real.

Acceptance check:
- `pnpm --filter web test` runs the test; against a seeded DB it asserts provenance/freshness; with no `DATABASE_URL` it skips (does not fail the suite).
- A deliberately provenance-less seeded Company makes the test RED, proving it bites.

Effort: S.

### Now-5. The "score path never reads model text" regression test

Make the central invariant a test in this folder, since the streaming routes are the new risk surface.

Spec, new `apps/web/app/__tests__/score-path.test.ts`:
- Static assertion: grep the AI route handlers and action files and assert NONE of them assign a model completion into a field named `score`/`composite`/`fit`/`intent`/`tier`, and that the only producer of those is `@oie/core` `scoreLead` (called in `lib/data.ts`). Implement as a source-scan test (read the files, regex for `score\s*[:=].*(ask|streamAsk|completion|text)` and assert no match), plus a positive assertion that `lib/data.ts` imports `scoreLead` from `@oie/core`.
- Behavioural assertion: a unit test that mocks `ask`/`streamAsk` to return arbitrary text containing fake numbers ("composite 99, tier A") and asserts that a rendered Close result's `lead.score` is unchanged (still the `@oie/core` value), proving the model text never feeds the number.

Acceptance check:
- `pnpm --filter web test` passes; introducing a line that sets `lead.score` from `ask(...)` turns it RED.

Effort: S.

## Next (1 to 3 months)

- AI Elements full adoption + shadcn formalisation: replace the bespoke markdown chrome incrementally with AI Elements (Reasoning, Tool, Sources, Conversation, PromptInput) on the streaming routes; formalise shadcn via its CLI so the AI Elements / TanStack registries are reachable. Keep the bespoke renderer as fallback until parity. (Part 9, Now-adjacent but sequenced after streaming lands.)
- Tailwind v3 -> v4 migration as its own isolated, `pnpm verify`-gated PR (real blast radius; NOT bundled into streaming). (Part 9.)
- TanStack Table v8 + TanStack Query v5 for `/leads` and `/approvals`: server components read `@oie/db` unified shapes via `lib/data.ts`; the table never computes a score and never sees a vendor shape. The approval-queue mutation uses TanStack Query and emits `oie/send.approved` (the Now-1 action), gate still server-enforced. (Part 9.)
- Declarative channel limits visible in the approvals route: surface the throttle/concurrency caps (mailbox/channel, quiet hours) from the orchestration `throttle`/`concurrency` config as read-only UI on `/approvals` so the operator sees why an action is held. (Part 6 Next; orchestration owns the enforcement.)
- Paired `oie/send.rejected` event + `cancelOn`: extend `rejectMessage` to emit a reject event the suspended function cancels on, so a rejected action's run ends promptly instead of waiting for the 7d timeout. (Part 6 Next.)
- Upstash RateLimiter helper wired into `middleware.ts` and around the streaming routes + `lib/llm.ts`: fail-OPEN for reads, fail-CLOSED for the send-gate; counters/idempotency only, never PII; pin EU/Frankfurt. (Part 10 Next.)
- Feature-flag helper `apps/web/lib/flags.ts` gating REACHABILITY of live-send and NOVA DEMO_MODE-exit (never flips DRY_RUN, never computes a score). (Part 10 Next.)

## Later (post-PMF, gated)

- Read-only internal MCP server (official `@modelcontextprotocol/sdk`) for operator/agent convenience: query DB, fetch a company's signals or score, grounded lookup. Read-only, build-time, NEVER the send-gate or DRY_RUN. Mounts as a route handler under `app/` only when adopted. (Part 1 Later; ADR-0002.)
- Knowledge RAG route: when the corpus (transcripts + per-deal findings + playbooks) outgrows the cached canon, `/knowledge` calls a `KnowledgeStore` port (pgvector in Neon, Voyage/Cohere behind the port) and AI Elements Sources cites the exact chunk. Until then keep the whole-canon cached prompt. (Part 3.)
- Analytics OLAP cockpit: the JSON analytics route stays the read seam; a downstream Metabase/dbt layer is added only when "N weeks of real send+reply data worth a cohort question" exists, and only after a Fly/Railway host exists. The `/api/analytics` route is forward-compatible with reading a mart instead of OLTP later. (Part 7 Later.)
- Langfuse as a second OTel span processor (registered in `instrumentation.ts`) once a host + live traffic exist; confirm MIT-vs-EE for the chosen judge. (Part 8 Later.)
- Voice go-live surfaces: `/voice` and `/dojo` stay DEMO_MODE until TDRA approval; no dialing affordance until the owner signs off and NOVA's external compliance phase is live. (Part 4 / Part 11, external + gated.)
- Auth upgrades (Better Auth / WorkOS AuthKit) on a second-seat / SSO trigger. (Part 10 Later.)

## Contracts / interfaces touched (exact names)

Producers/consumers this plan adds or changes (exact strings):
- Inngest event emitted by the approvals route: `oie/send.approved` with payload `{ actionId: string }`, matched by orchestration's `step.waitForEvent('await-approval', { event: 'oie/send.approved', match: 'data.actionId', timeout: '7d' })`. (Next: `oie/send.rejected`.)
- `apps/web/app/approvals/actions.ts`: `approveMessage(messageId: string): Promise<ActionResult>`, `rejectMessage(messageId: string): Promise<ActionResult>` (same `ActionResult` contract; now DB-writing + event-emitting).
- `apps/web/lib/llm-stream.ts` (new, server-only): `streamAsk(opts: StreamAskOptions)` returning the AI SDK `streamText` result; `interface StreamAskOptions { system; user; deep?; maxTokens? }`.
- `apps/web/lib/data.ts` (new export): `getProvenanceRollup(): Promise<ProvenanceRollup>`, `type ProvenanceRollup`. (Existing `getAnalytics`, `getLeads`, etc. unchanged in signature; `getAnalytics` cost fallback fixed.)
- New route handlers: `app/api/analytics/route.ts` (`GET`), `app/api/close/{prep,outreach,coach}/route.ts` (`POST`, streaming), `app/api/knowledge/route.ts` (`POST`, streaming), `app/api/dojo/reply/route.ts` (`POST`, streaming). All `runtime = "nodejs"`, all `auth()`-guarded, none in the public allowlist.
- Reused unchanged: `ask` from `@/lib/llm`; `grounding` and the canon blocks from `@/lib/canon`; `scoreLead`/`icpProfile` from `@oie/core`; `inngest` re-exported from `@oie/orchestration`; `prisma` from `@oie/db`; `evaluateSendGate`/`SendGateInput`/`SendGateDecision` from `@oie/orchestration` (NOT changed here; re-runs on resume). System-prompt builders `PREP_SYSTEM`/`OUTREACH_SYSTEM`/`COACH_SYSTEM`/`KNOWLEDGE_SYSTEM`/`PROSPECT_SYSTEM`/`SCORE_SYSTEM` are exported (or moved to per-surface `prompts.ts`) so action and route share one source.

## Verification (how each task is proven done: typecheck/lint/test/build/curl)

Run from the repo root or via filter (per `apps/web/AGENTS.md`):
- `pnpm --filter web typecheck` (must pass; `.next` excluded; `noUncheckedIndexedAccess` on, guard array access).
- `pnpm --filter web lint` (zero warnings; `--max-warnings 0`).
- `pnpm --filter web test` (Vitest; runs Now-4 data-contract + Now-5 score-path tests; data-contract skips without `DATABASE_URL`).
- `pnpm --filter web build`.
- `pnpm verify` (whole monorepo: typecheck + lint + test + build) before claiming done.

Per task:
- Now-1: unit test asserts one `oie/send.approved` with `data.actionId === messageId` (mock `inngest.send`); end-to-end with Inngest dev shows a suspended run resume and the resumed audit row `gateOutcome: "simulate"`; the suspend+approve+resume+still-simulate regression test is the orchestration plan's task. `grep -rn "oie/send.approved" apps/web packages/orchestration` shows producer + consumer agree on the string.
- Now-2: `curl -s -H "Cookie: <session>" localhost:3000/api/analytics | jq` returns `{tiles,provenance,generatedAt}`; unauthenticated returns 401; `/analytics` renders the provenance card with zeros on an empty DB.
- Now-3: `pnpm --filter web build` with the new dep pair; manual stream observed on `/close`, `/knowledge`, `/dojo`; `grep -rn "@ai-sdk" packages/` returns nothing (SDK confined to apps/web).
- Now-4: test bites on a provenance-less seeded Company; skips cleanly without a DB.
- Now-5: test turns RED if any route assigns model text into `score`/`composite`/`fit`/`intent`/`tier`.

## Risks and do-not

- DO NOT add a "place call", "send now", or "disable dry-run" affordance to any route or action in this folder. Approvals emit an event; the gate stays server-enforced in `@oie/orchestration` and re-runs on resume. (`apps/web/AGENTS.md` invariants; CLAUDE.md hard rules.)
- DO NOT write the literal disable-flag token anywhere (code, comment, or doc). The content-based guard hook rejects it; reword (e.g. "dry-run off", "the live-send flag"). (CLAUDE.md gotchas.)
- DO NOT let any streaming or action route produce, accept, or recompute a score. The number is `@oie/core` only, read as a prop. Now-5 enforces this.
- DO NOT route any traced/costed Claude call around `LlmClient`/the chokepoint in a way that splits observability: the streaming `streamAsk` is the deliberate interactive exception that lives in apps/web (Part 1), but it must still read the key lazily and (when the OTel span work lands) be reconciled with the single-span goal. Do NOT use Inngest `step.ai.infer` for any of these calls (it bypasses `LlmClient.complete()`, dropping the OTel span and CostRecord).
- DO NOT add the AI SDK or any vendor package to `packages/*` or NOVA. Streaming lives in `apps/web` only. Keep the dep footprint to `@ai-sdk/anthropic` + `ai` (Part 1 cap).
- DO NOT add `api/analytics` (or any new operator route) to the `auth.config.ts` public allowlist. Only `/signin`, `/api/auth`, `/api/inngest` stay public. Keep an in-handler `auth()` check.
- DO NOT build dbt/DuckDB/ClickHouse/Metabase or any OLAP now. The analytics route is plain Prisma reads + a Vitest data-contract test; there is zero send/reply/finding data to model. (Part 7, deliberately-NOT.)
- DO NOT pull TanStack, Tremor, Motion, or the Tailwind v4 migration into the Now streaming work; they are Next and each its own gated PR. (Part 9.)
- DO NOT remove the blocking `ask()` path or the ROI deterministic-first pattern; keep ROI computing `computeRoiMath` before the model frames it. (`apps/web/AGENTS.md` Do.)
- Agree the `actionId` key string ONCE with the orchestration plan (Message.id vs the existing `idempotencyKey`); a mismatch means the run never resumes. This is the single highest-risk integration seam in this plan.
- Verify the AI SDK v5 + `@ai-sdk/anthropic` current API (model factory name, `maxOutputTokens` vs `maxTokens`, key env var) against official docs at adoption time per CLAUDE.md; do not assume from memory.
