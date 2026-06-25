# scripts Plan

> Operator and data tooling: hand-build the compliant Dream-20-to-40 target list from the UAE public-source cascade, seed it, and keep the eval/voice tooling honest. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`scripts/` is a flat set of standalone `tsx` entry points. No `package.json`, no `tsconfig.json`, no `src/`, no tests. Each file is a CLI: a docstring header, a `main()`, `process.exitCode = 1` on failure, `prisma.$disconnect()` in `finally`. They import workspace packages directly by relative path (`../packages/<pkg>/src/index`). Nothing imports from `scripts/`. Confirmed against `scripts/AGENTS.md` and `scripts/README.md`.

Inventory today:
- `nova-call.ts` (flagship): places NOVA calls against `api.novalabs.ae`, polls, ingests canonical findings, enriches the master DB on consent, writes `AuditLog`. DEMO_MODE keyed off `!NOVA_API_KEY`; no real PSTN. Reuses `affirmative`, `extractFindings` from `packages/integrations/src/nova/findings`.
- `discover-live.ts`: live pipeline (SearchApi/Places -> Apollo -> TheirStack -> deterministic `scoreLead` -> Claude opener) -> `awaiting_approval` Message rows + Score + Signal + ProviderCost + AuditLog. Hard-refuses unless `DRY_RUN=true` (line 83). Contacts are explicitly SYNTHETIC (`@unknown.invalid`, switchboard phone), never fabricated people.
- `seed-huscribe-icp.ts`: upserts and activates the `huscribe-uae-realestate` ICP via `icpProfile.parse`, deactivates all others, writes AuditLog.
- `seed-production.ts`, `verify-adapters-live.ts`, `phase10-pilot-dryrun.ts`, `phase4-signals-demo.ts`: fixture/read-only/proof scripts.
- `gate1-credentials.ts`: prints present/missing provider keys via `providerKeyStatus`, never values.
- `sync-keys-to-vercel.sh` + `_set_vercel_env.py`: push present `.env` keys to the Vercel production target, never echoing a value.

Grounding facts that constrain this plan:
- `signalTypeValues` in `packages/core/src/types.ts` is `["hiring","funding","tech_adoption","job_change","news","web_change"]`. There is NO `transaction_spike` and NO `off_plan_launch` yet.
- `DEFAULT_SIGNAL_TTL_DAYS` in `packages/core/src/signal-windows.ts` is a `Record<SignalType, number>`, so it is exhaustive: a new SignalType is a compile error until it gets a TTL.
- Discovery providers expose `discoverCompanies(query: CompanyQuery, ctx: AdapterContext): Promise<NormalisedCompany[]>` (`SearchApiAdapter`, `PlacesAdapter`). `EnrichmentProvider` / `SignalProvider` contracts live in `packages/integrations/src/contracts/interfaces.ts`. `NormalisedSignal` carries `sourceUrl`, `provider`, `evidence`, `detectedAt`, `expiresAt`.
- `PROVIDER_KEYS` and the env schema live in `packages/config/src/schema.ts` (`optionalSecret` pattern); `GOOGLE_MAPS_API_KEY` and `SEARCHAPI_API_KEY` are already there. No `DUBAI_PULSE_*` key exists.
- Eval harness is `packages/integrations/src/llm/evals/{runner.ts,cases.ts}`: code-predicate assertions, `runFn` injected so CI is fixture-safe. No promptfoo, no Ax. `promptfoo`, `@ax-llm/ax`, and any CSV parser are NOT in `pnpm-lock.yaml` (verified).
- `tsx` IS in root `devDependencies`. Scripts are NOT in the root `tsconfig.json` references, so `pnpm typecheck` does not cover them.

Note: `README.md`/`AGENTS.md` here still say the deployed unit is Fly.io `fra`. TARGET-ARCHITECTURE.md corrects this: the deployed unit is `apps/web` on Vercel; `fly.toml` is stale. This plan follows the corrected (Vercel) reality and does not depend on a Fly host for anything.

