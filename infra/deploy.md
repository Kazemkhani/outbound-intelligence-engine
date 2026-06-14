# OIE — Deployment

Managed, low-ops topology (brief §13.11). Clean separation of the web control plane from long-running execution.

| Component                                                       | Platform            | Notes                                                                                                              |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Web control plane + API (`apps/web`)                            | **Vercel**          | Next.js App Router. Set the project root to `apps/web`; Vercel detects the Turborepo.                              |
| Durable workers (Inngest functions in `packages/orchestration`) | **Inngest Cloud**   | Sequencing, waterfall schedulers, signal scans, signal-triggered enrolment. The send step routes through the gate. |
| Database                                                        | **Neon** (Postgres) | Production `DATABASE_URL`. Run `prisma migrate deploy` on release.                                                 |
| Errors / observability                                          | **Sentry**          | `SENTRY_DSN`. Structured logs via pino.                                                                            |

## Release procedure

1. `pnpm verify` green on the release commit (CI enforces this).
2. Security-compliance review green on the diff.
3. Apply migrations against Neon: `pnpm --filter @oie/db migrate:deploy`.
4. Deploy web (Vercel) and workers (Inngest) from the same commit.
5. Post-deploy smoke: home renders; an Inngest function run completes; Sentry receives a test event.

## Secrets

Set every key from `.env.example` in the platform secret stores — Vercel project env, Inngest env, Neon connection string. Nothing secret is committed. Rotate provider tokens on the provider side; least-privilege OAuth scopes only. Provider tokens are encrypted at rest by the platform secret stores.

## Safety in production

- The dry-run flag stays **on** in production until Human Gate 2 (live-send approval, see `RUNBOOK.md`). The orchestration send gate enforces this in code regardless of platform config.
- LinkedIn/WhatsApp channels are disabled by default and enabled only deliberately, within conservative limits.
- Daily cost caps are enforced in the orchestration layer and halt non-critical work when exceeded.

## Scale notes

- Inngest concurrency controls throttle per-mailbox and per-channel throughput; rotate mailboxes/accounts for volume.
- The waterfall stops early once a record is complete, bounding provider spend.
- Cache LLM + provider results on input hash to avoid re-paying for the same lookup.
