# Operator scripts

Human-invoked utilities for local proofs, fixture-backed adapter checks, and explicitly configured data discovery. Nothing in this directory is an automatic send path.

| Script                    | Purpose                                                                | External effects                   |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `gate1-credentials.ts`    | Report which provider keys are present without printing values         | Reads environment only             |
| `phase4-signals-demo.ts`  | Demonstrate how a dated signal changes deterministic intent            | Fixture plus configured database   |
| `phase10-pilot-dryrun.ts` | Run the complete in-memory pipeline and prove all actions remain gated | Fixtures only                      |
| `seed-example-icp.ts`     | Upsert and activate a synthetic example ICP                            | Configured database                |
| `seed-production.ts`      | Exercise real adapter code with recorded fixtures                      | Configured database; no sends      |
| `verify-adapters-live.ts` | Make one read-only check for configured providers                      | Provider reads; no sends           |
| `discover.ts`             | Discover and persist candidates while dry-run is enforced              | Provider reads and database writes |

## Use

Run from the repository root after `pnpm install`:

```bash
pnpm exec tsx scripts/phase10-pilot-dryrun.ts
pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts
pnpm exec tsx --env-file=.env scripts/seed-example-icp.ts
```

Database-backed scripts require `pnpm infra:up`, `pnpm db:migrate`, and an environment configured from `.env.example`.

## Safety

- Scoring always goes through `@oie/core`; an LLM never creates or changes a score.
- Discovery utilities may create `awaiting_approval` records but never send or dial.
- Missing data stays unknown. Synthetic contacts use an unroutable `.invalid` address.
- Secrets come only from environment variables and must never be printed.
- Material database changes require an `AuditLog` entry.
- Run `pnpm verify` after changing a script or an imported package.