## Target architecture for this module (from the research)

DATA-ACQUISITION.md is unambiguous about sequencing for `scripts/`:

1. The near-term job (Problem 1) is a hand-built, compliant ~150-to-300 account list, narrowed to a "Dream 20 to 40" where the principal answers WhatsApp personally. This is GTM-hat work; the tooling exists only to make the manual cascade faster and to log provenance, NOT to automate harvesting. Allocation is ~80% trust/distribution, ~20% list.
2. The cascade is layered (Section 3): Portals (Layer 1, manual look-up only), DLD/RERA (Layer 2, manual verify + seed), Dubai Pulse open CSV/API (Layer 2b, the firmographic spine and an intent signal), Google Places (Layer 3, office line + website, via the existing `SearchApiAdapter`/`PlacesAdapter`), LinkedIn UI (Layer 4, names the decision-maker, NEVER scraped), Verify (Layer 5, deliverability hygiene only).
3. The decision-maker mobile is the one field no source gives cleanly. It comes warm, opted-in, or self-published, with a source URL logged per contact. NEVER bulk-scraped.
4. Compliance hygiene per contact is mandatory and is the SAME provenance discipline the master DB needs later: a logged `source` URL, a lawful `basis` (public / warm / self-published), an opt-out hook, a no-resell rule. This is "not throwaway work."

TARGET-ARCHITECTURE.md Part 5 splits the DLD/Dubai Pulse claim precisely and this plan adopts that split verbatim:
- `transaction_spike` is REAL and FREE (Dubai Pulse `dld_transactions-open` + `dld_transactions-open-api`, OAuth token that expires, bulk CSV that needs a rebuild job). Buildable. But it is NOT a "thin wrapper": token-refresh, pagination/max-results, and CSV rebuild are real engineering.
- `off_plan_launch` via Oqood/TAS is GATED (registered active DLD business account required). Two resolutions: (a) PREFERRED, derive a free PROXY from the same open registration datasets; (b) FALLBACK, flag Oqood onboarding as an explicit prerequisite. Do NOT ship code that assumes Oqood access.
- MANDATORY FIRST: a 1-day DLD spike against official Dubai Pulse docs (freshness, OAuth/token lifetime, rate/max-result limits, commercial-use LICENSING) gates ALL other DLD work. If "transaction spike this week" is not licensable or not fresh, the differentiator must be re-grounded before any adapter code.

So the target for `scripts/` Now is two things, in order: (1) the `build-target-list.ts` operator cascade tool that produces the Dream-20-to-40 with per-contact provenance from the FREE, ToS-clean layers only, and (2) a Dubai Pulse CSV seed importer that turns the free open-data CSV into the firmographic spine of that list. The DLD `transaction_spike` SignalProvider ADAPTER itself is a `packages/integrations` build (Part 5 / Next), not a script; the script layer consumes it once it exists. `promptfoo` runner wiring is shared with Part 2 (the eval gate); the script-side surface is a thin invocation. `nova-call.ts` stays demo. `optimize-prompt.ts` (Ax) is explicitly LATER.

Critically per DATA-ACQUISITION.md Section 7 "Explicitly NOT": do NOT build a portal scraper, do NOT build adapters/waterfall/DLD-adapter/master-DB as the near-term move, do NOT buy a global B2B seat. The script must stay inside the defensible lane: a human/VA viewing public listings, the tool logging provenance.

## Invariants this module must preserve

