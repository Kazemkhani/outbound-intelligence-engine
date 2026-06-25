# apps/web/components Plan

> The operator control-plane component layer: adopt shadcn/ui + Radix as the formalised primitive foundation and Vercel AI SDK + AI Elements for streaming, replace bespoke UI only where it pays, and keep the shared tested markdown renderer + copy-button. Derived from docs/architecture/TARGET-ARCHITECTURE.md (Part 9) and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

This folder is the client-side UI for the Next.js 15 (App Router) control plane. It is `"use client"` presentation that receives plain, UI-safe props from server components (which read `lib/data.ts`) and triggers `"use server"` actions. It never imports `@oie/db` or the Anthropic client directly.

Inventory (verified against the tree):
- Shared `ui/` primitives, hand-rolled on Tailwind v3.4 with bespoke design tokens (`ink-*`, `gold-*`, `teal-*`, and utility classes `surface`, `pill`, `pill-muted`, `btn-primary`, `label-mono`, `input-field`):
  - `ui/card.tsx` (Card/CardHeader/CardTitle/CardDescription/CardContent)
  - `ui/badge.tsx` (CVA-based, ~24 named variants incl. tier_a..d, signal types, channel, status)
  - `ui/drawer.tsx` (accessible slide-in dialog: focus-to-close-button, Escape, scroll-lock, `role="dialog" aria-modal`)
  - `ui/tabs.tsx` (roving `role="tablist"`, `aria-selected`, `aria-controls`)
  - `ui/states.tsx` (EmptyState/LoadingState/ErrorState with `role=status|alert`)
  - `ui/markdown.tsx` + `ui/markdown-parse.ts` + `ui/markdown-parse.test.ts`: a deliberate dependency-free markdown renderer (headings, fenced code, ol/ul, tables, inline bold/code/italic) with the parser split out and unit-tested (9 cases). Shared by Close, Knowledge, Dojo.
  - `ui/copy-button.tsx`: one-click copy of raw markdown for the WhatsApp/email workflow, with `aria-live="polite"` confirmation and silent failure in insecure contexts.
- Feature workspaces, all blocking (no streaming): `close/close-workspace.tsx` (4 tabs: prep/outreach/coach/roi, `useTransition`, awaits the whole `ask()` completion), `knowledge/knowledge-workspace.tsx` (Q&A thread, Cmd/Ctrl+Enter, focus-moves-to-newest-answer, `role="feed"`), `dojo/dojo-workspace.tsx` (roleplay chat, `role="log" aria-live`, end-and-score), `voice/voice-view.tsx` (read-only NOVA call mirror, canonical CallFinding ordering, Demo badge), `approvals/approval-queue.tsx` (pending/resolved, the human send-gate notice), `leads/leads-view.tsx` + `leads/lead-drawer.tsx`, `icp/icp-editor.tsx`, `nav-sidebar.tsx`.

Facts that shape the plan:
- AI surfaces call the blocking `ask(): Promise<string>` server actions and wait for the full completion; there is NO token streaming anywhere. (`apps/web/lib/llm.ts` `ask()`, `MODEL_IDS` from `@oie/integrations`.)
- `shadcn` CLI is NOT formalised: there is no `components.json`, and `@radix-ui/*` is NOT in `pnpm-lock.yaml` (verified: 0 matches). The primitives are CVA + `cn()` only.
- None of `@ai-sdk/anthropic`, `ai`, `@assistant-ui/*`, `tremor`, `@tanstack/react-table`, `@tanstack/react-query` is in the lockfile (verified).
- Tailwind is `^3.4.17`; the v3-to-v4 migration has real blast radius across every component's class names + the custom token theme.
- Accessibility is already a strength: skip link, `aria-current`, focus management, screen-reader status/alert/feed/log regions, keyboard shortcuts. This is a baseline to protect, not rebuild.
- One stale fact in `apps/web/AGENTS.md`: it says the app is LIVE on `huscribe-revenue-os.fly.dev`. TARGET-ARCHITECTURE corrects this: the deployed unit is `apps/web` on Vercel; the root `fly.toml` is stale. The plan follows the Vercel reality.

## Target architecture for this module (from the research)

Part 9 of TARGET-ARCHITECTURE: "buy the presentation layer, build the brain and the boundary." For THIS folder that means a pruned, one-tool-per-job adoption, all copy-in / MIT-or-Apache, confined to `apps/web`, never touching `packages/*` or NOVA:

