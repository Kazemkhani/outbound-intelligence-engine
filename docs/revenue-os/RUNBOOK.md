# Huscribe Revenue OS: Operations Runbook

> The operator's command-level reference for running, deploying, and recovering Huscribe Revenue OS: ONE control plane covering end-to-end sales for [Huscribe.com](https://huscribe.com) (Voice-AI inbound lead-qualification for UAE/MENA real estate). Operator/owner: gp@humai.ae (HumAI, Dubai).
>
> Live: https://huscribe-revenue-os.fly.dev (Fly.io app `huscribe-revenue-os`, region `fra`). Voice agent: NOVA (`api.novalabs.ae`).

## The golden safety rule

Nothing sends or dials on any channel without **(1)** `DRY_RUN` disabled, **(2)** an explicit human approval for that specific action, AND **(3)** a passing dry-run. These are enforced in code (`packages/orchestration` send gate), not by chat. NOVA stays in `DEMO_MODE` (no real PSTN) until the owner signs off. The LLM never computes a score (code does, in `packages/core`, deterministically and explainably); missing data stays unknown, never guessed. Do not weaken any of these invariants.

## Run locally

```bash
pnpm install                 # workspace install; @oie/db postinstall runs `prisma generate`
pnpm infra:up                # Postgres 16 on Docker/Colima (oie-postgres, port 5432)
pnpm db:migrate              # prisma migrate dev (reads ../../.env via dotenv)
pnpm db:seed                 # seed the active ICP
pnpm verify                  # turbo: typecheck + lint + test + build, must be green
pnpm --filter web dev        # control plane at http://localhost:3000
```

Or `make setup && make dev`. Seed the Huscribe buyer profile (UAE real-estate developers, brokerages, portals) explicitly:

```bash
pnpm exec tsx --env-file=.env scripts/seed-huscribe-icp.ts
```

Evidence scripts (fixtures + local DB, nothing sends or dials):

```bash
pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts      # which provider keys are present (never prints values)
pnpm exec tsx --env-file=.env scripts/phase4-signals-demo.ts    # a signal scan moves the intent score
pnpm exec tsx --env-file=.env scripts/phase10-pilot-dryrun.ts   # full pilot, proves nothing sends
```

## Environment and secrets

Every key is documented in `.env.example`. Real values live ONLY in `.env` locally (gitignored) and in **Fly secrets** in production: never in the image, the repo, or chat. `packages/config` validates env with Zod and fails fast on missing core keys (`DATABASE_URL`, `AUTH_SECRET`); provider keys are optional so adapters build and fixture-test before credentials arrive.