- Deterministic scoring stays in code. Scripts call `scoreLead` from `@oie/core`; the LLM never emits fit/intent/composite/tier. `build-target-list.ts` ranks/segments with code (and `scoreLead` where a subject is assembled), never an LLM number. The LLM may only draft an opener/note (prose), as `discover-live.ts` already does via `personaliseOpener`/`personaliseColdOpener`.
- DRY_RUN default true + mandatory human send-gate. No script in this plan sends or dials. `build-target-list.ts` only writes rows + provenance; any message it produces is `status: "awaiting_approval"`, mirroring `discover-live.ts`. `nova-call.ts` stays DEMO_MODE. Never add code that flips DRY_RUN or DEMO_MODE. The repo guard hook refuses the literal disable-flag token even in docs; reword, never bypass.
- Vendor shapes never leak into core. Dubai Pulse / DLD access goes behind the existing `SignalProvider` (and `EnrichmentProvider` for firmographics) contracts in `packages/integrations`; the script consumes the normalised types (`NormalisedCompany`, `NormalisedSignal`), never the raw Dubai Pulse JSON/CSV columns. The CSV importer normalises at the boundary into the unified model before any `prisma` write.
- Secrets only via env/Vercel. A `DUBAI_PULSE_API_KEY` / `DUBAI_PULSE_API_SECRET` pair is read lazily from env, added to `packages/config/src/schema.ts` (`optionalSecret`) + `PROVIDER_KEYS` + `.env.example`. Never printed (extend `gate1-credentials.ts` only to report presence). Never committed.
- UAE PDPL + TDRA. The cascade tool collects only self-published / public / warm data, logs a `source` URL and a lawful `basis` per contact, carries an opt-out + no-resell field, and never harvests at scale. No automated portal/LinkedIn scraping. TDRA gates live voice/at-scale outreach, which this module never triggers (it is list-building, not contact).

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort (S/M/L)

Sequencing note: the three repo-wide "Now" items in TARGET-ARCHITECTURE.md (durable send-gate, promptfoo gate, OTel span) are NOT script-folder work except where promptfoo surfaces a runner. The script-folder Now is the data-acquisition tooling DATA-ACQUISITION.md asks for, kept to the FREE/compliant lane.

### N1. `scripts/build-target-list.ts`: the public-source cascade into a Dream-20-to-40 with provenance (M)

Purpose: run the compliant cascade (DATA-ACQUISITION.md Section 3) as far as outreach needs, producing ranked, segmented target firms with a named decision-maker placeholder and a per-contact provenance record. This replaces the spreadsheet-with-a-source-URL-column the strategy doc describes, while staying inside the same Prisma models `discover-live.ts` already writes.

Spec (standalone tsx CLI, same shape as `discover-live.ts`):

```
/**
 * Build the Dream-20-to-40 UAE real-estate target list (DATA-ACQUISITION.md §3).
 * Cascade (free + ToS-clean only): Dubai Pulse firmographic spine (via the CSV
 * importer N2) -> Google Places (SearchApi/Places) for office line + website ->
 * code segmentation + deterministic scoreLead -> write Company/Contact + a
 * TargetProvenance row per contact (source URL, basis, opt-out, no-resell).
 * NEVER scrapes portals or LinkedIn. The decision-maker NAME + MOBILE are filled
 * by hand later (warm/opted-in/self-published), never fabricated, never harvested.
 *
 * Run: pnpm exec tsx --env-file=.env scripts/build-target-list.ts "real estate developers in Dubai" [limit]
 */
```