- shadcn/ui + Radix as the formalised foundation. Adopt now alongside streaming. This is the registry that unlocks AI Elements + TanStack through one CLI. Migrate bespoke primitives ONLY where Radix adds real value (focus trap, listbox, dialog semantics); keep the bespoke ones that already win.
- Vercel AI SDK v5 (`@ai-sdk/anthropic`) + AI Elements (Reasoning, Tool, Sources, Conversation, PromptInput) for the streaming Close Room, Knowledge Q&A, Voice Dojo. Now. The LLM streams prose and reasoning ONLY; the deterministic number is never emitted by the model and never read from model text.
- TanStack Table v8 + TanStack Query v5 for the Leads view and Approval Queue: Next, not Now.
- Keep the shared markdown renderer + copy-button. They are explicitly endorsed: AGENTS.md says "Don't pull a heavy markdown library"; the research keeps the dependency-free renderer because it owns the exact block shapes the canon prompts emit and it is unit-tested.
- DEFERRED until a real need: Tremor + Recharts (no analytics data exists yet, per Part 7: zero sends, zero replies, zero CallFindings), Motion (polish), TanStack Virtual (only when lists are actually slow).
- The Tailwind v3-to-v4 migration is its own isolated, `pnpm verify`-gated PR: Next, not bundled into streaming.
- assistant-ui is documented as the FALLBACK ONLY; never run two chat paradigms at once. Do NOT adopt the Vercel AI Gateway or assistant-ui Cloud.

The hard prune rule governs: ONE tool per job until it visibly hurts; at most 3 net-new vendors per quarter. For this folder the Now adoptions are shadcn/Radix + AI SDK/AI Elements (one cohesive registry), and that is the cap.

## Invariants this module must preserve

- Deterministic scoring stays in code; the LLM never emits the number. Components render `lead.score.{tier,fit,intent,composite}` computed by `@oie/core`; streaming carries prose/reasoning only. A component must NEVER parse a score out of model text. (TARGET-ARCHITECTURE Part 9; AGENTS.md "NEVER let the LLM compute a score.")
- DRY_RUN default true + mandatory human send-gate. The approval queue records intent only; the gate is server-enforced in `packages/orchestration/src/send-gate.ts`. A TanStack Query mutation (Next) may flip approval UI state and emit `oie/send.approved`, but can NEVER bypass DRY_RUN or send from the UI. No component gets a "place call" or "send now" affordance without owner sign-off. (AGENTS.md; Part 6.)
- Vendor shapes never leak into core. Components read the `@oie/db`/fixtures unified UI-safe shapes (`ScoredLead`, `ApprovalItem`, `CallSessionView`, `CallFindingView`), never a raw Prisma row or a vendor payload. The AI SDK is `apps/web`-only and never imported into `packages/*`.
- Secrets only via env / Vercel. No component reads a key; server-only modules (`lib/llm.ts`, `lib/data.ts`) stay server-only and are never imported into a `"use client"` module.
- UAE PDPL + TDRA gate any live voice. The `voice/` surface stays a read-only mirror with a Demo badge; nothing here dials. (AGENTS.md; Part 4.)
- Missing data is `unknown`, never guessed. Preserve the explicit-default discipline in every new mapper/cell. (AGENTS.md.)
- Accessibility is a preserved invariant for this folder: every adoption must keep or improve the existing ARIA roles, focus management, keyboard shortcuts, and screen-reader live regions. Streaming must announce politely, not spam assertively.

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort

> Note on phasing: TARGET-ARCHITECTURE's three core "Now" items (durable send-gate, promptfoo, OTel span) are NOT in this folder. The component work here is the "if time remains" streaming + foundation track (Part 9 "Now"). Sequence it AFTER the three core items, but it is genuinely Now-scoped and near-zero-infra.

### N1. Formalise shadcn/ui + Radix without disturbing the design tokens (S-M)

Stand up the registry so AI Elements and TanStack install through one CLI, but do NOT rip out working bespoke primitives. Add `apps/web/components.json` pointing the registry at the existing token theme and the `@/components/ui` alias.

Copy-pasteable `apps/web/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": false,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "utils": "@/lib/utils"
  }
}
```
- `cssVariables: false` because the theme is token-class-based (`ink-*`/`gold-*`), not CSS-variable based; this stops the CLI rewriting `globals.css` colors.
- Add only the Radix primitives the bespoke ones cannot do well: install `dialog` (back the existing `Drawer` focus-trap with `@radix-ui/react-dialog` semantics) and `dropdown-menu` / `select` only when a feature needs them. Do NOT replace `card`, `badge`, `states`, `tabs`, `copy-button`, or the markdown renderer: they already pass a11y and own the tokens.
- Keep `cn()` in `@/lib/utils` (it already exists; the CLI must reuse, not overwrite it).
- Document in `apps/web/AGENTS.md`: "Bespoke primitives that win stay bespoke; new primitives come from the shadcn CLI into `components/ui/`."

