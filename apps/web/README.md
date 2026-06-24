# web: Huscribe Revenue OS control plane

The operator cockpit: a Next.js 15 (App Router) dashboard and API where one operator runs end-to-end sales for Huscribe.com (voice-AI inbound lead qualification for UAE/MENA real estate). Ranked leads, ICP tuning, the signal feed, the human approval gate, NOVA voice calls, an AI-assisted Close Room, and analytics, all behind a single sign-in.

LIVE: https://huscribe-revenue-os.fly.dev (Fly.io app `huscribe-revenue-os`, region fra).

## Purpose

Make the deterministic brain and the conductor legible and controllable to a human. This is where the human-in-the-loop happens, above all the approval queue that gates every real send. It depends on `@oie/core` (scoring), `@oie/db` (Prisma/Postgres), `@oie/orchestration` (Inngest + send gate), and `@oie/integrations` (the single Anthropic client).

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Overview: summary tiles and the DRY_RUN gate notice |
| `/leads` | Ranked, filterable leads with a detail drawer (enrichment, signal timeline, score rationale) |
| `/icp` | ICP editor with **live re-rank** (recompute is pure and deterministic, no LLM cost) |
| `/signals` | The buying-signal feed with evidence, provider, strength, decay |
| `/approvals` | The approval queue; nothing sends without explicit per-message approval |
| `/voice` | NOVA voice-call sessions: status, consent, structured findings, transcript |
| `/close` | The Close Room: AI battlecard, outreach pack, post-call coach, ROI case (grounded in the APEX sales canon) |
| `/analytics` | Leads by tier, signals this week, pending approvals, estimated provider cost |
| `/signin` | Operator sign-in (Auth.js v5 credentials) |

API: `app/api/auth/[...nextauth]` (Auth.js) and `app/api/inngest` (durable workers serve endpoint). Both run on the Node runtime.

## How it fits the system

The orchestration brain produces ranked leads and queues actions; the operator reviews and approves here; the send gate (`packages/orchestration/src/send-gate.ts`) enforces in code that nothing leaves on any channel without that approval **and** DRY_RUN off. Scores are always computed deterministically in `@oie/core`; the LLM never scores. The Close Room uses one Anthropic client (`lib/llm.ts`) grounded in a distilled sales canon (`lib/canon.ts`). NOVA (the operator's voice agent at api.novalabs.ae) places calls via `scripts/nova-call.ts` and persists sessions; `/voice` is a read-only mirror of those facts.

Read pages degrade gracefully: with no database or `ANTHROPIC_API_KEY`, the dashboard renders from seed fixtures and the Close Room surfaces a clear "needs key" message, so local dev and `next build` stay green.

## Install and run

From the monorepo root (pnpm 10, Node 22+):

```bash
pnpm install
pnpm --filter web dev          # http://localhost:3000
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test         # Vitest + Testing Library (passWithNoTests safe)
pnpm --filter web build
```

Local sign-in uses a dev backdoor (`dev@oie.local` / `dev`) that only works when the `AUTH_OPERATOR_*` env vars are unset, `NODE_ENV` is not production, and `ALLOW_DEV_LOGIN=true`. In production the operator login is a real bcrypt-checked password and the backdoor is disabled.

Relevant env (set via the engine `.env`; see repo-root `.env.example`, never commit secrets): `AUTH_SECRET`, `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`, `NOVA_*`. `DRY_RUN` stays `true`.

## Deployment

Production runs on Fly.io (`huscribe-revenue-os`, region fra) via the repo-root `Dockerfile` and `fly.toml`; secrets live only in Fly secrets. A Vercel config (`vercel.json`) is also present for preview/alternate hosting. `AUTH_TRUST_HOST` and `AUTH_URL` are set in the deployed environment.

## Working in this package

If you are an AI agent (or a human onboarding), read **[AGENTS.md](./AGENTS.md)** first: it documents the runtime boundaries (server-only data/LLM modules vs client components), the public contracts, the hard invariants (LLM never scores, nothing sends from the UI, DRY_RUN stays on, never invent Huscribe specifics), and step-by-step worked examples for adding a page or a Close Room tool.