- Reuse, do not re-roll: `buildDiscoveryProvider()`, `localeFor()`, the `scoreLead`/`toScoringSubject` path, and the `syntheticContact()` honesty pattern from `discover-live.ts` (lift them into a shared helper only if both files need them; otherwise copy the minimal shape). Import `SearchApiAdapter`, `PlacesAdapter`, `type NormalisedCompany`, `type AdapterContext`, `type CostRecord` from `../packages/integrations/src/index`; `icpProfile`, `scoreLead`, `SCORING_MODEL_VERSION`, `type IcpProfile` from `../packages/core/src/index`; `prisma`, `Prisma` from `../packages/db/src/index`.
- Segmentation is CODE (DATA-ACQUISITION.md: "segment hard by activity, size, developer vs brokerage, inbound volume"). Add a `segment(company): { kind: "developer" | "brokerage" | "portal" | "other"; dreamScore: number }` pure function in the script; rank by `dreamScore` then by `scoreLead` composite. The LLM never ranks.
- Per-contact provenance is the load-bearing output. Write it to a new `TargetProvenance` Prisma model (one migration in `packages/db`, spec below) with fields `{ contactId, source, sourceUrl, basis, optOut, noResell, capturedBy, capturedAt }` where `basis` is an enum-like string `"public" | "self_published" | "warm" | "referral"`. The decision-maker `fullName`/`phone` stay the honest placeholder (`"Decision-maker (unconfirmed), <company>"`, `null` mobile) until filled warm; NEVER fabricated.
- Output: console table (tier, segment, dreamScore, company, office line) + the count of rows written, exactly like `discover-live.ts`'s final summary. Optionally `--csv path` to also emit a provenance CSV for the operator's working sheet (write-only, no PII beyond what is already public + logged).
- Write an `AuditLog` row (`actor: "system:build-target-list"`, `action: "list.build"`, payload `{ query, discovered, written, segments }`), mirroring `discover-live.ts` lines 267-274.
- Does NOT send, does NOT dial, does NOT enrich a contact mobile from any scraped source. If a `--with-openers` flag is passed, generate `awaiting_approval` Message rows via `personaliseColdOpener` exactly as `discover-live.ts` does (gated, never sent).

Provenance model migration (in `packages/db`, consumed by the script):

```prisma
model TargetProvenance {
  id         String   @id @default(cuid())
  contactId  String
  contact    Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  source     String   // human label, e.g. "Bayut self-published listing"
  sourceUrl  String   // exact URL the datum came from
  basis      String   // "public" | "self_published" | "warm" | "referral"
  optOut     Boolean  @default(false)
  noResell   Boolean  @default(true)
  capturedBy String   @default("gp@humai.ae")
  capturedAt DateTime @default(now())
  @@index([contactId])
}
```

Acceptance check:
- `pnpm exec tsx --env-file=.env scripts/build-target-list.ts "real estate developers in Dubai" 12` runs with `DRY_RUN=true`, prints a ranked, segmented table, writes Company/Contact + TargetProvenance rows, and prints "Nothing sent." No Message row exists unless `--with-openers` was passed, and then only as `awaiting_approval`.
- `pnpm db:studio` shows every written Contact has a matching `TargetProvenance` row with a non-empty `sourceUrl` and a valid `basis`. No Contact has a fabricated `fullName` that asserts a real person, and every unknown `phone` is `null`.
- Grep proves no scraping: the script imports only `SearchApiAdapter`/`PlacesAdapter` (and the Pulse importer from N2), never a portal/LinkedIn fetch.

### N2. `scripts/import-dubai-pulse-csv.ts`: Dubai Pulse open-data CSV seed importer (M)

Purpose: turn the free, regularly-updated Dubai Pulse `dld_real_estate_licenses-open` CSV (DATA-ACQUISITION.md Layer 2b) into the firmographic spine of the target universe, normalised into `NormalisedCompany` and persisted to Neon. This is the "Dubai Pulse CSV ingest as a seed importer" called out in DATA-ACQUISITION.md "Next" but pulled to Now because it is free, offline, and unblocks N1.

Spec:

```
/**
 * Import the Dubai Pulse DLD open-data licenses CSV into the master DB as the
 * firmographic spine (DATA-ACQUISITION.md §3 Layer 2b). Offline, free, no
 * provider key needed for the bulk-CSV path. Normalises every row into the
 * unified NormalisedCompany at the boundary (vendor columns never leak), then
 * upserts Company rows by a stable key. Records source + sourceUrl provenance.
 *
 * Run: pnpm exec tsx --env-file=.env scripts/import-dubai-pulse-csv.ts ./data/dld_real_estate_licenses-open.csv
 */
```

