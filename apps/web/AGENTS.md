# AGENTS.md: apps/web (Huscribe Revenue OS control plane)

Operating guide for an AI agent making changes in `apps/web`. Read this fully before editing. It is specific to this module; it does not repeat generic Next.js advice.

## Purpose

`apps/web` is the Next.js 15 (App Router) operator control plane for **Huscribe Revenue OS**, the single cockpit covering end-to-end sales for Huscribe.com (voice-AI inbound lead qualification for UAE/MENA real estate). One operator (gp@humai.ae, HumAI Dubai) signs in and works the whole pipeline: ranked leads, ICP tuning, the signal feed, the human approval gate, NOVA voice calls, the Close Room (AI-assisted selling), and analytics.

It is the **human-in-the-loop surface**. Its reason to exist is making the deterministic brain (`@oie/core`), the data model (`@oie/db`), and the conductor (`@oie/orchestration`) legible and controllable, and enforcing in the UI that nothing sends or dials without an explicit operator decision.

LIVE in production: https://huscribe-revenue-os.fly.dev (Fly.io app `huscribe-revenue-os`, region fra).

## Layout: routes live in `app/`, NOT `src/`

This app does not use a `src/` directory. App Router routes are at the repo-relative `apps/web/app/`. The `@/*` path alias maps to `apps/web/*` (see `tsconfig.json`), so `@/lib/data`, `@/components/...`, `@/auth` all resolve from the package root.

## Key files and where things live

| Concern | File |
| --- | --- |
| Auth full setup (Node, bcrypt, Credentials provider) | `auth.ts` |
| Auth edge-safe config + route gate (`authorized` callback) | `auth.config.ts` |
| Route protection (Edge middleware) | `middleware.ts` |
| Sign-out server action | `lib/auth-actions.ts` |
| Sign-in page (client) | `app/signin/page.tsx` |
| NextAuth route handler (Node runtime) | `app/api/auth/[...nextauth]/route.ts` |
| Inngest serve endpoint (Node runtime) | `app/api/inngest/route.ts` |
| **Server data layer (Prisma reads + fixture fallback)** | `lib/data.ts` |
| Seed/fixture data + `scoreAndRankLeads` (the data seam) | `lib/fixtures.ts` |
| **LLM chokepoint (single Anthropic client)** | `lib/llm.ts` |
| **APEX sales canon + `grounding()`** | `lib/canon.ts` |
| `cn`, `formatRelative` helpers | `lib/utils.ts` |
| Root layout + nav shell | `app/layout.tsx`, `components/nav-sidebar.tsx` |
| Approval queue actions (DRY_RUN stubs) | `app/approvals/actions.ts` |
| Close Room actions (prep / outreach / coach / ROI) | `app/close/actions.ts` |
| Close Room client UI + bespoke markdown renderer | `components/close/close-workspace.tsx` |
| Voice (NOVA) list view | `app/voice/page.tsx`, `components/voice/voice-view.tsx` |
| ICP editor (client-side live re-rank) | `app/icp/page.tsx`, `components/icp/icp-editor.tsx` |
| Design-system primitives | `components/ui/{card,badge,drawer,tabs,states}.tsx` |
| Sentry server/edge + client init | `instrumentation.ts`, `instrumentation-client.ts` |
| Deploy config | `vercel.json`, repo-root `fly.toml` + `Dockerfile` |

Routes (all under `app/`): `/` (home), `/leads`, `/icp`, `/signals`, `/approvals`, `/voice`, `/close`, `/analytics`, `/signin`.

## Public contracts and exports (what other code depends on)

These are the stable shapes. Changing them is a cross-file change; grep callers first.

- **`lib/data.ts`** (server-only): `getActiveIcp()`, `getLeads()`, `getSignals()`, `getApprovals()`, `getAnalytics()`, `getCallSessions(limit?)`, plus types `CallSessionView`, `CallFindingView`. Every reader returns a UI-safe shape, never a raw Prisma row.
- **`lib/fixtures.ts`**: `SEED_ICP`, `FIXTURE_LEADS`, `SCORED_LEADS`, `FIXTURE_APPROVALS`, `FIXTURE_SIGNAL_FEED`, `scoreAndRankLeads(icp, now)`, `getAnalyticsTiles()`, and types `FixtureLead`, `ScoredLead`, `ApprovalItem`, `SignalFeedItem`, `AnalyticsTiles`, `MessageChannel`. `lib/data.ts` re-uses these exact shapes so DB rows and fixtures are interchangeable.
- **`app/close/actions.ts`**: `generatePrep(leadId)`, `generateOutreach(leadId)`, `coachTranscript(transcript)`, `computeRoi(input)`; all return `CloseResult { ok, title, body, error? }`. `RoiInput` is the ROI form contract.
- **`app/approvals/actions.ts`**: `approveMessage(id)`, `rejectMessage(id)` returning `ActionResult`.
- **`lib/canon.ts`**: `grounding(keys[])` plus the named blocks `FRAMEWORKS`, `OBJECTIONS`, `VOSS`, `PERSONALIZATION`, `DUBAI_PLAYBOOK`, `DISCOVERY`, `CLOSING`, `HUSCRIBE_FACTS`.
- **`lib/llm.ts`**: `ask({ system, user, deep?, maxTokens? })`.

