# AGENTS.md: `@oie/db`

Operating guide for an AI agent changing the data layer of Huscribe Revenue OS. Read this fully before editing. It overrides generic Prisma habits.

## Purpose

`@oie/db` is the unified Prisma data model: ONE normalised source of truth across every vendor. Vendor shapes are mapped into these entities by the integration adapters; nothing vendor-specific lives here. This package owns the schema, the migrations, the singleton Prisma client, and the idempotent ICP seed. Its `postinstall` runs `prisma generate`, so a fresh clone or CI build always has a typed client.

System fit: bought rails (enrichment, signals, senders, the NOVA voice agent) write normalised rows here through `packages/orchestration`. The control plane (`apps/web`) reads ranked leads, the signal feed, the approval queue, and call findings from here. Scores are written here but computed in `packages/core`, never by an LLM and never in SQL.

## Key files and where things live

| Path | What it is |
| --- | --- |
| `prisma/schema.prisma` | The unified model. Single source of truth for entities, enums, indexes, relations. |
| `prisma/migrations/` | Forward-only SQL migrations. Generated, never hand-edited. `migration_lock.toml` pins provider = postgresql. |
| `src/client.ts` | The singleton `prisma` instance (hot-reload safe). |
| `src/index.ts` | The public surface. Re-exports `prisma`, `seedIcp`, and everything from `@prisma/client`. |
| `src/seed.ts` | The idempotent seed runner (validates, upserts, audits, enforces single-active-profile). |
| `src/seed-data.ts` | `seedIcp`: the committed seed ICP object (brief §13.2). |
| `src/seed-data.test.ts` | Vitest checks that `seedIcp` parses against the canonical `@oie/core` ICP schema. |
| `package.json` | Scripts. `exports["."] = "./src/index.ts"` (consumed as TS source, no JS emit). |

## Public contracts and exports

Importers use `@oie/db` only. The surface is exactly:

- `prisma`, the shared `PrismaClient` singleton. Every consumer (`packages/orchestration`, `apps/web`) imports `{ prisma } from "@oie/db"`. Do not instantiate `new PrismaClient()` anywhere else.
- `seedIcp`, the seed ICP data object, typed as `@oie/core`'s `IcpProfile`.
- `* from "@prisma/client"`, all generated model types and enums (`Company`, `Contact`, `Tier`, `Channel`, `Prisma`, etc.). Consumers import enums and types from `@oie/db`, not from `@prisma/client` directly.

The schema is a contract too. Renaming or dropping a field, enum value, or model is a breaking change for `packages/orchestration` and `apps/web`. Grep both before you touch the schema.

## Entities (current schema)

`IcpProfile`, `Company`, `Contact`, `Signal`, `Score`, `Sequence`, `Enrolment`, `Message`, `Mailbox`, `ChannelAccount`, `Suppression`, `AuditLog`, `ProviderCost`, `CallSession`, `CallFinding`.

Identity and dedupe (enforced by `@unique`):
- `Company`: dedupe on `domain` (unique) plus `placeId` (unique).
- `Contact`: dedupe on `email` (unique) and `linkedinUrl` (unique).
- `Score`: one per `(contactId, icpProfileId)`.
- `Enrolment`: one per `(contactId, sequenceId)`.
- `Message`: idempotency on `(channel, externalId)`, the provider id is the anchor.
- `CallSession`: idempotency on `novaCallId` (the NOVA provider id).
- `IcpProfile`: one per `(name, version)`.

Provenance: per-row `sources` JSON records which provider supplied which field. Raw vendor payloads go in `raw` (Company, CallSession). Missing data stays null (unknown), never guessed.

## Invariants: YOU MUST / NEVER

YOU MUST:
- Change the schema by editing `prisma/schema.prisma` and then generating a migration. The schema is the source of truth.
- Keep migrations forward-only. Recover a bad migration from a Neon backup or branch, never by rewriting history.
- Keep the seed idempotent: validate against the `@oie/core` Zod schema before any write, and upsert on the unique key. Re-running `db:seed` must leave exactly one row, not duplicates.
- Preserve the single-active-`IcpProfile` invariant: activating one profile deactivates the rest (see `seed.ts`).
- Write only consented, honest `CallFinding` rows. Canonical keys: `identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`. Never fabricate a finding.
- Keep new send-related rows compatible with the human-approval gate: `Message.status` includes `awaiting_approval`; `ChannelAccount.enabled` defaults to `false` (LinkedIn and WhatsApp OFF by default); `CallSession.demoMode` defaults to `true`.
- Add an `AuditLog` row for any new privileged data mutation you introduce (sends, score changes, data pulls, seeds).
- Keep `DATABASE_URL` the only datasource input, supplied via env. Migration and seed scripts load it with `dotenv -e ../../.env`.

NEVER:
- Compute or store a score derived by an LLM. `Score.fit`, `Score.intent`, `Score.composite`, `Score.tier` come from the deterministic engine in `packages/core`.
- Instantiate a second `PrismaClient`. Always import `{ prisma } from "@oie/db"`.
- Hand-edit a file under `prisma/migrations/` or change applied SQL.
- Hardcode a connection string, print `DATABASE_URL`, or touch `.env` / secrets. Production secrets live only in Fly secrets and Neon.
- Run `prisma migrate reset`, `prisma db push`, or any destructive command against a shared or production database.
- Guess missing values to satisfy a non-null column. Prefer nullable columns over fabricated defaults.

