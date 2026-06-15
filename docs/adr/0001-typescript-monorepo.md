# ADR-0001 — TypeScript monorepo

**Status:** Accepted

## Context

OIE spans a data pipeline, a web API, a control-plane UI, vendor adapters and a scoring engine. A small team — at times a single operator coordinating autonomous agents — has to build and maintain all of it. Two language ecosystems (for example a Python pipeline plus a TypeScript front end) would double the toolchain, fragment shared types across a network boundary, and make end-to-end refactors expensive. Multi-day outbound cadences also need durable, resumable execution rather than ad-hoc cron scripts.

## Decision

Build the entire system as a single **TypeScript monorepo** using pnpm workspaces and Turborepo. The stack is Next.js (App Router) for web and API, Prisma over PostgreSQL for persistence, Inngest for durable orchestration, Zod for shared validation, and Tailwind with shadcn/ui for the interface. TypeScript runs in strict mode. Internal packages are consumed as TypeScript source — no JS emit — and transpiled by `tsx` and Vitest.

## Consequences

- **Easier:** one language across pipeline, API and UI; types flow end-to-end with no serialisation boundary; a single install, lint, typecheck, test and build pipeline (`pnpm verify`); shared Zod schemas validate external input at every boundary.
- **Easier:** atomic cross-cutting refactors — a change to a core type surfaces every downstream break at compile time.
- **Harder:** some best-in-class data tooling is Python-first; we forgo it deliberately and reach for vendor APIs instead.
- **Risk:** monorepo build graphs can slow down as the repo grows; mitigated by Turborepo task caching and a strict, acyclic dependency direction (`config`/`core` at the base, `web` at the top).
