# packages/db Plan

> The unified Prisma data model is the moat's system of record: this plan adds the region-native DLD SignalTypes (`transaction_spike`, `off_plan_launch`) with TTLs, extends Suppression to phone plus channel for a future voice opt-out, hardens provenance/freshness as in-DB data contracts, and stages the verify-by-conversation writes. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`@oie/db` is the one Prisma schema, the singleton client, forward-only migrations, and the idempotent ICP seed. Consumed only by `packages/orchestration` and `apps/web`; depends only on `@oie/core` (one-way). Consumed as TS source (`exports["."] = "./src/index.ts"`, no JS emit). `postinstall` runs `prisma generate`. Prisma client is `^6.2.1` (the target doc's "Prisma 7" framing is aspirational; we are on 6, and Part 7 of the architecture says do NOT migrate to Drizzle, so stay on Prisma).

Schema facts that matter for this plan (`prisma/schema.prisma`):

- `enum SignalType { hiring funding tech_adoption job_change news web_change }` (6 values). Mirrored in `packages/core/src/types.ts` `signalTypeValues` and `packages/core/src/signal-windows.ts` `DEFAULT_SIGNAL_TTL_DAYS` (a `Record<SignalType, number>`, so it is exhaustive: adding an enum value WITHOUT adding a TTL is a TS compile error in core).
- `model Signal` already carries the provenance/freshness fields: `provider String` (NOT NULL), `sourceUrl String?`, `evidence Json?`, `strength Float` (0..1 pre-decay), `detectedAt DateTime` (NOT NULL), `expiresAt DateTime?`. Indexed `@@index([companyId, type])` and `@@index([type, detectedAt])`. The decay math lives in `packages/core/src/scoring.ts::signalDecayFactor(detectedAt, expiresAt, now)`; `expiresAt` is computed by `signalExpiry()` in core, never by an adapter.
- `model Suppression { id, email String? @unique, domain String?, reason String, createdAt }` plus `@@index([domain])`. EMAIL + DOMAIN ONLY. No phone, no channel. Consumers: `loadSuppressions()` and the `prisma.suppression.findFirst/upsert` calls in `packages/orchestration/src/sequencing/inngest.ts` and `packages/orchestration/src/enrolment/inngest.ts::handleSuppression`; the match logic is `isSuppressionMatch(suppressions, email, channel)` in `sequencing/send-step.ts`, which today RETURNS EARLY for any non-email channel (`if (channel !== "email" || !email) return { suppressed: false }`). `SuppressionRecord` is `{ email?, domain?, reason }` in `send-step.ts`.
- `model Company` has `sources Json?` (field→provider map) and `raw Json?`. `model Contact` has `sources Json?` (no `raw`). `model CallSession` has `raw Json?`. Provenance is recorded adapter-side as `Record<field, providerName>` (see `places/mapper.ts`, `apollo/mapper.ts`, `hubspot/mapper.ts`, `searchapi/mapper.ts`), matching `FieldSource = Record<string,string>` in `packages/integrations/src/contracts/model.ts`.
- `model AuditLog` is append-only BY CONVENTION ONLY. No DB trigger or revoked grants. Writers use `prisma.auditLog.create` (e.g. `enrolment/inngest.ts`).
- `model CallSession` + `model CallFinding` exist in the schema with the canonical finding keys (`identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`); `consent Boolean @default(true)`, `consentBasis String?`, `optOut Boolean @default(false)`, `demoMode Boolean @default(true)`.

MIGRATION DRIFT (from AGENTS.md, confirmed): the only migration `20260613234107_init` creates 13 tables and does NOT include `CallSession` or `CallFinding`. The schema is ahead of migrations for those two models. A clean `prisma migrate deploy` will not create them. This must be resolved as part of any work that touches call persistence (Task 6 / Later), and is a latent risk for the whole package.

System state (HANDOFF.md, DATA-ACQUISITION.md): paused at Human Gate 2, 0 of 17 keys, zero sends, zero replies, zero CallFindings. DLD is NOT wired. No DLD key exists. NOVA is external and in DEMO_MODE.

## Target architecture for this module (from the research)