Acceptance check:
- `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web build` all green with `components.json` present and no token-class regressions (visually diff Close/Leads/Voice render).
- `git diff app/globals.css` shows NO color-variable rewrite.
- Existing `ui/markdown-parse.test.ts` still passes unchanged.

### N2. Streaming Close Room over the AI SDK, keeping the shared markdown renderer (M)

Convert the four Close tabs from blocking `await ask()` to token streaming. The model streams prose/reasoning ONLY; the deterministic tier/fit/intent stay rendered from `@oie/core` props, never parsed from the stream.

Spec:
- Depend on EXACTLY the two net-new packages named in the research: `ai` and `@ai-sdk/anthropic`. No others.
- New server route(s) per Part 1: a `streamAsk()` built on `streamText`, surfaced as a route handler returning `toUIMessageStreamResponse()`, reusing the same `MODEL_IDS` tiers (`personalise` default, `hard` for coach `deep`) and the canon system prompt from `lib/canon.grounding([...])`. (Route + `streamAsk()` belong to `apps/web/app` and `apps/web/lib`; this folder consumes them.)
- In `close/close-workspace.tsx`: replace the `useTransition` + `setResult(await run())` pattern in `ActionPanel` / `CoachPanel` with `useChat` (or `useCompletion`) from `@ai-sdk/react`. Render the streaming text through the EXISTING `<Markdown source={...} />` on each token tick (it already `useMemo`s `parseBlocks`; partial markdown renders gracefully as paragraphs until a block closes).
- Keep `<CopyButton text={fullText} />` wired to the completed stream, the "Draft · review before use" label, and the `extractPayback()` ROI headline (run it on the final text only).
- ROI stays deterministic-first: `computeRoiMath` runs in the action BEFORE streaming; the model only narrates the numbers passed in. Never let the stream produce the arithmetic.
- a11y: announce streaming with a single `role="status"` `aria-live="polite"` region ("Generating answer..." / "Draft ready"), NOT per-token assertive announcements. Keep focus on the trigger until the stream completes, then leave focus management as-is.

Acceptance check:
- Manual: `pnpm --filter web dev`, open `/close`, run Prep: tokens render progressively through the existing `Markdown`; Copy copies the full final text; ROI payback headline still appears.
- A new component test asserts the score path never reads model text: render `CloseWorkspace` with a `ScoredLead`, assert tier/fit/intent come from props and are present BEFORE any stream resolves (mock the stream to never emit a number). (Part 9: "Add a test that the score path never reads model text.")
- `pnpm --filter web typecheck && lint && test && build` green.

### N3. Streaming Knowledge Q&A + Voice Dojo on the same seam (M)

Apply the identical streaming pattern to the other two text surfaces so all three share one chat paradigm and one renderer.

Spec:
- `knowledge/knowledge-workspace.tsx`: stream `askKnowledge` answers into the newest `<article>`; keep the `role="feed"`, the focus-moves-to-newest-answer effect (fire it on stream START so keyboard users land on the answer container, then let it fill), the Cmd/Ctrl+Enter submit, the suggestion chips, and `<CopyButton label="Copy answer" />` on the completed answer.
- `dojo/dojo-workspace.tsx`: stream the `prospectReply` turn into the conversation `role="log"`; keep the typing indicator until the first token, then replace with the streaming bubble; `scoreRoleplay` streams into the scorecard `<article>` through `<Markdown>`.
- Both reuse the same `streamAsk()`/route seam from N2 with their own canon grounding and `MODEL_IDS` tier. No second chat library: assistant-ui stays the documented fallback only.

Acceptance check:
- Manual: `/knowledge` answer and `/dojo` reply both stream token-by-token through `Markdown`; `role="feed"`/`role="log"` regions still present; Cmd/Ctrl+Enter still submits.
- Screen-reader spot check: a single polite live region announces start/end, not every token.
- `pnpm --filter web typecheck && lint && test && build` green.

### N4. Lock the shared markdown + copy-button as the canonical primitives (S)

Make explicit, with tests, that the shared renderer + copy-button are the one way AI output is displayed and copied, so streaming work does not regress them and no one reintroduces a markdown dependency.

