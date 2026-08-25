# OIE — Operations Runbook

> This runbook covers local operation, deployment, and recovery. Read it with `docs/ARCHITECTURE.md` and `CLAUDE.md`.

## The golden safety rule

**Nothing sends on any channel without (1) DRY_RUN disabled AND (2) an explicit human approval for that specific action.** Both conditions are enforced in code (`packages/orchestration/src/send-gate.ts`), as a deny rule + PreToolUse hook (`.claude/`), never as a chat instruction. LinkedIn and WhatsApp carry a third gate: the channel must be explicitly enabled (off by default). Do not weaken these.

## Run locally

```bash
pnpm install
pnpm infra:up            # Postgres on Colima/Docker
pnpm db:migrate          # apply migrations
pnpm db:seed             # seed the ICP
pnpm verify              # typecheck + lint + test + build (must be green)
pnpm --filter web dev    # control plane at http://localhost:3000
```

Evidence scripts (no live calls; fixtures + local DB):

```bash
pnpm exec tsx --env-file=.env scripts/phase4-signals-demo.ts   # signal scan moves intent
pnpm exec tsx --env-file=.env scripts/phase10-pilot-dryrun.ts  # full pilot in dry-run
```

## Environment & secrets

- Every key is documented in `.env.example`. Real values live only in `.env` (gitignored) locally, and in the platform secret stores in production (Vercel / Inngest / Neon project settings). Never commit secrets; never paste them into chat.
- Credentials checkpoint: `pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts` reports which provider keys are present vs missing (never prints values).
- Cost caps: `DAILY_LLM_COST_CAP_USD` (default 25) and `DAILY_PROVIDER_COST_CAP_USD` (default 50) halt non-critical work when exceeded (`packages/orchestration/src/enrolment/cost-caps.ts`).

## Architecture map (where things live)

| Concern                                                                     | Location                                   |
| --------------------------------------------------------------------------- | ------------------------------------------ |
| Domain types, ICP + scoring engine                                          | `packages/core` (code computes the number) |
| Unified data model, migrations, seed                                        | `packages/db`                              |
| Anti-corruption adapters (one per vendor)                                   | `packages/integrations/src/<vendor>`       |
| Stable interfaces (Enrichment/Signal/EmailSender/MessagingChannel/CrmStore) | `packages/integrations/src/contracts`      |
| Waterfall, signal collection, send gate, sequencing, enrolment, cost caps   | `packages/orchestration`                   |
| Control plane (dashboard + API)                                             | `apps/web`                                 |

## Deploy

See `infra/deploy.md`. Summary: web to Vercel, durable workers to Inngest Cloud, Postgres on Neon, errors to Sentry. **Never deploy to production without:** `pnpm verify` green, the security-compliance review green, and explicit human approval. The dry-run flag stays on in production until the live-send gate is approved.

## Going live (Human Gate 2 — the one-way door)

1. Confirm SPF/DKIM/DMARC pass for every sending domain; mailboxes warmed; suppression list loaded.
2. Run the pilot dry-run; review the approval queue; confirm personalisation cites real signals.
3. A human explicitly approves going live in chat. Only then is the dry-run flag turned off.
4. Approve individual actions in the queue. LinkedIn/WhatsApp remain off until separately enabled within conservative limits (LinkedIn well within ~100 connects/week).

## Incident response

| Symptom                                | First action                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bounce rate climbing / spam complaints | Pause sequences (re-enable the dry-run flag); auto-suppress hard bounces; check domain health.                                                   |
| LinkedIn/WhatsApp account warning      | Disable the channel (`ChannelAccount.enabled=false`); stop all queued channel actions; review weekly volume.                                     |
| Provider 5xx / rate limit storm        | The adapters retry with backoff; the waterfall falls through. If persistent, the provider is skipped — check `ProviderCost` and provider status. |
| Cost cap hit                           | Non-critical work halts automatically; review `ProviderCost`, raise caps deliberately if unit economics justify.                                 |
| Bad data sent to CRM                   | HubSpot find-or-create is idempotent; correct the source field and re-sync.                                                                      |

## Rollback

- App: redeploy the previous Vercel deployment (instant rollback in the Vercel dashboard).
- DB: migrations are forward-only; restore from the latest Neon backup/branch if a migration is bad. Never hand-edit `prisma/migrations`.
- Workers: revert the Inngest function version; in-flight steps are durable and resume.

## Audit & observability

- Every send, enrolment, score change, and data pull writes to the append-only `AuditLog`.
- Per-provider/task spend is tracked in `ProviderCost`.
- Errors flow to Sentry; structured logs via pino.
