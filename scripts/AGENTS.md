# AGENTS.md: `scripts/` (operator scripts)

Operating guide for an AI agent working in `/Users/Amir/outbound-intelligence-engine/scripts`. Read this fully before editing. It is specific to this directory; the repo-wide rules in `/CLAUDE.md` and `/PROJECT_BRIEF.md` still apply on top.

## Purpose

`scripts/` holds **operator scripts**: one-shot, human-invoked entry points the owner (`gp@humai.ae`, HumAI Dubai) runs from a terminal to drive the Huscribe Revenue OS pipeline against real or fixture data. They are not part of the deployed app (`apps/web` on Fly.io) and not part of the production send-path. They exist to discover leads, seed config, verify adapters, and (the headline) **place NOVA voice calls and fold the results back into the master database**.

The flagship script is **`nova-call.ts`**: it dogfoods Huscribe's own production voice agent (NOVA, `api.novalabs.ae`) to VERIFY + DISCOVER + PITCH a lead on a call, persists a `CallSession` + `CallFinding` rows, and enriches `Company`/`Contact` from the consented facts captured on the call. This is the "verify-by-conversation" moat: the calls that build the database ARE the product.

## Key files & where things live

| File | What it does | Live or fixture |
| --- | --- | --- |
| `nova-call.ts` | Place NOVA calls (`POST /calls`), poll (`GET /calls/{id}`), ingest findings, enrich master DB, write `AuditLog`. **The primary file.** | LIVE NOVA (DEMO_MODE: no PSTN), LIVE DB |
| `discover-live.ts` | Full discovery pipeline against LIVE providers (SearchApi/Places -> Apollo -> TheirStack -> deterministic score -> Claude opener) -> writes companies/contacts/signals/scores + `awaiting_approval` messages to Neon. Refuses to run unless `DRY_RUN=true`. | LIVE providers + DB |
| `seed-huscribe-icp.ts` | Upsert + activate the Huscribe UAE-real-estate ICP profile (deactivates all others). | LIVE DB, no providers |
| `seed-production.ts` | Run every adapter's REAL code path against its recorded fixture, push through the real pipeline, persist to Neon. Nothing sends. | Fixtures + LIVE DB |
| `verify-adapters-live.ts` | One READ-ONLY live call per adapter whose key is present; senders/CRM checked for config only, never a send/write. | LIVE providers, no DB |
| `phase10-pilot-dryrun.ts` | In-memory full-pipeline proof that nothing sends (everything lands in the approval queue). `make pilot` runs this. | Pure fixtures, no DB, no providers |
| `phase4-signals-demo.ts` | Evidence that a dated signal moves the intent score. Fixture SignalProvider, local Postgres. | Fixture + LIVE DB |
| `gate1-credentials.ts` | Human Gate 1: report which provider keys are present vs missing. Never prints values. | env only |
| `sync-keys-to-vercel.sh` + `_set_vercel_env.py` | Push present `.env` keys to the Vercel project (production target only) without ever printing a value. | Vercel API, secrets |

There is **no `package.json`, no `tsconfig.json`, no `src/` inside `scripts/`.** These are standalone `tsx` entry points. They import workspace packages directly by relative path to their TS source, for example `../packages/db/src/index`, `../packages/core/src/index`, `../packages/integrations/src/index`, `../packages/orchestration/src/index`, `../packages/config/src/index`.

## Public contracts / exports

Scripts have **no exports**. They are top-level programs: each ends with `main().catch(...)` and sets `process.exitCode = 1` on failure. Treat each file as a CLI, not a library. Nothing imports from `scripts/`.

What they consume (the real contracts you must respect):

