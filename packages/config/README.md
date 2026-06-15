# @oie/config

Environment loading and validation for OIE. This package fails fast on a misconfigured environment so no other package has to guess whether a key is present or valid.

## Purpose

One place that defines the OIE environment contract, validates it, and reports which provider credentials are present. Sits at the base of the dependency graph with no internal dependencies.

## What it owns

- The full environment schema (`schema.ts`) — a Zod object covering core/safety keys (required) and provider keys (optional, supplied at Human Gate 1).
- Fail-fast loading that aggregates every problem into one readable error.
- The credentials checkpoint data behind Human Gate 1.

Core keys are **required** and fail validation if missing or invalid (`DATABASE_URL` must be a valid URL; `AUTH_SECRET` at least 16 characters). `DRY_RUN` defaults to `true`. Provider keys are **optional** so adapters can be built and fixture-tested before their credentials arrive.

## Key exports

| Export                                | Purpose                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `envSchema`                           | the Zod schema for the whole environment                                                        |
| `loadEnv(source?)`                    | validate a source (defaults to `process.env`); throws `EnvValidationError` listing all problems |
| `getEnv()`                            | memoised accessor; throws on first use if invalid                                               |
| `resetEnvCache()`                     | reset the memoised env (tests only)                                                             |
| `providerKeyStatus(env)`              | `{ present, missing }` provider keys — never throws, never logs values                          |
| `EnvValidationError`                  | aggregated validation error                                                                     |
| `PROVIDER_KEYS`, `Env`, `ProviderKey` | the provider-key list and inferred types                                                        |

## How to test

```bash
pnpm --filter @oie/config test       # Vitest
pnpm --filter @oie/config typecheck
```

## How it fits

Every package that reads configuration goes through `@oie/config` rather than touching `process.env` directly. `providerKeyStatus` powers `scripts/gate1-credentials.ts`, which reports present-versus-missing keys without ever printing a value.