- Parse the CSV with a small adopted parser. ADOPT `csv-parse` (the `csv-parse/sync` named import) rather than hand-rolling a split-on-comma loop (quoting/escaping correctness). Add it as a root devDependency: `pnpm add -D -w csv-parse`. Do not adopt a heavier framework.
- Normalisation is the anti-corruption boundary. Define a Zod schema for the EXPECTED Dubai Pulse columns (license number, trade name, license status, activity, area), parse each row with it, and map to `NormalisedCompany` (`name`, `localCategory` from the DLD activity, `region`/`country` defaults, `sources: { name: "dubai-pulse", localCategory: "dubai-pulse" }`). Unknown/extra columns are dropped. Reject the file with a clear error if required columns are absent (schema mismatch = stale dataset, fail loud).
- Idempotent upsert: Company has a unique `domain`, but DLD rows have no domain. Upsert on a synthetic stable key derived from the DLD license number (store it as `placeId`-style provenance or add a nullable `externalRef` field in a follow-up; for Now, dedupe in code by trade-name + license number and skip if a Company with that `sources.dldLicense` already exists). Never create duplicates.
- Only license-status ACTIVE rows are imported (segmentation hint). Developer vs brokerage is inferred from the DLD activity field and stored in `localCategory` so N1's `segment()` can read it.
- Write a `ProviderCost` row with `costUsd: 0` (free path) and an `AuditLog` row (`action: "import.dubai_pulse_csv"`, payload `{ file, rows, imported, skipped }`).
- The token-based REST path (OAuth key+secret, expiring token) is explicitly OUT of this script's Now scope: it belongs in the `packages/integrations` DLD adapter (Part 5 / Next). This script does the free bulk-CSV path only and says so in its header.

Acceptance check:
- `pnpm add -D -w csv-parse` succeeds and `csv-parse` appears in `pnpm-lock.yaml`.
- Running against a small fixture CSV (commit a 5-row redacted fixture under `scripts/__fixtures__/dld-sample.csv`) imports N companies, prints `imported`/`skipped`, and re-running imports 0 new (idempotent).
- Feeding the file with a missing required column fails with a readable "Dubai Pulse CSV schema mismatch: missing column X" error and exit code 1 (no partial write).
- `pnpm db:studio` shows imported Company rows carry `sources.dldLicense` provenance and an ACTIVE-only filter held.

### N3. DLD spike doc + config + SignalType groundwork, NO adapter code yet (S)

Purpose: satisfy the MANDATORY-first DLD spike (TARGET-ARCHITECTURE.md Part 5) and lay the typed groundwork so the `transaction_spike` adapter (a Part 5 / Next `packages/integrations` build) can drop in without a core change scramble. This is the cheap, in-repo half; it does NOT write the OAuth adapter.

Spec:
- Add the env keys (do NOT use them yet beyond presence reporting): in `packages/config/src/schema.ts` add `DUBAI_PULSE_API_KEY: optionalSecret` and `DUBAI_PULSE_API_SECRET: optionalSecret`, append both to `PROVIDER_KEYS`, and add them to `.env.example` with a comment pointing at `dubaipulse.gov.ae`. `gate1-credentials.ts` then reports them automatically (it iterates `PROVIDER_KEYS`).
- Add the SignalType value with its TTL, gated on the spike: in `packages/core/src/types.ts` add `"transaction_spike"` to `signalTypeValues`; in `packages/core/src/signal-windows.ts` add `transaction_spike: 14` to `DEFAULT_SIGNAL_TTL_DAYS` (a transaction spike is a "this week/this fortnight" signal; the exhaustive `Record<SignalType, number>` forces this or it will not compile). Do NOT add `off_plan_launch` until its source is settled per Part 5 (a) proxy or (b) Oqood onboarding.
- Write a short `scripts/DLD-SPIKE.md` (this folder, operator-facing, NOT a report.md the parent reads): the four spike questions and where each answer was confirmed against official Dubai Pulse / DLD docs (dataset freshness, OAuth token lifetime, rate/max-result limits, commercial-use licensing). The spike is the gate; the adapter is blocked until it is filled and passing.