- `prisma`, `Prisma`, and all Prisma model types from `@oie/db` via `../packages/db/src/index`.
- Scoring: `icpProfile` (Zod), `scoreLead`, `SCORING_MODEL_VERSION`, `rankByComposite`, `type IcpProfile`, `type ScoringSubject` from `../packages/core/src/index`. **The deterministic scoring engine. The LLM never scores.**
- Adapters + `LlmClient` + `MODEL_IDS` + normalised types + `stubTransport` from `../packages/integrations/src/index`.
- `collectSignals`, `toScoringSubject`, `executeSendStep`, `qualifiesForEnrolment` from `../packages/orchestration/src/index`.
- `loadEnv`, `providerKeyStatus` from `../packages/config/src/index`.

### NOVA HTTP contract (as used by `nova-call.ts`)

- `GET /health` -> `{ status? }`. Health-checked first; script exits 1 if unreachable.
- `POST /calls` body: `{ owner_email, product, leads:[{phone,name,website?}], context, goal:"qualify_interest", language:"en", goal_criteria, consent:true, idempotency_key }` -> `{ calls:[{ call_id, context_id, phone? }] }`.
- `GET /calls/{id}` -> arbitrary JSON payload; the script defensively reads `status`, `transcript`, `summary`, `outcome` (string or `.result`), `cost_usd`/`cost`, and `findings`/`outcome.findings`/`data.findings`.
- Auth: `place_calls`/`get_call` are PUBLIC. `NOVA_API_KEY` (Bearer) is optional and only unlocks account features; **its presence is also the signal for `demoMode = !NOVA_KEY`.**

### Canonical finding keys (the only keys persisted)

`identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`. Anything else NOVA returns is dropped. These match the `CallFinding.key` comment in the schema.

### Env consumed by `nova-call.ts`

`NOVA_API_BASE` (default `https://api.novalabs.ae`), `NOVA_API_KEY` (optional), `NOVA_OWNER_EMAIL` (default `gp@humai.ae`), plus `DATABASE_URL` (via Prisma). All documented in `/.env.example`.

## Invariants (YOU MUST / NEVER)

These are non-negotiable. They encode the product's hard rules and the PDPL/TDRA posture.

- **YOU MUST keep scoring deterministic.** The LLM never computes a score. Use `scoreLead` from `@oie/core`. NEVER derive fit/intent/composite/tier from an LLM call or by hand.
- **NEVER persist a fabricated fact.** A missing field yields NO finding and NO enrichment. `extractFindings` already enforces this (skips null/undefined/empty, only canonical keys). Preserve that. Missing data = unknown, never guessed.
- **YOU MUST gate every enrichment on consent.** `ingestCallResult` returns early when `session.consent` is false, before any `Contact`/`Company`/`Signal` write. Never move an enrichment write above that guard.
- **YOU MUST honour opt-out.** `optOut` is derived from the `opt_in` finding and stored on `CallSession`. Do not silently re-contact opted-out rows.
- **NEVER send or dial on any channel without explicit human approval AND a passing dry-run.** `discover-live.ts` only ever writes messages as `status: "awaiting_approval"`. NOVA stays in DEMO_MODE (agent joins a LiveKit room, no real PSTN) until the NOVA owner flips it on; do not add code that flips it or assumes live dialing.
- **NEVER set `DRY_RUN=false` or weaken the `DRY_RUN` guard** in `discover-live.ts` (it throws unless `DRY_RUN=true`). Do not add a script that disables the send gate. The repo's guard hook refuses content containing the literal disable token, even in docs; reword, never bypass.
- **NEVER print, log, hardcode, or commit a secret.** Keys come only from env. `gate1-credentials.ts` and the Vercel sync scripts deliberately pass values through the environment and never echo them. Keep it that way.
- **YOU MUST validate external/LLM input at the boundary.** Parse ICP config with `icpProfile.parse(...)`. Treat NOVA payloads as untrusted: keep the defensive, type-narrowing reads in `nova-call.ts`; never trust a shape blindly.
- **YOU MUST write `phone`/`whatsapp` as E.164.** Use `toE164(...)`. Toll-free/landline/short numbers return `null` and must be skipped (that is the whole reason the verify-call captures a real `mobile`).
- **NEVER let vendor shapes leak into core.** Adapters live behind contracts in `packages/integrations`; scripts call adapters, they do not reimplement provider logic.
- **YOU MUST keep `idempotency_key` and `novaCallId` as the idempotency anchors.** `CallSession.novaCallId` is `@unique`; upsert on it. Findings are replaced via `deleteMany` then `createMany` keyed on `callSessionId` (idempotent re-ingest). Preserve this.
- **YOU MUST audit material actions.** `nova-call.ts` and `discover-live.ts` write an `AuditLog` row. Keep that for any new operator action.