Production secrets that must be set on Fly: `DATABASE_URL` (Neon), `AUTH_SECRET`, `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH` (bcrypt), `AUTH_TRUST_HOST=true`, `AUTH_URL=https://huscribe-revenue-os.fly.dev`, `ANTHROPIC_API_KEY`, and any enabled provider keys (`NOVA_API_KEY` only if account features are needed; NOVA's call endpoints are public/demo without it). The Anthropic key is the most sensitive: never echo it.

```bash
flyctl secrets list --app huscribe-revenue-os                 # names only, never values
flyctl secrets set AUTH_SECRET=... --app huscribe-revenue-os  # set/update (triggers a rolling deploy)
```

`ALLOW_DEV_LOGIN` must NEVER be set in any deployment, it is a development-only fallback in `apps/web/auth.ts`. In production, absent operator config denies all logins (fail closed).

## Deploy to Fly (remote builder)

`fly.toml` pins the app (`huscribe-revenue-os`), region (`fra`), and runtime env (`NODE_ENV`, `PORT=3000`). The single-stage `Dockerfile` installs the pnpm workspace, generates the Prisma client, and runs `next build` with throwaway placeholder env so the build never touches a real DB or key; real secrets are injected by Fly at runtime.

```bash
pnpm verify                                                   # green gate on the release commit
pnpm --filter @oie/db migrate:deploy                          # prisma migrate deploy against Neon (forward-only)
flyctl deploy --remote-only --app huscribe-revenue-os         # build on Fly's remote builder, not the laptop
```

`--remote-only` keeps the heavy Docker build off the operator's machine (free local disk is tight). Watch the rollout, then smoke-test: load https://huscribe-revenue-os.fly.dev, sign in with the operator credentials, confirm the dashboard renders.

```bash
flyctl status --app huscribe-revenue-os
flyctl logs --app huscribe-revenue-os
```

**Rollback:** `flyctl releases --app huscribe-revenue-os` to list versions, then `flyctl deploy --image <previous-image-ref> --app huscribe-revenue-os` (or `flyctl machine update` to the prior release). Prisma migrations are forward-only: never hand-edit `prisma/migrations`; restore from a Neon branch/backup if a migration is bad.

## Rotate keys and secrets

1. Rotate the credential on the provider side first (Anthropic console, Neon, etc.); use least-privilege scopes.
2. `flyctl secrets set <KEY>=<new-value> --app huscribe-revenue-os` (this triggers a rolling restart that picks up the new value).
3. To rotate the operator password: generate a fresh bcrypt hash offline, then `flyctl secrets set AUTH_OPERATOR_PASSWORD_HASH=<hash>`. To rotate the session signing key: `flyctl secrets set AUTH_SECRET=<new>` (invalidates existing sessions; operator re-logs in).
4. Revoke the old provider token. Confirm `flyctl secrets list` shows the expected names. Never paste a secret value into a commit, log, or chat.

## Daily operator playbook

The control plane is the always-on GTM engineer. The motion: **review leads → approve → voice → close.** Speed-to-lead is the prize: ~78% of UAE buyers transact with the first responder (per NAR data via industry roundups; [agentzap.ai](https://agentzap.ai/blog/real-estate-lead-statistics)), the average agent takes ~917 minutes to reply, and ~62% of enquiries arrive after hours ([agentzap.ai](https://agentzap.ai/blog/real-estate-lead-statistics)). NOVA's job is to answer in under 60 seconds, 24/7.

1. **Review leads**, `/leads`. Inspect the ranked list. The score is computed deterministically in `packages/core` with full rationale; the LLM never sets it. A lead whose `after_hours_handling = waits till morning` is a hot ICP match (it is visibly losing the 62%).
2. **Check signals**, `/signals`. Confirm intent signals (including `tech_adoption` captured on prior calls) and that personalization cites real evidence, never invented facts.
3. **Approve**, `/approvals`. Approve or reject each queued action explicitly. Approval records intent only: the send gate still enforces `DRY_RUN` in code, so approving in dry-run sends nothing. There is no UI affordance that bypasses the gate.
4. **Voice (NOVA)**, `/voice`, or run the loop directly:

   ```bash
   pnpm exec tsx --env-file=.env scripts/nova-call.ts 3                       # pull queued dialable leads
   pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +971501234567 --name "Ahmed"
   ```

   NOVA runs its 4-phase agent (Greeting → Discovery → Pitch → Close) with a built-in compliance gate (consent / DNCR / calling-window). In `DEMO_MODE` the agent joins a LiveKit room; no PSTN dial happens. Every call persists a `CallSession` + `CallFinding` and enriches the master DB only for consented facts (verified mobile → `Contact.phone`/`whatsapp`; tools → `Company.techStack` + a `tech_adoption` Signal). This is the "verify-by-conversation" moat: the calls that build the database ARE the product. Most queued portal numbers are toll-free/landline switchboards NOVA cannot dial, which is exactly why the verify-call captures a real mobile.
5. **Close**, `/close`. Work qualified buyers (demo interest, WhatsApp opt-in, follow-up time). Honor any opt-out immediately: a withdrawal must write a durable suppression on the `Contact` blocking all future channels.

Review `/analytics` for the before/after proof to show prospects: lead-arrival-to-first-contact latency vs the 917-minute human baseline.

## UAE compliance (pre-live, before flipping DEMO_MODE off)

Real PSTN dialing for marketing in the UAE is hard-gated by law and is a blocking owner sign-off item, not a code task. Under Cabinet Resolution 56 of 2024 and PDPL (Federal Decree-Law 45/2021): calling window 09:00–18:00 Asia/Dubai only, no weekends or public holidays; prior TDRA approval; a licence-registered UAE caller-ID number; DNCR screening (fail-closed, unknown status = not callable); explicit consent with easy withdrawal; recording and AI-caller disclosure. DNCR fines run AED 50k/75k/150k for first/second/third breach ([pinsentmasons.com](https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity), [trenchlaw.com](https://www.trenchlaw.com/new-telemarketing-rules-in-uae-timings-fines-exemptions-explained/)). Log `consentBasis`, calling-window, and DNCR result on every `CallSession` for audit. Keep `DEMO_MODE` and `DRY_RUN` on until all of the above are confirmed.

## Incident basics

| Symptom | First action |
| --- | --- |
| Auth returns 500 / sign-in broken | Check `AUTH_TRUST_HOST` is set on Fly. Auth.js v5 behind Fly's proxy needs `AUTH_TRUST_HOST=true` and `AUTH_URL=https://huscribe-revenue-os.fly.dev`; a missing/wrong value is the usual cause. Verify with `flyctl secrets list`, set it, redeploy. |
| Login denied for the right password | Confirm `AUTH_OPERATOR_EMAIL` and `AUTH_OPERATOR_PASSWORD_HASH` (bcrypt) are set. Absent config fails closed by design. Re-set the hash if rotated. |
| App down / 502 | `flyctl status` and `flyctl logs`. Machines auto-stop/start (`min_machines_running = 0`); a cold start is expected on the first hit. |
| Env validation crash on boot | `packages/config` fails fast on a missing core key. The logged Zod error names the key; set it via `flyctl secrets set`. |
| NOVA unreachable | `nova-call.ts` health-checks `GET /health` first. Check connectivity to `api.novalabs.ae` or set `NOVA_API_BASE`. Demo calls need no key. |
| Bad migration | Do not hand-edit migrations. Restore from a Neon branch/backup; redeploy the prior Fly release. |
| Suspected secret exposure | Rotate immediately (provider side, then `flyctl secrets set`), revoke the old token, check `secret-scan.yml` (gitleaks) output. Never include live secrets in any report. |

## Audit and observability

- `AuditLog` records every placed-call batch and operator action (append-only).
- `CallSession.raw` stores the full NOVA payload for provenance; `CallFinding` holds structured, consented facts only.
- `flyctl logs` for runtime; errors flow to Sentry (`SENTRY_DSN`) when configured.

## Positioning note (why the gates are the product)

Claygency retainers run ~$3k–$15k/month for human-assembled outbound ([gtm-engineering.io](https://blog.gtm-engineering.io/blog/best-clay-automation-agencies)); AI-SDR incumbents charge ~$1.5k–$10k/seat behind opaque annual contracts, and that category's trust collapsed publicly in 2025 over inflated ARR and hallucinated output ([techcrunch.com](https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/)). Buyers now rank explainability/auditability the top accountability factor ([allaboutai.com](https://www.allaboutai.com/resources/llm-hallucination/)). Huscribe's deterministic scoring with rationale, the human approval gate, fail-closed compliance, and verify-by-conversation enrichment are precisely the antidote, operate them as features, not overhead.