This module owns the "data-model seam" (the fourth seam: ONE master DB, Neon Postgres via Prisma) and encodes "the moat" (per-field provenance in `sources`, freshness/decay via `detectedAt`/`expiresAt`, append-only `AuditLog`, `CallFinding`). The architecture's instructions that land HERE:

- Part 5 / Top bet #2: add SignalType enum values for the DLD signals (`transaction_spike` REAL+FREE; `off_plan_launch` only once its free proxy or gated Oqood access is settled) and give them TTLs, BEFORE any adapter maps to them. The schema change must be sequenced ahead of the orchestration/integrations DLD work, but the DLD adapter itself is a `packages/integrations` + `packages/orchestration` build, NOT a `packages/db` build. db's job is only the enum, the TTL, and the (already-present) provenance/freshness columns.
- Part 11 / Top bet #5 (the cheap in-repo compliance half, Now): extend Suppression to carry phone PLUS channel (one Prisma migration), and make AuditLog GENUINELY append-only via a DB trigger or revoked UPDATE/DELETE grants. These deliver most of immudb's tamper-resistance value with no new service, and they must land BEFORE any external tamper-evident ledger (immudb is Later, gated on a Fly/Railway host that does not exist).
- Part 7 (the ONE early data-platform item): express the data-contract idea as PLAIN Prisma/SQL CI tests, not dbt. "Every `Company` field has a corresponding entry in `sources`," plus freshness assertions on `detectedAt`/`expiresAt`. No dbt, no DuckDB, no ClickHouse, no new tool. The analytics OLAP layer is Later and explicitly trigger-gated ("N weeks of real send+reply data").
- Later (DATA-ACQUISITION Section 6 "Later"; DATA-MOAT): verify-by-conversation writes a dialable E.164 mobile to `Contact`, spoken tools to `Company.techStack`, and opt-outs to durable cross-channel `Suppression`, all gated strictly on COMPLIANCE.md + TDRA. The schema is readied now (phone+channel Suppression) so this is a write-path change, not a migration, when it lands.

Anti-corruption holds: vendor shapes never enter the schema. DLD rows arrive as a `NormalisedSignal` (`type: "transaction_spike" | "off_plan_launch"`, `provider: "dld"`, `sourceUrl`, `evidence`, `strength`, `detectedAt`, `expiresAt`) produced by the DLD adapter in `packages/integrations`; db only stores the normalised row.

## Invariants this module must preserve

- Deterministic scoring stays in code. `Score.fit/intent/composite/tier` are written here but computed ONLY by `packages/core`. No LLM output, eval score, or observability score is ever stored as a score. New `SignalType` values feed the deterministic scorer through `SignalFact`; they never carry a model-emitted number. NEVER compute or store an LLM-derived score.
- DRY_RUN default true + mandatory human send-gate. No schema change may default a channel to enabled, default a call to live, or bypass approval: `ChannelAccount.enabled` stays `@default(false)`, `CallSession.demoMode` stays `@default(true)`, `Message.status` keeps `awaiting_approval`. The phone+channel Suppression change makes the gate STRICTER (more opt-outs respected), never looser.
- Vendor shapes never leak into core. No DLD/Oqood/Dubai-Pulse field name enters the schema. The enum gets neutral domain names (`transaction_spike`, `off_plan_launch`); `provider` holds the string `"dld"`; raw payloads (if persisted) go in `evidence`/`raw` JSON, never as columns.
- Secrets only via env/Fly. `DATABASE_URL` stays the only datasource input, via `env("DATABASE_URL")`, loaded by scripts with `dotenv -e ../../.env`. No connection string, no key, no secret in schema, migration, seed, or test. (Note: production secrets live in Vercel env vars per the corrected topology, not flyctl; AGENTS.md still says Fly. Do not print or hardcode either way.)
- UAE PDPL + TDRA gate live voice. The verify-by-conversation writes (Later) and any phone-bearing Suppression write stay gated on COMPLIANCE.md + TDRA; until then DEMO_MODE/DRY_RUN stay on. The phone+channel Suppression schema is readiness, not activation.
- Forward-only migrations; do not adopt the deliberately-NOT items (no Drizzle migration, no ClickHouse/dbt/DuckDB/vector-DB now, no immudb before the append-only Postgres AuditLog and before a Fly host exists).

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

