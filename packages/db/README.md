# @oie/db

The unified data model for Huscribe Revenue OS: the Prisma schema, the shared client, migrations, and the seed. One normalised source of truth across every provider.

> Working in this package with an AI agent? Read [AGENTS.md](./AGENTS.md) first. It has the invariants, the safe-change steps, and the known gotchas (including current migration drift).

## Purpose

Persist the unified model so vendor shapes never leak into storage, and expose one typed client. Depends on `@oie/core` for shared types and the ICP Zod schema; consumed by `packages/orchestration` and `apps/web`.

## What it owns

- **Schema** (`prisma/schema.prisma`), the unified model. Entities: `IcpProfile`, `Company`, `Contact`, `Signal`, `Score`, `Sequence`, `Enrolment`, `Message`, `Mailbox`, `ChannelAccount`, `Suppression`, `AuditLog`, `ProviderCost`, `CallSession`, `CallFinding`.
- **Client** (`src/client.ts`), the shared `prisma` singleton (hot-reload safe).
- **Migrations** (`prisma/migrations/`), forward-only SQL. Generated, never hand-edited.
- **Seed** (`src/seed.ts`, `src/seed-data.ts`), idempotent; seeds the committed ICP (brief §13.2), validated against the `@oie/core` schema before any write.

Dedupe rules: `Company` on `domain` (+ `placeId`); `Contact` on `email` / `linkedinUrl`; `Enrolment` unique on (`contactId`, `sequenceId`); `Message` idempotent on (`channel`, `externalId`); `CallSession` idempotent on `novaCallId`. Field provenance is recorded in each row's `sources` JSON; missing data stays null (unknown), never guessed.

## Exports

| Export | Purpose |
| --- | --- |
| `prisma` | the shared Prisma client (import this, never `new PrismaClient()`) |
| `seedIcp` | the committed seed ICP data object |
| `* from "@prisma/client"` | generated model types and enums |

## Install and use

The package's `postinstall` runs `prisma generate`, so a fresh `pnpm install` (clone, CI, or Fly build) always produces a typed client. Consume it as:

```ts
import { prisma, Tier } from "@oie/db";
```

## Run

```bash
pnpm infra:up                       # local Postgres (Colima/Docker)
pnpm db:migrate                     # prisma migrate dev (writes a migration, regenerates client)
pnpm db:seed                        # seed the ICP (idempotent: one row on re-run)
pnpm db:studio                      # Prisma Studio
pnpm db:generate                    # regenerate the client only
pnpm --filter @oie/db test          # seed-data validation tests
```

Production uses Neon; release applies migrations with `prisma migrate deploy` (script `migrate:deploy`). Never run `migrate dev`, `db push`, or `migrate reset` against a shared or production database.

## How it fits

`db` is the system of record between the bought rails and the control plane. The orchestration layer writes normalised companies, contacts, signals, scores, and NOVA call results here; `apps/web` reads ranked leads, the signal feed, the approval queue, and call findings from here. Scores are stored here but computed deterministically in `packages/core`, never by an LLM. Migrations are forward-only: recover a bad one from a Neon backup or branch, never by editing migration history.
