# OIE — Production Readiness Checklist

> The sequenced path from "green in dry-run on a laptop" to "running real, compliant outbound in production". Each item has an **owner** — **Amir** (anything needing authentication, payment, secrets, DNS, or an external account) or **Claude** (code, config, docs, anything reproducible) — and a **status**. The live-send gate (Stage 8) is the one-way door; everything before it is reversible and safe.
>
> Guiding rule throughout: **the dry-run flag stays on, and no channel sends, until Stage 8 is explicitly approved.** Deploying the platform is not the same as switching outreach on.

Legend: ☐ todo · ◐ in progress · ☑ done.

---

## Stage 0 — Source of truth on GitHub

| #   | Item                                                                                                                         | Owner  | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 0.1 | Private repo `Kazemkhani/outbound-intelligence-engine` created, all commits pushed                                           | Claude | ◐      |
| 0.2 | CI green on GitHub Actions (the existing `.github/workflows/ci.yml` runs verify + migrate + seed against a Postgres service) | Claude | ☐      |
| 0.3 | Branch protection on `main` (require CI to pass, require PR review)                                                          | Amir   | ☐      |
| 0.4 | Add the mentor / collaborators with least-privilege access                                                                   | Amir   | ☐      |
| 0.5 | Codespaces enabled so the repo opens with Claude Code from any device (`.devcontainer` is in place)                          | Amir   | ☐      |

## Stage 1 — Managed Postgres (Neon)

| #   | Item                                                                                      | Owner  | Status |
| --- | ----------------------------------------------------------------------------------------- | ------ | ------ |
| 1.1 | Create a Neon project + database; copy the pooled connection string                       | Amir   | ☐      |
| 1.2 | Set `DATABASE_URL` (pooled) and a direct URL for migrations in the platform secret stores | Amir   | ☐      |
| 1.3 | Run `pnpm --filter @oie/db migrate:deploy` against Neon                                   | Claude | ☐      |
| 1.4 | Seed the ICP in production (`pnpm db:seed`)                                               | Claude | ☐      |
| 1.5 | Confirm a Neon backup/branching strategy (point-in-time restore)                          | Amir   | ☐      |

> Notes: Prisma needs a direct (non-pooled) connection for `migrate deploy`; the app uses the pooled URL. Keep both. Neon's free tier is sufficient for the pilot.

## Stage 2 — Web control plane on Vercel

| #   | Item                                                                                                                     | Owner       | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------- | ------ |
| 2.1 | Authenticate Vercel; create the project, set **root directory = `apps/web`** (Vercel auto-detects the Turborepo)         | Amir        | ☐      |
| 2.2 | Build settings: install `pnpm install`, build `pnpm --filter web build`; ensure the Prisma client generates in the build | Claude      | ☐      |
| 2.3 | Environment variables: `DATABASE_URL`, `AUTH_SECRET`, `DRY_RUN=true`, cost caps, `SENTRY_DSN`                            | Amir        | ☐      |
| 2.4 | First production deploy (dashboard only, fixtures + dry-run — no provider keys needed yet)                               | Claude/Amir | ☐      |
| 2.5 | Add auth (Auth.js) so the control plane is not publicly open                                                             | Claude      | ☐      |
| 2.6 | Custom domain + HTTPS                                                                                                    | Amir        | ☐      |

## Stage 3 — Durable workers (Inngest Cloud)

| #   | Item                                                                                                                                              | Owner  | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 3.1 | Create an Inngest Cloud account + environment; copy the signing/event keys                                                                        | Amir   | ☐      |
| 3.2 | Expose the Inngest serve endpoint from `apps/web` (an API route) and register the functions in `packages/orchestration/src/sequencing/inngest.ts` | Claude | ☐      |
| 3.3 | Sync the app to Inngest Cloud; confirm functions appear and a test run completes                                                                  | Amir   | ☐      |
| 3.4 | Configure concurrency/throttle controls per mailbox and per channel                                                                               | Claude | ☐      |

## Stage 4 — Pre-live wiring (the runtime gaps)

These are scaffolded and unit-tested; wire them into the durable runtime. None sends; all keep the gate intact.

| #   | Item                                                                                                              | Owner  | Status |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 4.1 | Feed real reply/bounce/unsubscribe events to `shouldStop` (replace `events: []` in `inngest.ts`)                  | Claude | ☐      |
| 4.2 | Call `assertWithinCaps` before every costed LLM/provider operation                                                | Claude | ☐      |
| 4.3 | Add the Inngest function: qualifying fresh signal → create `Enrolment` (pending approval)                         | Claude | ☐      |
| 4.4 | On hard bounce / unsubscribe webhook, write a durable `Suppression` row                                           | Claude | ☐      |
| 4.5 | Persist `AuditLog` + `ProviderCost` on every send, enrolment, score change, and data pull in the running pipeline | Claude | ☐      |

## Stage 5 — Provider credentials + live adapter verification

For each provider, Amir places the key in the secret store, then Claude live-verifies the adapter against a small real request (read-only / non-sending where possible).