Acceptance check:
- `pnpm verify` passes: adding `transaction_spike` to the enum without a TTL would be a TypeScript error in `signal-windows.ts`, so a green build proves the pair is consistent.
- `pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts` lists `DUBAI_PULSE_API_KEY` and `DUBAI_PULSE_API_SECRET` under present/missing, never printing a value.
- `scripts/DLD-SPIKE.md` exists with all four questions answered from official sources, or explicitly marked BLOCKED with the reason (e.g. licensing unclear), and N1/N2's DLD-derived signal stays off until it passes.

### N4. promptfoo runner wiring for the script lane (S)

Purpose: surface the Part-2 promptfoo eval gate as an operator-runnable script so the founder can run it from a terminal, while the canonical migration of `runner.ts`/`cases.ts` to promptfoo happens in `packages/integrations` (Part 2). This is the thin script-side surface only.

Spec:
- Do NOT re-implement evals. The promptfoo config (`promptfooconfig.yaml`), the `javascript` asserts (the existing code predicates from `cases.ts`), the `llm-rubric` judge for rationale PROSE only, and the provider pointing at the `apps/web/lib/llm.ts` `ask()` seam are Part-2 deliverables. Pin promptfoo via `pnpm add -D -w promptfoo` (it is NOT in the lockfile; re-verify the MIT license at adoption time per Part 2).
- Add `scripts/run-evals.ts` as a thin wrapper that shells out to `promptfoo eval --no-cache -c <config>` and exits non-zero on a pass-rate drop, so `make evals` and CI can call one entry point. Keep the existing `eslint-disable no-console` style.
- Wire `promptfoo eval --no-cache` as a turbo task plus a GitHub Action gated on pass-rate (Part 2 owns the Action; the script is the local mirror).

Acceptance check:
- `pnpm exec tsx scripts/run-evals.ts` runs the promptfoo suite and returns exit code 0 when green, non-zero when a case regresses (prove by temporarily breaking one `javascript` assert).
- The `llm-rubric` judge grades only rationale prose; a grep of the config shows no assert compares a model-emitted number (invariant: LLM never emits the score).

## Next (1 to 3 months)

- The Dubai Pulse REST adapter in `packages/integrations` (the OAuth token-refresh + pagination + `transaction_spike` SignalProvider), per TARGET-ARCHITECTURE.md Part 5. `build-target-list.ts` and a new periodic refresh path consume it; the script never holds vendor logic. M-L (token-expiry, max-results, CSV rebuild are real engineering, per Part 5).
- `off_plan_launch` resolution: implement Part 5 (a) free PROXY from open registration datasets if the spike shows it is feasible; otherwise track Oqood onboarding as a prerequisite and back the signal with Bayut/Property Finder/DLD index until granted. Add `"off_plan_launch"` to `signalTypeValues` + a TTL ONLY when the source is settled. S if proxy; blocked otherwise.
- Semi-automate the cascade behind the live `EnrichmentProvider` adapters (DATA-ACQUISITION.md "Next"): wire discovery + firmographics through SearchApi/Places + the Pulse importer as a repeatable path; add an enrichment waterfall in `@oie/orchestration` (not in a script) for the named contact + email, mobile stays `null` when unknown. Adopt Clay as the pay-per-match assembly layer only once post-paid volume justifies it.
- A `scripts/refresh-target-list.ts` that re-runs the cascade and re-stamps freshness on existing rows (idempotent, provenance-preserving), once there is a list worth refreshing.

## Later (post-PMF, gated)