Workspace deps consumed here: `@oie/core` (`scoreLead`, `rankByComposite`, `icpProfile`, types), `@oie/db` (`prisma`, generated Prisma types), `@oie/orchestration` (`inngest`, `inngestFunctions`), `@oie/integrations` (`LlmClient`, `MODEL_IDS`). `next.config.mjs` transpiles core/db/orchestration; they are consumed as TS source.

## Invariants (YOU MUST / NEVER)

These mirror the program's hard rules. Treat them as non-negotiable.

- **NEVER let the LLM compute a score.** Scoring is deterministic and lives in `@oie/core` (`scoreLead`). The UI calls it; `lib/llm.ts` / the Close Room only reason and write copy. Do not add a "let the model rank these" path.
- **NEVER send or dial from this UI.** `app/approvals/actions.ts` is intentionally a DRY_RUN stub: it records intent and calls no provider. A real send requires DRY_RUN off **and** an approved state **and** an explicit provider call, enforced in `packages/orchestration/src/send-gate.ts`. Do not add an affordance that bypasses approval, and do not wire a provider send into a server action here.
- **NEVER flip `DRY_RUN`.** It stays `true`. Do not read-and-default it to false, and do not write code or docs containing the literal disable-flag token (a content-based guard hook rejects it, even in comments). Reword.
- **Missing data is `unknown`, never guessed.** `lib/data.ts` maps null DB fields to explicit defaults (`"unknown"`, `0`, `""`); the Close prompts say "do not invent" and use the literal token `<CONFIRM>` for any unknown Huscribe price/metric/proof. Preserve that discipline in any new prompt or mapper.
- **NEVER invent Huscribe specifics in prompts.** Every price, metric, proof point is a `<CONFIRM>` placeholder. Never write "sounds completely human." Prove by customer type and locality, never an invented name or number.
- **Secrets only via env, never logged.** `lib/llm.ts` reads `ANTHROPIC_API_KEY` lazily and never includes it in error messages. `instrumentation.ts` only inits Sentry if a DSN is present. Do not hardcode any secret, do not print one, do not commit `.env*`.
- **`lib/data.ts` and `lib/llm.ts` are server-only.** NEVER import them (or anything that imports `@oie/db` / the Anthropic client) into a `"use client"` module. Pass data down as props from a server component.
- **bcrypt and Inngest routes need the Node runtime.** Keep `export const runtime = "nodejs"` on `app/api/auth/[...nextauth]/route.ts` and `app/api/inngest/route.ts`. The middleware uses `auth.config.ts` only (no bcrypt) so it stays Edge-safe.
- **Voice (NOVA) has no fixture fallback.** `getCallSessions()` returns `[]` on DB error or empty table; call outcomes are facts NOVA produced, never fabricated. Keep it that way.

## How to make a change safely

1. **Locate the seam.** Pages are server components that call `lib/data.ts` and pass plain data to client components. Find whether your change is a read (data layer), an AI action (`actions.ts` + `lib/llm` + `lib/canon`), or pure UI (`components/`).
2. **Respect the runtime boundary.** Server data/LLM logic stays in `lib/` or `actions.ts`. Anything interactive is a `"use client"` component receiving props. Do not cross the line.
3. **Keep shapes in lockstep.** If you change a UI-facing type, change it in `lib/fixtures.ts` (and `lib/data.ts` if it has its own type like `CallSessionView`), then update every consumer. DB mappers and fixtures must produce the identical shape.
4. **Validate external input at the boundary.** ICP rows are parsed with `icpProfile.safeParse` before use; LLM/transcript/form input is trimmed and checked. Follow that pattern; do not trust raw input or raw model output.
5. **Run the gate from the package root or via filter:**
   - `pnpm --filter web typecheck`
   - `pnpm --filter web lint` (zero warnings; `--max-warnings 0`)
   - `pnpm --filter web test` (Vitest + Testing Library, `passWithNoTests`)
   - `pnpm --filter web build`
   - Or the whole monorepo: `pnpm verify` (typecheck + lint + test + build).
6. **Verify behaviour:** `pnpm --filter web dev` then open http://localhost:3000. Without a DB or `ANTHROPIC_API_KEY` the read pages still render (fixture fallback); the Close Room surfaces a clean "needs ANTHROPIC_API_KEY" error.