## How to make a change safely

1. **Read the target script top-to-bottom first.** Each has a docstring header with its exact run command and safety stance. Believe it.
2. **Confirm the data contract** against `packages/db/prisma/schema.prisma` (models `CallSession`, `CallFinding`, `Company`, `Contact`, `Signal`, `Score`, `Message`, `AuditLog`). If you touch a field, grep the schema for it; do not invent columns.
3. **Make the edit.** Keep TS strict, no `any` without a one-line reason, no em dashes, prefer the simplest approach.
4. **Typecheck.** Scripts are NOT in the root `tsconfig.json` `references`, so `pnpm typecheck` does not cover them. Typecheck a script directly:
   `pnpm exec tsc --noEmit -p tsconfig.base.json scripts/nova-call.ts` is not wired; the practical check is to run the script (tsx transpiles) or run `pnpm exec tsx --check scripts/<file>.ts` mentally via a dry invocation. At minimum run `pnpm verify` for the packages you imported from, since a bad import surfaces there.
5. **Lint/format** the file: `pnpm lint` and `pnpm format` (Prettier). Keep the existing `eslint-disable no-console` blocks; these scripts legitimately log to the operator console.
6. **Run it in the safest mode that proves the change:**
   - Pure-fixture, no side effects: `pnpm exec tsx scripts/phase10-pilot-dryrun.ts` (or `make pilot`).
   - DB-touching: ensure `pnpm infra:up` and `pnpm db:migrate`/`db:seed` first, then `pnpm exec tsx --env-file=.env scripts/<file>.ts`.
   - NOVA: `pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +9715XXXXXXXX --name "Test"`. This stays in DEMO_MODE unless a key is set; it does not place a real PSTN call.
7. **Verify nothing leaked the gate:** confirm new messages are `awaiting_approval`, no secret was printed, no fabricated finding was written, the `AuditLog` row exists.

## Do / Don't

**Do**
- Run scripts with `pnpm exec tsx --env-file=.env scripts/<file>.ts` (the `--env-file=.env` is how secrets reach the process).
- Keep new operator scripts standalone (`main()` + `process.exitCode`), importing packages by `../packages/<pkg>/src/index`.
- Reuse `toE164`, `extractFindings`, `affirmative`, and the `nova()` fetch helper rather than re-rolling them.
- Disconnect Prisma (`await prisma.$disconnect()`) in a `finally` or at the end of `main`.
- Update `/.env.example` when you add a new env key (and only there).

**Don't**
- Don't add a `package.json`/`tsconfig.json` inside `scripts/` (these run under the repo root config via tsx).
- Don't import from another script; scripts are leaves.
- Don't widen the canonical finding-key set without updating the `CallFinding.key` schema comment and the README. New keys must be facts NOVA can actually return.
- Don't make `discover-live.ts` or any pipeline script send; the only legitimate message status from a script is `awaiting_approval`.
- Don't add real provider keys to preview/development Vercel targets; `_set_vercel_env.py` is production-only by design (least privilege).
- Don't introduce em dashes in any user-visible string or prompt.

## Worked examples

### 1) Add a new canonical finding (e.g. `budget_band`)