- `scripts/optimize-prompt.ts` using Ax (`@ax-llm/ax`, DSPy-for-TypeScript), per TARGET-ARCHITECTURE.md Part 2. Runs STRICTLY offline against the same promptfoo dataset, evolves the wrapper around `canon.ts` (never authors the canon), freezes and checks in the winning prompt; the runtime keeps using `LlmClient` so the boundary holds. NOT now: it is the fifth eval/optimizer tool and Part 2 caps adoption at promptfoo until the gate is green and a real quality gap appears. NOVA's DSPy work stays in NOVA's external repo.
- `nova-call.ts` stays DEMO_MODE throughout. Going live is gated on TDRA local-number + script pre-approval (a non-code blocker, DATA-ACQUISITION.md Section 4 / TARGET-ARCHITECTURE.md Part 4) and is the NOVA owner's server-side flip, not a script change. The verify-by-conversation moat (consented NOVA calls writing a dialable E.164 mobile to `Contact`) is the post-PMF data-acquisition engine; the script already ingests it on consent.
- A Verify (Layer 5) deliverability-hygiene helper (Twilio Line Type Intelligence / HLR) to prove a number is live before a queued contact is worked. Deferred: it is hygiene, not identity, and there is nothing live to dial yet.

## Contracts / interfaces touched (exact names)

- Consumed by `build-target-list.ts`: `SearchApiAdapter`, `PlacesAdapter`, `type NormalisedCompany`, `type AdapterContext`, `type CostRecord`, `type EnrichmentProvider` (from `packages/integrations/src/index`); `icpProfile`, `scoreLead`, `SCORING_MODEL_VERSION`, `rankByComposite`, `type IcpProfile`, `type ScoringSubject` (from `packages/core/src/index`); `collectSignals`, `toScoringSubject` (from `packages/orchestration/src/index`); `personaliseColdOpener`, `LlmClient` (from integrations, opener prose only); `prisma`, `Prisma` (from `packages/db/src/index`).
- Consumed by `import-dubai-pulse-csv.ts`: `prisma`, `Prisma`; `type NormalisedCompany`; `csv-parse/sync` (`parse`); `z` for the row schema.
- New Prisma model: `TargetProvenance` (and its `Contact.targetProvenance` relation) in `packages/db/prisma/schema.prisma`.
- New exported domain value: `"transaction_spike"` added to `signalTypeValues` in `packages/core/src/types.ts`; `transaction_spike` key in `DEFAULT_SIGNAL_TTL_DAYS` in `packages/core/src/signal-windows.ts`.
- New env keys: `DUBAI_PULSE_API_KEY`, `DUBAI_PULSE_API_SECRET` in `packages/config/src/schema.ts` `envSchema` + `PROVIDER_KEYS` + `.env.example`.
- New scripts (no exports; each is `main()` + `process.exitCode`): `scripts/build-target-list.ts`, `scripts/import-dubai-pulse-csv.ts`, `scripts/run-evals.ts`. New doc: `scripts/DLD-SPIKE.md`.
- Unchanged contracts: the five interfaces in `packages/integrations/src/contracts/interfaces.ts` (EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore), `LlmClient`, the NOVA `findings.ts` parser. No script reimplements provider logic.

## Verification (how each task is proven done)