## Do / Don't

**Do**
- Add new AI features through `lib/llm.ask()` and ground them with `grounding([...])`. One Anthropic client, one set of model ids.
- Use the design-system primitives in `components/ui/` and always render empty / loading / error states (see `components/ui/states.tsx`).
- Keep deterministic math in the action and let the model only narrate it (the `computeRoi` pattern: `computeRoiMath` runs first, the LLM frames it).
- Use the existing `tryDb()` wrapper for new reads so a DB outage degrades to fixtures, not a 500.

**Don't**
- Don't add a database adapter to Auth.js; sessions are JWT by design (`auth.config.ts`, 12h max, 1h rolling).
- Don't widen the public auth surface: `auth.config.ts` `authorized()` allows only `/signin`, `/api/auth`, `/api/inngest` without a session. Everything else requires login.
- Don't pull a heavy markdown library into the Close Room; it ships a deliberate dependency-free renderer in `close-workspace.tsx`.
- Don't compute or persist anything in the approval actions beyond recording intent until the orchestration send gate is wired (the TODOs mark Phase 7).

## Worked examples

### 1. Add a new read-backed page (e.g. `/deals`)
1. Add a reader to `lib/data.ts` that queries Prisma inside `tryDb()`, maps rows to a UI-safe type, and returns `[]` or a fixture fallback. Define the view type next to it.
2. Create `app/deals/page.tsx` as an async server component: `const deals = await getDeals();` then render a `"use client"` view with `deals` as props. Add `export const dynamic = "force-dynamic"` if it must always hit the DB (as `/leads`, `/close`, `/voice` do).
3. Add the nav entry to `components/nav-sidebar.tsx` `NAV_ITEMS`.
4. Run typecheck + lint + build.

### 2. Add a new Close Room tool grounded in the canon
1. Write the system prompt as a `(canon: string) => string` builder in `app/close/actions.ts`, embedding the "answer only from the canon, never invent, use `<CONFIRM>`" rules (copy the shape of `PREP_SYSTEM`).
2. Export an async `"use server"` action returning `CloseResult`; inside, `const canon = grounding(["FRAMEWORKS", ...])`, then `await ask({ system, user, deep?, maxTokens? })`, wrapped in try/catch that returns `{ ok:false, error }`.
3. Wire a tab in `components/close/close-workspace.tsx` (`TABS`, `BLURBS`, a panel) reusing `ActionPanel` / `ResultArea`.
4. Confirm the deterministic-first rule: if numbers are involved, compute them in TS and pass them in; the model frames, never invents.

## Gotchas

- **`@/*` resolves to the package root, not `src/`.** `@/lib/data` is `apps/web/lib/data.ts`.
- **Typecheck excludes `.next`** (Next rewrites the tsconfig include on build). `noUncheckedIndexedAccess` is on, so array indexing yields `T | undefined`; guard it (see the `at()` helper in the markdown parser and the `!` assertions in `lib/__tests__/fixtures.test.ts`).
- **The sign-in page shows a dev hint (`dev@oie.local` / `dev`).** That credential only works when `AUTH_OPERATOR_*` are unset **and** `NODE_ENV !== production` **and** `ALLOW_DEV_LOGIN=true` (a double opt-in). In production the operator login is a real bcrypt-checked password; the dev backdoor is dead. Never set `ALLOW_DEV_LOGIN` in any deployment.
- **Two Sentry init files:** `instrumentation.ts` (server/edge, via `register()`) and `instrumentation-client.ts` (browser). Both no-op without a DSN.
- **The Close Room markdown renderer is bespoke** (`parseBlocks` / `renderInline` in `close-workspace.tsx`). It handles the heading/list/table/code shapes the APEX prompts emit. If a prompt starts emitting a new structure, extend the parser rather than swapping in a library.
- **Model tiers come from `@oie/integrations` `MODEL_IDS`** (`hard` = claude-opus-4-8, `personalise` = claude-sonnet-4-6, `parse` = claude-haiku-4-5). `lib/llm.ts` uses `personalise` by default and `hard` when `deep: true` (coach uses deep). Do not hardcode model id strings here; reference `MODEL_IDS` so they stay in lockstep with the engine.
- **NOVA voice stays in `DEMO_MODE` (no real PSTN dialing) without owner sign-off.** The `/voice` view renders a "Demo" badge from `session.demoMode`; it is a read-only mirror of NOVA call sessions persisted by `scripts/nova-call.ts`. Do not add a "place call" button here without the owner's explicit go-ahead.
- **Inngest functions are registered, not defined, here.** `app/api/inngest/route.ts` just serves `inngestFunctions` from `@oie/orchestration`. Add or change durable functions in that package, not in the web app.