1. Decide it is a fact NOVA can return on a call, with consent. If it can't, stop.
2. In `nova-call.ts`, add `"budget_band"` to the `CANONICAL` set in `extractFindings`. That is enough to persist it as a `CallFinding`.
3. Only if it should enrich the master DB: add an enrichment branch BELOW the `if (!session.consent) return;` guard, writing to the correct `Company`/`Contact`/`Signal` field. Skip-on-empty, never overwrite a better existing value blindly.
4. Update the `CallFinding.key` comment in `packages/db/prisma/schema.prisma` (a comment-only edit, no migration needed) and the README's finding-key list.
5. Re-run `nova-call.ts --phone ...` in DEMO_MODE and confirm the new finding row appears and the enrichment is gated on consent.

### 2) Place a NOVA call to one number and ingest the result

```
pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +971501234567 --name "Ahmed"
```

What happens: health check -> normalise to E.164 -> `POST /calls` (consent:true, goal qualify_interest) -> upsert a `pending` `CallSession` (`demoMode = !NOVA_API_KEY`) -> poll `GET /calls/{id}` for ~30s -> on completion, `ingestCallResult` updates the session (status, transcript, summary, outcome, costUsd, optOut, full `raw`), replaces `CallFinding` rows, and (consent permitting) enriches `Contact.phone/whatsapp` from `mobile` and `Company.techStack` + a `tech_adoption` `Signal` from `tools` -> writes an `AuditLog`. No PSTN dial in DEMO_MODE.

Without `--phone`, the script pulls up to `min(limit, 5)` leads from `Message` rows with `status: "awaiting_approval"`, dropping any contact whose number is not a dialable mobile E.164. The first positional integer arg is the limit (default 3).

## Gotchas

- **DEMO_MODE is keyed off `NOVA_API_KEY`.** `demoMode = !NOVA_KEY`. Setting a key flips `demoMode` to false on persisted sessions, but real PSTN dialing also requires the NOVA owner to enable it server-side. Do not assume a key alone means live calls; do not rely on `demoMode` as your only safety check.
- **NOVA payload shape is not guaranteed.** That is why `extractFindings`/`ingestCallResult` read several plausible locations and narrow types. Keep them defensive; a `JSON.parse` on an unexpected shape must not crash ingestion (note the `.catch` wrappers).
- **Most queued numbers are not dialable.** UAE switchboards (`800...`, `04...`) return `null` from `toE164`, so `nova-call.ts` with no `--phone` often finds zero leads and prints guidance. That is expected, not a bug; the call itself is what captures a real mobile.
- **Scripts read packages as TS source, not built output.** A breaking change in `packages/*/src` breaks scripts immediately even if `dist` is stale. Run against current source.
- **`prisma generate` is a `@oie/db` postinstall.** If Prisma types are missing, `pnpm install` (or `pnpm db:generate`) fixes it; do not work around it in a script.
- **`tools` enrichment merges, never replaces.** It unions into `Company.techStack` and creates a `tech_adoption` signal with strength = finding confidence or `0.6`. Keep the union semantics so repeat calls don't clobber prior data.
- **`discover-live.ts` hard-refuses unless `DRY_RUN=true`.** If it throws on startup, that is the gate working. Set `DRY_RUN=true`, do not weaken the check.
- **Findings re-ingest is destructive then rebuilt.** `deleteMany` + `createMany` on `callSessionId` means re-polling the same call replaces its findings. Intentional for idempotency; don't append instead.
- **No automated tests cover `scripts/`.** The package tests live in `packages/*`. Your safety net is running the script in fixture/DEMO mode and inspecting the DB (`pnpm db:studio`).

## See also

- `/CLAUDE.md`, repo operating memory and hard rules.
- `packages/db/prisma/schema.prisma`, the source of truth for `CallSession`, `CallFinding`, and every model these scripts write.
- `/.env.example`, every env key, including the `NOVA_*` block.
- `/RUNBOOK.md`, operations and the evidence-script list.
- `scripts/README.md`, human-facing overview of this directory.