These are the in-repo, near-zero-infra db wins the architecture sequences into "Now". Tasks 1, 2, 3 are independent; Task 4 depends on Task 1; Task 5 is the data-contract CI tests. Tasks 1, 2, 4, 5 are the four "Now" db deliverables; Task 3 (append-only AuditLog) is the third compliance-trio item that also lands now.

### Task 1 (S): Add the `transaction_spike` SignalType enum value + its TTL

The free, real DLD differentiator. Add ONLY `transaction_spike` now (`off_plan_launch` is Task 4, gated). The enum lives in two mirrored places that must change together, plus the TTL map in core.

`packages/db/prisma/schema.prisma`:
```prisma
enum SignalType {
  hiring
  funding
  tech_adoption
  job_change
  news
  web_change
  transaction_spike // DLD registered-transaction volume spike (Dubai Pulse open data); region-native intent
}
```

`packages/core/src/types.ts`:
```ts
export const signalTypeValues = [
  "hiring",
  "funding",
  "tech_adoption",
  "job_change",
  "news",
  "web_change",
  "transaction_spike",
] as const;
```

`packages/core/src/signal-windows.ts` (the `Record<SignalType, number>` is exhaustive, so this WILL fail to compile until you add the entry):
```ts
export const DEFAULT_SIGNAL_TTL_DAYS: Record<SignalType, number> = {
  funding: 90,
  tech_adoption: 60,
  job_change: 45,
  hiring: 30,
  news: 30,
  web_change: 21,
  transaction_spike: 14, // a transaction spike is a "this week/fortnight" timing signal; short TTL keeps it hot
};
```

Generate the migration:
```bash
pnpm infra:up
pnpm --filter @oie/db exec dotenv -e ../../.env -- prisma migrate dev --name add_transaction_spike_signal_type
```
The generated SQL must be exactly an `ALTER TYPE "SignalType" ADD VALUE 'transaction_spike';` (Postgres enum add-value; non-breaking, forward-only). Commit the SQL under `prisma/migrations/`; never hand-edit it.

TTL rationale (cite at the call site): the DATA-ACQUISITION thesis is "transaction spike THIS WEEK"; a 14-day TTL means the signal decays to zero ~2 weeks after detection via `signalDecayFactor`, matching the "fresh enough to call now" claim. Reconfirm against the spike's finding on data freshness (Part 5: "how stale is open?"); if open data lags more than ~14 days, raise the TTL or re-ground the claim per the architecture's warning.

Acceptance check:
- `pnpm db:generate` succeeds; `prisma.signal.create({ data: { type: "transaction_spike", ... } })` typechecks.
- `pnpm --filter @oie/core typecheck` passes (proves the TTL map is exhaustive again).
- `pnpm --filter @oie/core test` passes; `signalExpiry("transaction_spike", new Date("2026-06-01"))` returns `2026-06-15`.
- The new migration is `ALTER TYPE ... ADD VALUE`, forward-only, committed.

### Task 2 (S): Extend Suppression to phone + channel (cross-channel opt-out readiness)

Make a future voice/WhatsApp opt-out write ONE durable cross-channel suppression. Keep email/domain working unchanged.

`packages/db/prisma/schema.prisma`:
```prisma
model Suppression {
  id        String   @id @default(cuid())
  email     String?
  domain    String?
  phone     String?  // E.164, for voice/WhatsApp opt-out (verify-by-conversation, Later)
  channel   Channel? // null = applies to ALL channels; set = scoped to one channel
  reason    String
  createdAt DateTime @default(now())

  @@unique([email, channel])
  @@unique([phone, channel])
  @@index([domain])
  @@index([phone])
}
```
Note the deliberate change: the old `email String? @unique` becomes a COMPOSITE unique `@@unique([email, channel])` so the same email can be suppressed per-channel and globally. This changes the `handleSuppression` upsert key in `packages/orchestration/src/enrolment/inngest.ts` (currently `where: { email }`) to `where: { email_channel: { email, channel: null } }`. That consumer edit is in scope for THIS task (grep-then-edit per AGENTS.md), because the unique key is a contract.

