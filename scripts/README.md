# scripts/: operator scripts

Human-invoked entry points for **Huscribe Revenue OS**, the single control plane for end-to-end sales of [Huscribe.com](https://huscribe.com) (Voice-AI inbound lead-qualification for UAE/MENA real estate). Operator: `gp@humai.ae` (HumAI, Dubai). The deployed control plane lives at `apps/web` (Fly.io, `huscribe-revenue-os`, region `fra`); these scripts are the terminal-side tooling the operator runs to drive and verify the pipeline.

Nothing here is on the production send-path. Scripts discover leads, seed config, verify adapters against fixtures or live providers, and (the headline) **place NOVA voice calls and enrich the master database from what the call learns**.

## How it fits the system

The repo is a pnpm/Turbo monorepo. Scripts are standalone `tsx` programs that import the workspace packages directly as TypeScript source:

- `@oie/core` (`packages/core`), domain types, Zod, the **deterministic scoring engine** (the LLM never scores).
- `@oie/db` (`packages/db`), Prisma/Postgres (Neon). Models: `Company`, `Contact`, `Signal`, `Score`, `Message`, `CallSession`, `CallFinding`, `AuditLog`, more.
- `@oie/integrations` (`packages/integrations`), vendor adapters behind anti-corruption contracts.
- `@oie/orchestration` (`packages/orchestration`), waterfall + send gate (`DRY_RUN` defaults true).
- `@oie/config` (`packages/config`), env validation, fail-fast.

## The scripts

| Script | Purpose |
| --- | --- |
| `nova-call.ts` | **Flagship.** Place NOVA voice calls (`api.novalabs.ae`), poll the outcome, ingest findings into `CallSession`/`CallFinding`, and enrich the master DB from consented facts. "Verify-by-conversation": the call confirms the contact and grows the database on every dial. |
| `discover-live.ts` | Run the real discovery pipeline against live providers (SearchApi/Places -> Apollo -> TheirStack -> deterministic score -> Claude opener) and persist leads + `awaiting_approval` messages to Neon. Refuses to run unless `DRY_RUN=true`. |
| `seed-huscribe-icp.ts` | Seed and activate the Huscribe UAE-real-estate ICP profile. |
| `seed-production.ts` | Drive every adapter's real code path against recorded fixtures through the real pipeline and persist to Neon. Nothing sends. |
| `verify-adapters-live.ts` | One read-only live call per adapter whose key is present; senders/CRM checked for config only. |
| `phase10-pilot-dryrun.ts` | In-memory proof that nothing sends; everything lands in the approval queue. (`make pilot`) |
| `phase4-signals-demo.ts` | Evidence that a dated signal moves the intent score. |
| `gate1-credentials.ts` | Report which provider keys are present vs missing. Never prints values. |
| `sync-keys-to-vercel.sh`, `_set_vercel_env.py` | Push present `.env` keys to the Vercel project (production target only) without printing any value. |

## NOVA voice loop (`nova-call.ts`)

NOVA is the operator's own production voice agent: a FastAPI + LiveKit 4-phase agent (Greeting -> Discovery -> Pitch -> Close) with DSPy pre-call context and a built-in compliance gate (consent / DNCR / calling-window).

- `place_calls` and `get_call` are **public**; `NOVA_API_KEY` (Bearer) is optional and only unlocks account features.
- **DEMO_MODE**: the agent joins a LiveKit room (`room = call-<context_id>`); **no real PSTN dialing** happens until the NOVA owner enables it. Stays on by default.
- Only the canonical, consented findings are persisted: `identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`. Missing data yields no finding; nothing is fabricated.
- Enrichment is gated on `consent`: a captured `mobile` updates `Contact.phone`/`whatsapp` (E.164), captured `tools` merge into `Company.techStack` and create a `tech_adoption` `Signal`.

## Install / use

Prerequisites (run from the repo root): `pnpm install`, then for DB-touching scripts `pnpm infra:up && pnpm db:migrate && pnpm db:seed` (or `make setup`). Node 22+, pnpm 10.

Run any script with `tsx`, passing the env file so secrets reach the process:

```
# Seed the Huscribe ICP
pnpm exec tsx --env-file=.env scripts/seed-huscribe-icp.ts

# Place a NOVA verify+pitch call to one number (DEMO_MODE, no PSTN)
pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +971501234567 --name "Ahmed"

# Or pull queued leads from the master DB (positional integer = limit, default 3)
pnpm exec tsx --env-file=.env scripts/nova-call.ts 5

# Live discovery into the control plane (DRY_RUN must be true)
pnpm exec tsx --env-file=.env scripts/discover-live.ts "real estate developers in Dubai" 12

# Pure-fixture proof that nothing sends
make pilot
```

Relevant env (full list in `/.env.example`): `DATABASE_URL`, `DRY_RUN=true`, `NOVA_API_BASE` (default `https://api.novalabs.ae`), `NOVA_API_KEY` (optional), `NOVA_OWNER_EMAIL` (default `gp@humai.ae`), plus provider keys for `discover-live.ts`.

## Safety (do not break these)

- The LLM never computes a score; scoring is deterministic via `@oie/core`.
- Missing data = unknown, never guessed. No fabricated findings.
- Nothing sends or dials without explicit human approval and a passing dry-run. Scripts write messages only as `awaiting_approval`; NOVA stays in DEMO_MODE.
- `DRY_RUN` stays true. Secrets only via env, never printed or committed. (UAE PDPL + TDRA: consent, provenance, opt-out.)

## For AI agents

Read **[AGENTS.md](./AGENTS.md)** before editing anything here. It documents the contracts, invariants, the safe change procedure, and worked examples for this directory.