Spec:
- Add a `copy-button.test.tsx` (Testing Library): asserts it renders the label, that clicking calls `navigator.clipboard.writeText` with the exact `text`, flips to "Copied", and fails silently when clipboard throws (mock rejection) without crashing.
- Add a partial-markdown render test to `markdown-parse.test.ts` (or a sibling): assert an unterminated `**bold` and an open `| a | b` table mid-stream still parse to safe blocks (paragraph fallback), proving streaming partial chunks never throw.
- Record the rule in `apps/web/AGENTS.md`: "AI output renders ONLY through `@/components/ui/markdown` and copies ONLY through `@/components/ui/copy-button`. Do not add a markdown library."

Acceptance check:
- `pnpm --filter web test` shows the new copy-button + partial-markdown tests passing.
- Grep proves no markdown package was added: `grep -E "remark|rehype|react-markdown|markdown-it" apps/web/package.json` returns nothing.

### N5. Accessibility regression guard for the new streaming surfaces (S)

Streaming changes the timing of DOM updates; lock the a11y baseline so it cannot silently regress.

Spec:
- Add lightweight Testing-Library assertions for the three streamed workspaces: each has exactly one live region for stream status (`role="status"` polite), tab/panel wiring intact in Close (`role="tab"`/`tabpanel"`, `aria-selected`, `aria-controls`), `role="feed"` in Knowledge, `role="log"` in Dojo, and the Cmd/Ctrl+Enter handler present.
- Keep the existing `Drawer` focus-trap and `nav-sidebar` skip link untouched; add a test that `Drawer` still moves focus to the close button on open and closes on Escape.

Acceptance check:
- `pnpm --filter web test` green with the new a11y tests.
- Manual keyboard pass: tab through `/close`, reach every control, Escape closes the lead drawer.

## Next (1 to 3 months)

- TanStack Table v8 + TanStack Query v5 for `leads/leads-view.tsx` and `approvals/approval-queue.tsx`: dense, sortable, instantly responsive grids reading the `@oie/db` unified model via Server Components (never a vendor shape, never computing a score). A TanStack Query mutation on the approval queue may flip approval UI state and emit `oie/send.approved` (Part 6), but the gate stays server-enforced and can never bypass DRY_RUN. (Part 9 Next.)
- Tailwind v3-to-v4 migration as its own isolated, `pnpm verify`-gated PR, NOT bundled with streaming. Port the custom token theme (`ink-*`/`gold-*`/`teal-*`, `surface`/`pill`/`btn-primary`/`label-mono`/`input-field`) to the v4 `@theme` model; visually diff every component. This is the one upgrade with real blast radius. (Part 9 Next.)
- AI Elements `Sources` component wired to cite canon passages once Close/Knowledge stream (pairs with any future retrieval; today it cites the static canon section). (Part 9.)
- Fix the stale `apps/web/AGENTS.md` Fly URL to the Vercel reality during the next AGENTS.md edit.

## Later (post-PMF, gated)

- Tremor + Recharts for an analytics dashboard: gated on real cohort data existing (Part 7: zero sends/replies/findings today, so nothing to chart). Build only when "we have N weeks of real send+reply data worth a cohort question."
- Motion micro-interactions: polish, deferred until the surfaces are stable and there is a named UX gain.
- TanStack Virtual: only when lead/approval lists are measurably slow (not at current volume).
- assistant-ui as a swap for the chat paradigm: only if the AI SDK + AI Elements path visibly hurts; never run two chat paradigms at once. Never the Vercel AI Gateway or assistant-ui Cloud (needless hosting/billing dependencies, per the deliberately-NOT list).
- `streamObject` + Zod (the same `@oie/core` schemas) for typed findings/objection-maps validated at the boundary, surfaced as structured UI: pairs with the AI SDK once a structured surface needs it. (Part 9.)

## Contracts / interfaces touched (exact names)

