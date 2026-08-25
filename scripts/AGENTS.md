# Working in `scripts/`

These files are operator-invoked leaves, not libraries and not an automatic execution path.

## Invariants

- Never add a direct message send or dial. A script may create an `awaiting_approval` record only.
- Keep `DRY_RUN=true` as a hard precondition for provider-backed discovery.
- Use the deterministic scorer from `@oie/core`; never calculate a score with an LLM or by hand.
- Validate external input at its boundary and preserve missing values as unknown.
- Use only synthetic fixtures in the repository. Never commit prospect PII.
- Read secrets from the environment, never echo values, and document new key names in `.env.example`.
- Record material writes in `AuditLog` and keep database operations idempotent.
- Import workspace contracts from `../packages/<package>/src/index`; scripts have no public exports.

## Verification

Use the safest path that proves the change, then run the repository gate:

```bash
pnpm exec tsx scripts/phase10-pilot-dryrun.ts
pnpm verify
pnpm format:check
```

Provider-backed checks require explicit local configuration. They must remain read-only except for documented writes to the configured development database.