## How to make a change safely

Schema change (add a field, model, enum value, or index):
1. Grep consumers first: `grep -rln "@oie/db" --include="*.ts" packages apps | grep -v node_modules`. Read the call sites for any model you are changing.
2. Edit `prisma/schema.prisma`. Keep new send/dial fields gated-safe (defaults that do not enable a channel or bypass approval).
3. Ensure Postgres is up locally: `pnpm infra:up`.
4. Generate the migration and client: `pnpm db:migrate` (runs `prisma migrate dev`, prompts for a migration name, writes SQL under `prisma/migrations/`, regenerates the client). Use a descriptive snake_case name.
5. Regenerate types if needed elsewhere: `pnpm db:generate`.
6. If you added a relation or required field used by code, update the consumers in the same change.
7. Verify: `pnpm --filter @oie/db typecheck` and `pnpm --filter @oie/db test`, then the repo gate `pnpm verify` (typecheck + lint + test + build).
8. Production applies migrations with `prisma migrate deploy` (script `migrate:deploy`) at release. Never `migrate dev` against production.

Seed change:
1. Edit `src/seed-data.ts` only for the data; the runner logic in `src/seed.ts` rarely changes.
2. Keep `seedIcp` valid against `@oie/core`'s `icpProfile` schema. The composite blend must sum to 1; component weights are independent.
3. Run `pnpm --filter @oie/db test` (parses the seed) then `pnpm db:seed` (idempotent upsert).

Client change:
- `src/client.ts` is intentionally minimal. Only touch it for connection-pool or logging concerns. Keep the global-singleton guard so dev hot reload does not exhaust Postgres connections.

## Do / Don't

Do:
- Add `@@index` for any new query path the orchestration or web layers will use.
- Use `cuid()` ids and `@default(now())` / `@updatedAt` timestamps, matching existing models.
- Store validated structured config as `Json` (e.g. `IcpProfile.config`, `Sequence.steps`) and validate it with a `@oie/core` Zod schema before writing.
- Use `onDelete: SetNull` for optional ownership (e.g. `Contact.company`, `CallSession.contact`) and `onDelete: Cascade` for owned children (e.g. `Signal`, `Score`, `CallFinding`).

Don't:
- Let a vendor field name into the schema. Map it to a normalised column in the adapter and record provenance in `sources`.
- Add a column that defaults a channel to enabled or a call to live (non-demo).
- Bypass the seed validation to "just write the row".
- Add JS build emit. This package is consumed as TS source via `exports["."] = "./src/index.ts"`.

## Worked examples

Example 1, add a `region` filter index for fast lead ranking by area:
1. `grep -rln "@oie/db" --include="*.ts" packages apps | grep -v node_modules` to find readers of `Company`.
2. In `prisma/schema.prisma`, `Company` already has `@@index([country, region])`. If you need region alone, add `@@index([region])`.
3. `pnpm infra:up` then `pnpm db:migrate` and name it `company_region_index`.
4. `pnpm --filter @oie/db typecheck && pnpm verify`.

Example 2, record a NOVA call outcome (consumer-side pattern, the moat "verify-by-conversation"):
```ts
import { prisma } from "@oie/db";

await prisma.callSession.upsert({
  where: { novaCallId },                 // idempotency anchor
  create: { novaCallId, contactId, companyId, demoMode: true, consent: true, status: "completed" },
  update: { status: "completed", outcome, summary, transcript, raw },
});
await prisma.callFinding.create({
  data: { callSessionId, key: "identity_confirmed", value: "true", source: "nova" }, // canonical key, consented only
});
```
Then mirror enrichment to `Company` / `Contact` only for facts the call actually confirmed; leave the rest null.

## Gotchas

- Migration drift (important): the only migration `20260613234107_init` creates 13 tables and does NOT include `CallSession` or `CallFinding`. The schema is ahead of migrations for those two models. A fresh `prisma migrate deploy` will not create those tables. Before relying on call persistence, generate the missing migration with `pnpm db:migrate` (name it e.g. `add_call_session_finding`) and commit the SQL. Do not assume the schema and the applied database are in sync.
- `postinstall` runs `prisma generate`. Editing the schema without regenerating leaves stale client types; run `pnpm db:generate` or any script that does (`typecheck`, `build`, `migrate`).
- Scripts load env via `dotenv -e ../../.env` (the repo-root `.env`). Running raw `prisma` in this dir without that wrapper will miss `DATABASE_URL`. Prefer the `pnpm db:*` scripts.
- Consumed as TS source: there is no compiled output. `typecheck` and `build` both run `prisma generate && tsc --noEmit`.
- Enums are Postgres types. Adding an enum value is a migration; removing or reordering values is breaking and may need a manual data backfill before deploy.
- Local Postgres is Colima/Docker via `pnpm infra:up`; production is Neon. Disk is tight on the dev machine, keep migrations and seed data lean.
- `@oie/db` depends on `@oie/core` (for `IcpProfile` type and the `icpProfile` Zod schema used by the seed). Keep that the only intra-repo dependency direction; do not import orchestration or web back into db.
