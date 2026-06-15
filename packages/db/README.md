# @oie/db

The unified data model: the Prisma schema, client, migrations and seed. One normalised source of truth across every provider.

## Purpose

Persist the unified model so vendor shapes never leak into storage, and provide a single typed client. Depends on `@oie/core` for shared enums; consumed by `orchestration` and `web`.

## What it owns

- **The Prisma schema** (`prisma/schema.prisma`) — the unified data model (see [Architecture §5](../../docs/ARCHITECTURE.md)). Entities: `IcpProfile`, `Company`, `Contact`, `Signal`, `Score`, `Sequence`, `Enrolment`, `Message`, `Mailbox`, `ChannelAccount`, `Suppression`, `AuditLog`, `ProviderCost`.
- **The client** (`src/client.ts`) — the shared `prisma` instance.
- **Migrations** — forward-only, in `prisma/migrations`. Never hand-edit.
- **The seed** (`src/seed.ts`, `src/seed-data.ts`) — idempotent; seeds the ICP from `PROJECT_BRIEF.md` §13.2.

Dedupe rules: `Company` on `domain` (+ `placeId`); `Contact` on `email` / `linkedinUrl`; `Enrolment` is unique on (`contactId`, `sequenceId`). Field provenance is recorded in each record's `sources` JSON.

## Key exports

| Export                  | Purpose                         |
| ----------------------- | ------------------------------- |
| `prisma`                | the shared Prisma client        |
| `seedIcp`               | idempotent ICP seeder           |
| `* from @prisma/client` | generated model types and enums |

## How to test and run

```bash
pnpm --filter @oie/db test          # seed-data tests
pnpm db:migrate                     # apply migrations (dev)
pnpm db:seed                        # seed the ICP (idempotent — 1 row on re-run)
pnpm db:studio                      # Prisma Studio
pnpm db:generate                    # regenerate the client
```

Postgres runs locally via Colima/Docker (`pnpm infra:up`). Production uses Neon; release runs `prisma migrate deploy`.

## How it fits

`db` is the system of record between the bought rails and the control plane. The orchestration layer writes normalised companies, contacts, signals and scores here; `web` reads ranked leads, the signal feed and the approval queue from here. Migrations are forward-only — recover a bad migration from a Neon backup or branch, never by editing migration history.