- Repo gate (all tasks): `pnpm verify` (turbo typecheck + lint + test + build). N3's enum+TTL pair is proven consistent BY the typecheck (exhaustive `Record<SignalType, number>`). The new Prisma model requires `pnpm db:generate` then a migration; `pnpm verify` covers the generated client.
- N1 `build-target-list.ts`: `pnpm exec tsx --env-file=.env scripts/build-target-list.ts "real estate developers in Dubai" 12` with `DRY_RUN=true`; inspect via `pnpm db:studio` that every Contact has a `TargetProvenance` row with non-empty `sourceUrl` + valid `basis`, no fabricated person, `null` unknown mobiles, and (without `--with-openers`) zero Message rows. Grep the file to prove only `SearchApiAdapter`/`PlacesAdapter`/the Pulse importer are used (no portal/LinkedIn fetch).
- N2 `import-dubai-pulse-csv.ts`: `pnpm add -D -w csv-parse` then run against `scripts/__fixtures__/dld-sample.csv`; assert imported count, idempotent re-run (0 new), and a clear schema-mismatch failure on a malformed file. `pnpm db:studio` confirms ACTIVE-only + `sources.dldLicense` provenance.
- N3 spike + groundwork: `pnpm verify` green; `pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts` lists the two Dubai Pulse keys without values; `scripts/DLD-SPIKE.md` has all four questions answered from official docs or marked BLOCKED.
- N4 `run-evals.ts`: `pnpm exec tsx scripts/run-evals.ts` returns 0 green / non-zero on a deliberately broken `javascript` assert; config grep shows no number-comparing assert and the `llm-rubric` judges prose only.
- Lint/format every new file with `pnpm lint` and `pnpm format`; keep the `eslint-disable no-console` blocks (these are legitimate operator CLIs). No em dashes in any user-visible string.

## Risks and do-not

- DO NOT build a portal or LinkedIn scraper. DATA-ACQUISITION.md Section 4/8: Bayut ToS forbids bots and DB-compilation; LinkedIn User-Agreement breach + ban risk (Apollo/Seamless Company Pages removed in 2025); UAE Cybercrime Law 34/2021 penalises unlicensed personal-data collection (AED 50k-500k). `build-target-list.ts` automates only the free, official layers (Dubai Pulse, Google Places API); portals and LinkedIn stay MANUAL look-up with a logged source URL.
- DO NOT fabricate a decision-maker or a mobile. The honest placeholder pattern from `discover-live.ts` (`syntheticContact`, `@unknown.invalid`, `null` phone) is mandatory. Missing data = unknown, never guessed (AGENTS.md invariant). The mobile arrives warm/opted-in/self-published only.
- DO NOT assume Oqood/TAS access. `off_plan_launch` is gated; ship nothing that assumes it. Prefer the free proxy (Part 5 a); otherwise track onboarding as a prerequisite. Do not add the SignalType until its source is settled.
- DO NOT skip the DLD spike. "Transaction spike this week" is fiction until freshness + commercial-use licensing are confirmed against official Dubai Pulse docs (CLAUDE.md: verify every provider's CURRENT API/limits/auth; do not assume from memory). N3 gates N1/N2's DLD-derived signal on the spike passing.
- DO NOT let Dubai Pulse vendor shapes leak. Normalise CSV/JSON at the boundary into `NormalisedCompany`/`NormalisedSignal` before any `prisma` write; the OAuth REST adapter belongs in `packages/integrations`, not in a script.
- DO NOT flip DRY_RUN, DEMO_MODE, or send/dial from any script. The only legitimate message status a script writes is `awaiting_approval`. The guard hook refuses the literal disable token even in docs; reword, never bypass.
- DO NOT over-build. DATA-ACQUISITION.md is explicit: the first list is a weekend job, the bottleneck is trust/distribution not data, and front-loading list-building before talking to buyers is a named failure mode. Keep N1 "as deep as outreach needs," not a polished 300-row longlist in isolation. Respect the 3-net-new-vendors-per-quarter cap: the only net-new dependencies here are `csv-parse`, `promptfoo`, and the Dubai Pulse free data (Ax is Later).
- DO NOT add a `package.json`/`tsconfig.json` inside `scripts/` or import between scripts (AGENTS.md). Keep each file a standalone `tsx` leaf with `main()` + `process.exitCode` + `prisma.$disconnect()` in `finally`. Remember scripts are not in `pnpm typecheck`; prove them by running in fixture/dry-run mode and inspecting the DB.
