## Outcome

<!-- Lead with the user-visible or architectural result. Link an issue when one exists. -->

## Changes

-

## Verification

```text
pnpm verify
pnpm format:check
git diff --check
```

## Safety checklist

- [ ] Tests, type checks, lint, build, formatting, and diff checks pass.
- [ ] No secret, credential, customer data, prospect PII, or deployment identity is included.
- [ ] Every send path still passes suppression and `evaluateSendGate`; dry-run and channel defaults remain restrictive.
- [ ] Scores are computed by deterministic code, never an LLM.
- [ ] External and model-shaped input is validated; vendor types stay inside adapters.
- [ ] New environment variable names are documented in `.env.example` without values.
- [ ] Migrations are forward-only and material writes remain auditable and idempotent.

## Reviewer notes

<!-- Call out migrations, safety-boundary changes, provider calls, or follow-up work. -->