Migration:
```bash
pnpm --filter @oie/db exec dotenv -e ../../.env -- prisma migrate dev --name suppression_phone_channel
```
Because the table is empty in every environment (zero sends ever), the unique-key change is safe; the generated SQL will drop `Suppression_email_key`, add `phone` and `channel` columns, and add the two composite uniques plus the `phone` index. Confirm the SQL drops the old unique before adding the composite; if Prisma orders it wrong on a non-empty DB, that is a future concern only (table is empty now).

Consumer edits (same change, per AGENTS.md "update the consumers in the same change"):
- `packages/orchestration/src/sequencing/send-step.ts`: extend `SuppressionRecord` to `{ email?, domain?, phone?, channel?, reason }`; extend `isSuppressionMatch` so that for `channel === "whatsapp"` it matches on `phone` (and a record with `channel == null` matches ANY channel, a record with `channel == X` matches only channel X). Email/domain behaviour for `channel === "email"` is unchanged.
- `packages/orchestration/src/enrolment/inngest.ts::handleSuppression`: update the upsert `where` to the new composite key with `channel: null` (a bounce/unsubscribe suppresses across all channels).
- `loadSuppressions()` in `sequencing/inngest.ts`: include `phone` and `channel` in the `select`.

Acceptance check:
- `prisma.suppression.create({ data: { phone: "+9715...", channel: "whatsapp", reason: "voice opt-out" } })` typechecks and inserts.
- `isSuppressionMatch` unit test: a `{ phone, channel: "whatsapp" }` record suppresses a WhatsApp send to that phone and does NOT suppress an email send; a `{ email, channel: null }` record suppresses email AND would suppress any channel for that identity.
- `pnpm --filter @oie/orchestration test` and `pnpm --filter @oie/orchestration typecheck` pass.
- DRY_RUN/gate behaviour is unchanged except STRICTER (more matches), never looser.

### Task 3 (S): Make Postgres AuditLog genuinely append-only (trigger, not convention)

Deliver most of immudb's tamper-resistance with no new service, BEFORE any external ledger. Insert stays allowed; UPDATE and DELETE are blocked at the DB.

Generate an EMPTY migration and write the trigger SQL by hand (this is the one allowed hand-authored migration, because Prisma cannot express a trigger; it is additive and forward-only):
```bash
pnpm --filter @oie/db exec dotenv -e ../../.env -- prisma migrate dev --create-only --name auditlog_append_only
```
Then put this in the generated `migration.sql`:
```sql
-- AuditLog is append-only: block UPDATE and DELETE at the database.
CREATE OR REPLACE FUNCTION oie_block_auditlog_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER auditlog_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION oie_block_auditlog_mutation();

CREATE TRIGGER auditlog_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION oie_block_auditlog_mutation();
```
Apply it: `pnpm db:migrate` (or `prisma migrate deploy` in CI). Add a Prisma-schema doc-comment on `model AuditLog` noting the trigger guard so the schema stays self-documenting, but do NOT try to model the trigger in Prisma.

Why a trigger over revoked grants: the app connects as the Neon owner role, so revoking UPDATE/DELETE from that role is impractical; a `BEFORE` trigger blocks mutation regardless of role and is visible in the migration history for a buyer data room. (Revoked grants remain a defensible alternative if a separate low-privilege app role is later introduced.)

Acceptance check:
- New CI test (`src/auditlog-append-only.test.ts`): insert one `AuditLog` row (passes); `prisma.auditLog.update(...)` and `prisma.auditLog.delete(...)` each REJECT with the `restrict_violation` exception. Skips cleanly if no `DATABASE_URL` (so unit CI without a DB stays green; DB-backed CI exercises it).
- `pnpm --filter @oie/db test` passes (DB-present path proves the block; DB-absent path skips).
- The migration is committed and applies via `prisma migrate deploy` without error.

