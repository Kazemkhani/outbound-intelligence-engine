# OIE — Project memory

> Outbound Intelligence Engine. Read PROJECT_BRIEF.md for the full decisions-locked program; this file is the lean operating memory that loads every session. Keep it short — only what cannot be inferred from code.

## Commands

- Install: `pnpm install`
- Verify (run before claiming done): `pnpm verify` # typecheck + lint + test + build
- Typecheck / lint / test / build individually: `pnpm typecheck` | `pnpm lint` | `pnpm test` | `pnpm build`
- Infra (Postgres on Colima/Docker): `pnpm infra:up` | `pnpm infra:down`
- DB: `pnpm db:migrate` | `pnpm db:seed` | `pnpm db:studio` | `pnpm db:generate`
- Single test: `pnpm --filter @oie/core test <path>`

## Architecture (where things live)

- Domain types, Zod schemas, scoring engine: `packages/core` — scores computed HERE, never by the LLM.
- Unified data model / Prisma schema / migrations / seed: `packages/db`.
- Vendor adapters (anti-corruption): `packages/integrations/<vendor>` — vendor shapes NEVER leak into core; the waterfall/fallback logic lives in OUR core, not the vendor.
- Stable internal interfaces every adapter implements: `packages/integrations/src/contracts` (EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore).
- Orchestration brain + waterfall + send gate: `packages/orchestration` — DRY_RUN defaults true; approval queue mandatory.
- Env loading + validation (fail fast on missing keys): `packages/config`.

## Autonomy & integration rules (YOU MUST)

- Auto mode builds + verifies. NEVER auto-approve a send, auto-disable DRY_RUN, or enter secrets. Live send = human gate.
- MCP = agent/runtime + build-time. REST/webhooks = the production pipeline. Never put the send-path behind MCP.
- Every external service sits behind an adapter; we own the cascade, the cost ceiling, and the swap.
- Verify every provider's CURRENT API/limits/auth against official docs before integrating; do not assume from memory.

## Hard rules (YOU MUST)

- Plan with deep thinking before multi-file changes. Verify before claiming done; show evidence.
- TS strict; no `any` without a one-line reason. Validate all external/LLM input with Zod at the boundary.
- Secrets only via env; never commit secrets; update `.env.example` when adding a key.
- Nothing sends on ANY channel without explicit human approval AND a passing dry-run.
- LinkedIn & WhatsApp OFF by default, behind the approval queue, within conservative limits (LinkedIn well within ~100 connects/week).
- Prefer the simplest approach. No speculative abstraction. Delete dead code.

## Model tiering (addendum §7, June 2026 IDs)

- `claude-opus-4-8` — hard judgement, planning, verifier + security review.
- `claude-sonnet-4-6` — personalisation, scoring rationale.
- `claude-haiku-4-5` — high-volume parsing/classification.

## Environment

- Node 22+, pnpm 10. Internal packages are consumed as TS source (no JS emit) — `tsx`/Vitest transpile.
- Postgres runs locally via Colima + Docker (`pnpm infra:up`). Free disk is tight (~17 GB) — keep deps lean; `apps/web` (Next.js) is deferred to Phase 6.

## Gotchas

- (fill in as discovered — keep short; prune ruthlessly)