| #    | Provider           | Key(s)                                                            | Owner         | Status |
| ---- | ------------------ | ----------------------------------------------------------------- | ------------- | ------ |
| 5.1  | Anthropic (Claude) | `ANTHROPIC_API_KEY`                                               | Amir → Claude | ☐      |
| 5.2  | Google Places      | `GOOGLE_MAPS_API_KEY` (Places API enabled)                        | Amir → Claude | ☐      |
| 5.3  | Apollo             | `APOLLO_API_KEY`                                                  | Amir → Claude | ☐      |
| 5.4  | Clay               | `CLAY_WEBHOOK_URL`, `CLAY_API_KEY`                                | Amir → Claude | ☐      |
| 5.5  | Explorium          | `EXPLORIUM_API_KEY`                                               | Amir → Claude | ☐      |
| 5.6  | TheirStack         | `THEIRSTACK_API_KEY`                                              | Amir → Claude | ☐      |
| 5.7  | PredictLeads       | `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN`                  | Amir → Claude | ☐      |
| 5.8  | Exa                | `EXA_API_KEY`                                                     | Amir → Claude | ☐      |
| 5.9  | HubSpot            | `HUBSPOT_ACCESS_TOKEN` (private app)                              | Amir → Claude | ☐      |
| 5.10 | Smartlead          | `SMARTLEAD_API_KEY`                                               | Amir → Claude | ☐      |
| 5.11 | Unipile            | `UNIPILE_API_KEY`, `UNIPILE_DSN` (+ a connected LinkedIn account) | Amir → Claude | ☐      |
| 5.12 | Sentry             | `SENTRY_DSN`                                                      | Amir → Claude | ☐      |

> Verify each adapter's **current** API surface, auth, limits, and pricing against its official docs at integration time — do not trust training data. The `context7` MCP is wired for live docs lookup.

## Stage 6 — Email deliverability (the domain-protecting work)

| #   | Item                                                                                             | Owner  | Status |
| --- | ------------------------------------------------------------------------------------------------ | ------ | ------ |
| 6.1 | Acquire dedicated sending domains (not the primary brand domain)                                 | Amir   | ☐      |
| 6.2 | Configure SPF, DKIM, DMARC for every sending domain; verify all pass                             | Amir   | ☐      |
| 6.3 | Connect mailboxes to Smartlead; start AI warmup; ramp gradually                                  | Amir   | ☐      |
| 6.4 | Load the suppression list; confirm one-click unsubscribe + sender identity render in every email | Claude | ☐      |
| 6.5 | Set per-mailbox daily caps, rotation, sending jitter, quiet hours                                | Claude | ☐      |
| 6.6 | Pre-send domain-health check surfaced in the control plane                                       | Claude | ☐      |

## Stage 7 — Observability, cost, compliance

| #   | Item                                                                                            | Owner       | Status |
| --- | ----------------------------------------------------------------------------------------------- | ----------- | ------ |
| 7.1 | Sentry receiving web + worker errors; alerts configured                                         | Claude/Amir | ☐      |
| 7.2 | Cost dashboard (per provider/task from `ProviderCost`); daily caps enforced and alerting        | Claude      | ☐      |
| 7.3 | Privacy policy + data-processing posture (GDPR/PECR for EU/UK; CAN-SPAM); lawful basis recorded | Amir        | ☐      |
| 7.4 | Data subject deletion/suppression path tested end to end                                        | Claude      | ☐      |
| 7.5 | Load/limit test the pipeline at expected volume                                                 | Claude      | ☐      |

## Stage 8 — Pilot → Human Gate 2 → ramp (the one-way door)

| #   | Item                                                                                        | Owner       | Status |
| --- | ------------------------------------------------------------------------------------------- | ----------- | ------ |
| 8.1 | Run the pilot dry-run in production against the seed ICP; review the approval queue         | Claude/Amir | ☐      |
| 8.2 | Confirm personalisation cites real signals; confirm nothing sent                            | Amir        | ☐      |
| 8.3 | **Human Gate 2:** Amir explicitly approves going live in chat                               | Amir        | ☐      |
| 8.4 | Disable the dry-run flag in production; approve the first actions individually in the queue | Amir        | ☐      |
| 8.5 | Email first, low volume; monitor deliverability for several days before scaling             | Amir        | ☐      |
| 8.6 | Enable LinkedIn/WhatsApp separately, within conservative limits, only after email is proven | Amir        | ☐      |
| 8.7 | Measure the outcome metric: qualified meetings booked                                       | Amir        | ☐      |

---

## Recommended sequence

Stages 0–3 (repo + infra + deploy the dry-run dashboard) can proceed immediately and safely. Stage 4 (runtime wiring) is pure engineering with no external dependency. Stage 5 unblocks as each key arrives — start with Anthropic, Places, and Apollo (the discovery+personalisation core), then the rest. Stage 6 (deliverability) runs in parallel and has the longest lead time (warmup takes weeks) — start it early. Only when 0–7 are done do you approach Stage 8.

## Ideas worth considering (beyond the brief)

- **Caching layer** on enrichment + LLM results keyed on input hash — meaningful cost savings at volume.
- **A/B testing** personalised openers via the eval harness, scored against reply rate.
- **Reply intelligence** — classify inbound replies (interested / objection / out-of-office) with a Haiku-tier model to prioritise the operator's queue.
- **Multi-tenant** support when OIE serves more than the Huscribe motion (additive; the data model already isolates by ICP).
- **A nightly scheduled scan** (Inngest cron) that refreshes signals and re-ranks, surfacing newly-qualified leads each morning.