### Task 4 (S, gated): Add `off_plan_launch` SignalType + TTL: ONLY once its source is settled

Do NOT ship this until the architecture's Part-5 resolution is decided: (a) PREFERRED free proxy from the same open transaction/registration datasets (first-registration spike), or (b) FALLBACK gated Oqood access (blocked on DLD-business onboarding). Per the architecture: "Add `off_plan_launch` only once its source is settled per (a) or (b)." The schema mechanics are identical to Task 1.

When unblocked, mirror the three-place change:
```prisma
enum SignalType {
  // ...existing values, transaction_spike...
  off_plan_launch // new off-plan project first-registration spike (free DLD open-data proxy, or gated Oqood)
}
```
`packages/core/src/types.ts`: append `"off_plan_launch"` to `signalTypeValues`. `packages/core/src/signal-windows.ts`: add `off_plan_launch: 30` (a launch is relevant for roughly a month; reconfirm against the chosen source's cadence). Migration name `add_off_plan_launch_signal_type`, again an `ALTER TYPE ... ADD VALUE`.

Acceptance check: same shape as Task 1 (typecheck, exhaustive TTL map, `signalExpiry` test, `ALTER TYPE ADD VALUE` migration), AND a one-line note in the migration body or PR recording WHICH source ((a) free proxy or (b) gated Oqood) backs the signal, so provenance is auditable. If neither source is settled, this task stays BLOCKED and is not shipped: do not add an enum value with no real source behind it.

### Task 5 (S): Plain Prisma/SQL data-contract CI tests (provenance + freshness)

The ONE early data-platform item, expressed as Vitest, NOT dbt. Lives in `packages/db/src/`. These assert the moat's invariants directly against the live schema/data, giving the buyer-data-room provenance story with no new tool.

Create `packages/db/src/data-contracts.test.ts` with these assertions (all skip cleanly when `DATABASE_URL` is absent, so non-DB CI stays green):

1. Provenance completeness: for every `Company` row, every non-null business field (`domain, name, website, industry, employeeCount, revenueBand, country, region, lat, lng, placeId, localCategory`, and each `techStack` entry) has a key in `sources` (the `Record<field, provider>` JSON). A `Company` with a populated field but no `sources` entry for it FAILS the contract. Same assertion for `Contact.sources`.
2. Signal provenance: every `Signal` row has a non-empty `provider`, and `detectedAt` is not null (DB-enforced, but assert anyway as a contract).
3. Freshness/decay coherence: for every `Signal` with a non-null `expiresAt`, assert `expiresAt > detectedAt`; and assert `expiresAt` equals `signalExpiry(type, detectedAt)` from core within tolerance (catches an adapter that set its own expiry, which AGENTS.md forbids).
4. No fabricated score: every `Score` row has a non-empty `modelVersion` and a `rationale` JSON (provenance for the deterministic number); the test does NOT recompute the score (that is core's job), it only asserts the provenance fields are present.

Add a unit-level companion (no DB needed) that asserts `DEFAULT_SIGNAL_TTL_DAYS` has an entry for EVERY value in `signalTypeValues` (defence-in-depth beyond the TS exhaustiveness, so a future enum addition without a TTL fails a TEST too, with a clear message).

Wire it into the existing `test` script (it already runs `vitest run`); no new turbo task needed.

Acceptance check:
- `pnpm --filter @oie/db test` passes against a seeded local DB and skips cleanly with no `DATABASE_URL`.
- Deliberately inserting a `Company` with `industry` set but no `sources.industry` makes test (1) FAIL (proves the contract bites).
- Deliberately inserting a `Signal` with `expiresAt < detectedAt` makes test (3) FAIL.

## Next (1 to 3 months)

- Resolve the migration drift for `CallSession`/`CallFinding`: generate and commit the missing `add_call_session_finding` migration so `prisma migrate deploy` builds those tables. This is a prerequisite for ANY verify-by-conversation write (Later) and for the call-findings reads `apps/web` expects. Effort S, but must precede call persistence.
- When the DLD adapter (a `packages/integrations` build, NOT db) lands behind the existing `SignalProvider` contract, db's only follow-up is confirming the `transaction_spike`/`off_plan_launch` rows persist with `provider: "dld"`, full `evidence`/`sourceUrl` provenance, and `expiresAt` from core's `signalExpiry` (never adapter-set). Add `@@index([provider, detectedAt])` on `Signal` only if a live DLD-volume query path needs it.
- Provenance richness (optional, only if a buyer data room asks): consider promoting `sources` from `Record<field, provider>` to `Record<field, { provider, sourceUrl, fetchedAt }>` for per-field freshness, but ONLY behind a normalised DTO change in `contracts/model.ts` first; do not let it sprawl. Defer unless a concrete need appears.
- Fail-closed compliance contracts staging: when the NOVA-go-live track starts (TDRA-gated), the `ConsentStore`/`SuppressionProvider`/`AuditSink` ports live in `packages/integrations`, but their Prisma-backed default implementations read/write THIS schema (`Suppression` phone+channel, `AuditLog` append-only, `CallSession.consent/consentBasis`). The schema is already ready from the Now tasks; this is the consumer wiring, not a migration.

## Later (post-PMF, gated)

- Verify-by-conversation writes (DATA-ACQUISITION Section 6 Later; DATA-MOAT): on consented, TDRA-approved NOVA calls, `ingestCallResult` writes a dialable E.164 `Contact.phone`/`whatsapp` (with `sources` provenance = `"nova"`), spoken tools to `Company.techStack`, and opt-outs to the cross-channel `Suppression` (phone+channel, from Task 2). Gated strictly on COMPLIANCE.md: TDRA approval, licence-registered caller-ID, DNCR fail-closed, recording + AI-caller disclosure, cross-border basis. Until all true, DEMO_MODE and DRY_RUN stay on. This is a write-path change on the schema this plan readies, not a new migration.
- immudb (cryptographically tamper-evident ledger) as a MIRROR of the append-only `AuditLog`: only AFTER Task 3 is in place AND a Fly/Railway host exists (it does not today) AND there is a real consent/disclosure event to record. Never before the in-DB trigger.
- Skyflow UAE/Bahrain `PiiVault`: tokenize `Contact.phone/whatsapp/email` and `CallSession.transcript` at the DB boundary, detokenize only at send-adapter egress under the send-gate. db-side, this means storing tokens (not plaintext) in those columns; the deterministic scorer never needs plaintext. Adopt at live-PSTN activation; no work to do before a real send.
- pgvector inside Neon (Part 3/7): a `KnowledgeChunk` Prisma model with `source, sourceUrl, contentHash, updatedAt, embedding`, plus model-id/dimension per chunk, ONLY when the canon corpus outgrows the context window. Not now; pgvector is not in the lockfile.
- Analytics OLAP (Part 7): no schema change here; the warehouse is downstream, read-only, service-isolated, behind an `AnalyticsStore` port, fed by CDC from Neon. Trigger: "N weeks of real send+reply data worth a cohort question." Do NOT add OLAP tables to this OLTP schema.

## Contracts / interfaces touched (exact names)

- `prisma/schema.prisma`: `enum SignalType` (add `transaction_spike`; later `off_plan_launch`); `model Suppression` (add `phone`, `channel`; change unique to `@@unique([email, channel])` + `@@unique([phone, channel])` + `@@index([phone])`); `model AuditLog` (doc-comment for the append-only trigger).
- `packages/core/src/types.ts`: `signalTypeValues` (const tuple), `signalType` (Zod enum), `SignalType` (type).
- `packages/core/src/signal-windows.ts`: `DEFAULT_SIGNAL_TTL_DAYS: Record<SignalType, number>`, `signalExpiry()`.
- `packages/orchestration/src/sequencing/send-step.ts`: `interface SuppressionRecord`, `isSuppressionMatch(suppressions, email, channel)` (extend for phone+channel).
- `packages/orchestration/src/enrolment/inngest.ts`: `handleSuppression` upsert `where` (new composite key).
- `packages/orchestration/src/sequencing/inngest.ts`: `loadSuppressions()` select.
- New migrations (forward-only): `add_transaction_spike_signal_type`, `suppression_phone_channel`, `auditlog_append_only`, (gated) `add_off_plan_launch_signal_type`, (Next) `add_call_session_finding`.
- New tests: `packages/db/src/data-contracts.test.ts`, `packages/db/src/auditlog-append-only.test.ts`.
- Unchanged exports (`@oie/db` public surface): `prisma`, `seedIcp`, `* from "@prisma/client"`. No new export is required; consumers get the new enum value and Suppression fields through the regenerated `@prisma/client`.

## Verification (how each task is proven done)

Per-task acceptance checks above, plus the repo gate.

- Task 1: `pnpm --filter @oie/core typecheck` (exhaustive TTL map) + `pnpm --filter @oie/core test` (`signalExpiry("transaction_spike", ...)`) + `pnpm db:generate` + the migration is `ALTER TYPE ... ADD VALUE`.
- Task 2: `pnpm --filter @oie/orchestration typecheck` + `pnpm --filter @oie/orchestration test` (`isSuppressionMatch` phone/channel cases) + a DB insert of a phone+channel row.
- Task 3: `pnpm --filter @oie/db test` (insert passes; update/delete reject with `restrict_violation`) + the trigger migration applies via `prisma migrate deploy`.
- Task 4 (gated): same as Task 1, plus a recorded source decision ((a) or (b)).
- Task 5: `pnpm --filter @oie/db test` against a seeded DB (and clean skip with no `DATABASE_URL`); a deliberately-bad row fails the relevant contract.
- Whole-package and repo gate: `pnpm --filter @oie/db typecheck && pnpm --filter @oie/db test`, then `pnpm verify` (typecheck + lint + test + build across the monorepo) MUST pass before claiming done.
- Migration hygiene: every new migration is forward-only and committed; `prisma migrate deploy` against a fresh DB applies them in order. NEVER `prisma migrate reset`, `db push`, or `migrate dev` against a shared/production DB.
- Curl/end-to-end is N/A for db (no HTTP surface); proof is typecheck + Vitest + a clean `migrate deploy`.

## Risks and do-not

- Postgres `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block in older PG and the new value is not usable in the SAME transaction it is added; Prisma handles this, but if you ever write enum-add SQL by hand, keep it as its own migration and do not reference the new value in the same file. Confirm against the Neon PG version at apply time.
- Suppression unique-key change (`email @unique` -> `@@unique([email, channel])`) is breaking for the `handleSuppression` upsert. It is SAFE now only because the table is empty (zero sends ever). Do NOT defer the consumer edits to a later PR: ship schema + consumers together (AGENTS.md). On a future non-empty DB, an analogous change would need a data backfill plan.
- Migration drift on `CallSession`/`CallFinding` is a latent trap: do not build any verify-by-conversation write (Later) until the missing `add_call_session_finding` migration is generated and committed (Next), or `prisma migrate deploy` will silently lack those tables.
- Do NOT add `off_plan_launch` (Task 4) until its free proxy or gated Oqood source is settled; an enum value with no real source behind it is fiction the architecture explicitly forbids. Gate it on the 1-day DLD spike (freshness + licensing) passing first.
- Do NOT migrate Prisma to Drizzle, do NOT add ClickHouse/dbt/DuckDB/a vector DB/OLAP tables to this OLTP schema, and do NOT stand up immudb before the in-DB append-only AuditLog (Task 3) and before a Fly/Railway host exists. All are deliberately-NOT-now items.
- Do NOT store any LLM-derived number as a `Score`, and do NOT let a DLD/Dubai-Pulse/Oqood vendor field name into the schema (normalise in the adapter; persist raw only in `evidence`/`raw` JSON).
- Do NOT default any channel to enabled, any call to live, or any field to bypass approval. The phone+channel Suppression change must only ever make the send-gate stricter.
- AGENTS.md says production secrets live in Fly; the corrected topology (TARGET-ARCHITECTURE Part 10) is Vercel env vars. Either way: never print, hardcode, or commit `DATABASE_URL` or any key; keep `env("DATABASE_URL")` the only datasource input. (Flag the AGENTS.md Fly reference for a docs follow-up, out of scope here.)