- Consumed UI-safe shapes (read-only, unchanged): `ScoredLead`, `ApprovalItem`, `SignalFeedItem`, `MessageChannel` (`lib/fixtures.ts`); `CallSessionView`, `CallFindingView` (`lib/data.ts`).
- Consumed server actions (read-only contracts, to be backed by a streaming variant): `generatePrep`, `generateOutreach`, `coachTranscript`, `computeRoi` returning `CloseResult { ok, title, body, error? }` (`app/close/actions.ts`); `askKnowledge` returning `KnowledgeResult` (`app/knowledge/actions.ts`); `prospectReply`, `scoreRoleplay` (`app/dojo/actions.ts`); `approveMessage`, `rejectMessage` returning `ActionResult` (`app/approvals/actions.ts`).
- New consumed seam (built in `app/`/`lib`, consumed here): `streamAsk()` on `streamText` returning `toUIMessageStreamResponse()`, plus a route handler under `app/api/`. Same `MODEL_IDS` (`@oie/integrations`) and `grounding()` (`lib/canon.ts`).
- Component public exports preserved (other files import them): `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Badge` + `badgeVariants`, `Drawer`, `Tabs`, `EmptyState`/`LoadingState`/`ErrorState`, `Markdown` + `stripInline`, `CopyButton`, `parseBlocks` + `Block` type, `CloseWorkspace`, `KnowledgeWorkspace`, `DojoWorkspace`, `VoiceView`, `ApprovalQueue`, `NavSidebar`.
- New files: `apps/web/components.json`; `apps/web/components/ui/copy-button.test.tsx`; a11y/partial-markdown test files.
- New dependencies (exactly): `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`; plus `@radix-ui/react-dialog` (and `react-dropdown-menu`/`react-select` only when a feature needs them) via the shadcn CLI. TanStack and Tailwind v4 are Next; Tremor/Motion/Virtual are Later.

## Verification (how each task is proven done)

- Every task: `pnpm --filter web typecheck` (tsc strict, `.next` excluded), `pnpm --filter web lint` (`--max-warnings 0`), `pnpm --filter web test` (Vitest + Testing Library), `pnpm --filter web build`, then `pnpm verify` for the whole monorepo before claiming done.
- N1: build green with `components.json`; `git diff app/globals.css` shows no color rewrite; existing markdown test unchanged-and-green.
- N2: manual stream check at `/close` via `pnpm --filter web dev`; new "score never read from model text" component test passes.
- N3: manual stream check at `/knowledge` and `/dojo`; single polite live region confirmed.
- N4: new `copy-button.test.tsx` + partial-markdown test green; `grep -E "remark|rehype|react-markdown|markdown-it" apps/web/package.json` empty.
- N5: a11y tests green; manual keyboard pass through `/close` and the lead drawer (Escape closes).
- curl smoke for the streaming route once built: `curl -N -X POST localhost:3000/api/<stream-route> -d '{"leadId":"..."}'` shows a chunked SSE/text stream (auth permitting), proving streaming server-side independent of the UI.

## Risks and do-not

- DO NOT let any component parse a score, tier, or number out of streamed model text. Scores render from `@oie/core` props only. (Hard invariant; covered by the N2 test.)
- DO NOT add a "send now" / "place call" / DRY_RUN-flip affordance to any component. The approval queue records intent; the gate is server-enforced. NOVA `voice/` stays read-only with the Demo badge. (AGENTS.md; the content-based guard hook also rejects the literal disable token even in comments: reword, never bypass.)
- DO NOT pull a markdown library (`react-markdown`/`remark`/`rehype`/`markdown-it`). The tested dependency-free renderer owns the exact block shapes the canon prompts emit; extend the parser if a new shape appears. (AGENTS.md gotcha.)
- DO NOT rip out the bespoke primitives that already pass a11y (card/badge/states/tabs/copy-button/markdown) just to "be shadcn." Adopt Radix only where it adds real semantics (dialog). Over-migration risks the custom token theme and the WCAG baseline.
- DO NOT run two chat paradigms: AI SDK + AI Elements only; assistant-ui is the documented fallback, not a parallel adoption.
- DO NOT adopt Tremor/Recharts now: there is zero analytics data (zero sends/replies/findings). Charting an empty Neon is building the floor of a skyscraper before the first tenant. (Part 7.)
- DO NOT bundle the Tailwind v3-to-v4 migration into the streaming PR: it has the largest blast radius across the token theme and every component; ship it isolated and `pnpm verify`-gated. (Part 9.)
- DO NOT import `lib/data.ts` / `lib/llm.ts` (or anything pulling `@oie/db` or the Anthropic client) into a `"use client"` component. Pass data as props; stream via the route handler. (AGENTS.md runtime boundary.)
- DO NOT exceed the 3-net-new-vendors-per-quarter cap: this folder's Now adoptions (shadcn/Radix registry + AI SDK/AI Elements) are one cohesive registry plus the streaming pair; TanStack is Next, charts/animation Later.
- Streaming a11y risk: per-token assertive announcements would flood screen readers. Use ONE polite live region for status. Partial-markdown risk: ensure the renderer never throws on an unterminated block mid-stream (covered by the N4 partial-render test).
