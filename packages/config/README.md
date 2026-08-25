# @oie/config

Environment loading and validation for OIE. It fails fast on a misconfigured environment so no other package has to guess whether a key is present or valid.

This package is the base of OIE's dependency graph: a small, fail-fast environment contract with no internal dependencies and only `zod` at runtime.

## What it owns

- The full OIE environment contract (`src/schema.ts`): a Zod object covering core/safety keys (required) and provider keys (optional, supplied at Human Gate 1).
- Fail-fast loading that aggregates every problem into one readable error.
- The credentials checkpoint data behind Human Gate 1 (present vs missing provider keys, names only).

Core keys are **required** and fail validation if missing or invalid (`DATABASE_URL` must be a valid URL; `AUTH_SECRET` at least 16 characters). `DRY_RUN` defaults to `true` (a program-wide safety invariant: nothing sends or dials without an explicit human gate). Cost caps and `MIN_FREE_DISK_GB` have safe numeric defaults. Provider keys are **optional** (default `""`) so adapters can be built and fixture-tested before their credentials arrive.

## Key exports

| Export                                | Purpose                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `envSchema`                           | the Zod schema for the whole environment                                                        |
| `loadEnv(source?)`                    | validate a source (defaults to `process.env`); throws `EnvValidationError` listing all problems |
| `getEnv()`                            | memoised accessor; throws on first use if invalid                                               |
| `resetEnvCache()`                     | reset the memoised env (tests only)                                                             |
| `providerKeyStatus(env)`              | `{ present, missing }` provider keys; never throws, never logs values                           |
| `EnvValidationError`                  | aggregated validation error (`.problems: string[]`)                                             |
| `PROVIDER_KEYS`, `Env`, `ProviderKey` | the provider-key list and inferred types                                                        |

## Use

This package is consumed as TypeScript source (no JS build). Add `"@oie/config": "workspace:*"` to a package that needs it, then:

```ts
import { getEnv, loadEnv, providerKeyStatus } from "@oie/config";

const env = getEnv(); // validated, memoised; throws if the env is invalid
if (env.DRY_RUN) {
  /* safe path */
}

const { present, missing } = providerKeyStatus(env); // key names only
```

For an explicit, non-cached check (and tests), call `loadEnv(source)` and pass an object instead of relying on `process.env`.

## Develop / test

```bash
pnpm --filter @oie/config test       # Vitest
pnpm --filter @oie/config typecheck  # tsc --noEmit
pnpm verify                          # full repo gate: typecheck + lint + test + build
```

## How it fits

Every package that reads configuration should go through `@oie/config` rather than touching `process.env` directly. `providerKeyStatus` powers `scripts/gate1-credentials.ts`, which reports present-versus-missing keys without ever printing a value.

Note: a few framework-specific variables are read directly elsewhere, including operator auth, Inngest, and `NEXT_PUBLIC_*` values. The schema is the contract for centrally validated configuration, not an exhaustive inventory of framework-managed variables.

## Working in this package as an agent

Read [AGENTS.md](./AGENTS.md) first. It documents the invariants, the safe change procedure, and the gotchas specific to this module.
