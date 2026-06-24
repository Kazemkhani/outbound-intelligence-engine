# AGENTS.md: `@oie/config`

Operating guide for an AI agent changing code in `packages/config`. Read this fully before editing. It is specific to this module; do not generalize.

## Purpose

`@oie/config` is the single source of truth for the OIE environment contract. It defines the Zod schema for every env var the system depends on, validates it, and fails fast with one aggregated, readable error so no downstream package has to guess whether a key is present or valid. It also reports which provider credentials are present (the data behind Human Gate 1).

It sits at the base of the dependency graph and has zero internal dependencies. Its only runtime dependency is `zod`.

## Key files & where things live

- `src/schema.ts`, the env contract. `envSchema` (Zod object), `boolFromEnv` / `numFromEnv` coercion helpers, `optionalSecret`, the `PROVIDER_KEYS` tuple, and the inferred types `Env` and `ProviderKey`. **All schema changes happen here.**
- `src/index.ts`, the public API: `loadEnv`, `getEnv`, `resetEnvCache`, `providerKeyStatus`, `EnvValidationError`, plus re-exports of `envSchema`, `PROVIDER_KEYS`, `Env`, `ProviderKey`.
- `src/index.test.ts`, Vitest specs covering defaults, fail-fast aggregation, boolean coercion, numeric rejection, and provider-key reporting. Update this when you change behavior.
- `package.json`, name `@oie/config`, `type: module`, exports `.` → `./src/index.ts` (consumed as TS source, no JS build). Scripts: `typecheck`, `build` (both `tsc --noEmit`), `lint`, `test`.
- `README.md`, human-facing summary. Keep it in sync at a high level when the API changes.

There is no `dist/`. Internal packages are consumed as TypeScript source; `tsx` and Vitest transpile.

## Public contracts / exports (do not break signatures without updating all callers)

| Export | Shape | Notes |
| --- | --- | --- |
| `loadEnv(source?)` | `(Record<string,string\|undefined>) => Env` | Defaults to `process.env`. Pure, no side effects. Throws `EnvValidationError` on failure. |
| `getEnv()` | `() => Env` | Memoised wrapper over `loadEnv()`. Throws on first use if invalid. |
| `resetEnvCache()` | `() => void` | Clears the memo. Tests only. |
| `providerKeyStatus(env)` | `(Env) => { present: ProviderKey[]; missing: ProviderKey[] }` | Never throws, never logs or returns values. |
| `EnvValidationError` | `Error & { problems: string[] }` | One entry per failed field, formatted `path: message`. |
| `envSchema` | `ZodObject` | Source of `Env`. |
| `PROVIDER_KEYS` | `readonly ProviderKey[]` | Optional credential keys that gate live adapter verification. |
| `Env`, `ProviderKey` | types | `Env = z.infer<typeof envSchema>`. |

### The contract today (verify against `src/schema.ts`, this is a summary)

- **Required / safety (fail fast if missing or invalid):**
  - `DATABASE_URL`, must be a valid URL.
  - `AUTH_SECRET`, min 16 chars.
- **Defaulted (safe values applied when unset):**
  - `DRY_RUN` → `true` (boolean coercion: `true/1/yes/on` are true, everything else false).
  - `DAILY_LLM_COST_CAP_USD` → `25`, `DAILY_PROVIDER_COST_CAP_USD` → `50`, `MIN_FREE_DISK_GB` → `5` (numeric coercion; non-numeric strings fail).
  - `NODE_ENV` → `development` (enum: `development | test | production`).
- **Optional provider keys (default `""`, never block a build):** `ANTHROPIC_API_KEY`, `CLAY_WEBHOOK_URL`, `CLAY_API_KEY`, `EXPLORIUM_API_KEY`, `APOLLO_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SEARCHAPI_API_KEY`, `THEIRSTACK_API_KEY`, `BUILTWITH_API_KEY`, `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN`, `EXA_API_KEY`, `SMARTLEAD_API_KEY`, `RESEND_API_KEY`, `UNIPILE_API_KEY`, `UNIPILE_DSN`, `HUBSPOT_ACCESS_TOKEN`, `COMPOSIO_API_KEY`, `SENTRY_DSN`. Every one of these is also listed in `PROVIDER_KEYS`.

## Invariants

YOU MUST:
- Keep `loadEnv` pure and side-effect free (no logging, no network, no mutation of `source`). It is unit-tested as a pure function.
- Keep `DRY_RUN`'s default `true`. This is a program-wide safety invariant (nothing sends or dials without an explicit human gate). Never change the default to `false` and never remove `DRY_RUN`.
- Keep the safety keys (`DATABASE_URL`, `AUTH_SECRET`) required so misconfiguration fails fast at boot rather than mid-run.
- Keep `providerKeyStatus` value-blind: it returns key names only, never the secret content. It must never throw and never log.
- Aggregate every validation problem into `EnvValidationError.problems` (one per field). Do not switch to throw-on-first-error.
- When you add a new credential to the schema, also add it to `PROVIDER_KEYS` (the `satisfies readonly (keyof Env)[]` guard will fail to compile otherwise if the name is wrong) AND add it to the repo-root `.env.example` (do not put a real value).

NEVER:
- Read or hardcode secret values here, print them, or commit them. This package handles secret *names* and *presence*, not contents.
- Add side effects to module top level (no `loadEnv()` at import time). Callers decide when to validate.
- Make a provider key required. Provider keys are optional by design so adapters build and fixture-test before credentials arrive (Human Gate 1).
- Introduce a dependency other than `zod`. This package must stay at the base of the graph.
- Emit JS / add a real `build` step. `build` is intentionally `tsc --noEmit`; the package is consumed as source.

## How to make a change safely

1. Edit `src/schema.ts` for any contract change (add/remove a key, change a default, tighten a rule).
2. If the key is a credential, append it to `PROVIDER_KEYS` in the same file.
3. Update `src/index.test.ts` to cover the new behavior (a passing test for the happy path and, for required keys, a failing-validation test).
4. Update the repo-root `.env.example` with the new key name and a placeholder (never a real secret). Required keys must have a sensible placeholder; optional keys can be blank.
5. If the key needs human-facing explanation, update this package's `README.md` and (for cross-cutting safety keys) the repo-root docs.
6. Run, from the repo root:
   ```bash
   pnpm --filter @oie/config test
   pnpm --filter @oie/config typecheck
   ```
   Then the full gate before claiming done: `pnpm verify` (turbo: typecheck + lint + test + build).
7. Sanity-check the credentials checkpoint still runs: `pnpm tsx scripts/gate1-credentials.ts` (it imports this package by source path and prints present-vs-missing key names plus `DRY_RUN` and cost caps; it never prints values).

## Do / Don't

Do:
- Use `numFromEnv` / `boolFromEnv` for new numeric/boolean keys so string env values coerce consistently.
- Use `optionalSecret` (which is `z.string().optional().default("")`) for new credential keys.
- Keep messages in required-field validators human-readable (they surface verbatim in `EnvValidationError`).

Don't:
- Don't have other packages read `process.env` for keys that belong in this contract; route them through `@oie/config`.
- Don't reorder or rename existing keys casually; `.env.example`, Fly secrets, and scripts depend on the exact names.
- Don't memoise inside `loadEnv`; memoisation lives only in `getEnv` and is reset by `resetEnvCache`.

## Worked examples

### 1) Add a new optional provider key (e.g. a new enrichment vendor `ACME_API_KEY`)

In `src/schema.ts`, add the field under the enrichment block and to the tuple:
```ts
// in envSchema, enrichment section:
ACME_API_KEY: optionalSecret,

// in PROVIDER_KEYS:
"ACME_API_KEY",
```
Then add `ACME_API_KEY=` to the repo-root `.env.example`, and a `providerKeyStatus` assertion to `src/index.test.ts`. Run the test + typecheck filters. No required-key test is needed because it is optional.

### 2) Add a new required safety key (e.g. `REDIS_URL` that the system cannot boot without)

```ts
// in envSchema, core/safety section:
REDIS_URL: z.string().url("REDIS_URL must be a valid connection URL"),
```
This is NOT a provider key, so do not add it to `PROVIDER_KEYS`. Add a placeholder to `.env.example`, add a failing-validation test (an invalid `REDIS_URL` must throw `EnvValidationError` and appear in `problems`), and confirm the existing `validBase` test fixture in `index.test.ts` still passes (you will need to add `REDIS_URL` to `validBase`, or every test breaks).

## Gotchas

- **Not every env var the app uses is in this schema.** Several vars in `.env.example` are read directly via `process.env`, bypassing `@oie/config`: `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH`, `ALLOW_DEV_LOGIN` (in `apps/web/auth.ts`); `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (orchestration runtime); `NOVA_API_BASE`, `NOVA_API_KEY`, `NOVA_OWNER_EMAIL` (`scripts/nova-call.ts`); `NEXT_PUBLIC_SENTRY_DSN`. If you are asked to "validate all env" or "add X to the schema," check whether the key is currently read elsewhere and whether centralizing it would change behavior (e.g. Next.js `NEXT_PUBLIC_*` inlining). Do not assume the schema is exhaustive.
- **No declared workspace consumers yet.** No other package lists `@oie/config` in `dependencies`. The live consumer, `scripts/gate1-credentials.ts`, imports by relative source path (`../packages/config/src/index`), not the `@oie/config` alias. If you add an import in another package, add `"@oie/config": "workspace:*"` to that package's `package.json`.
- **`noUncheckedIndexedAccess` is on** (repo tsconfig). Indexing `env[key]` yields `T | undefined`; `providerKeyStatus` already guards with `env[key] && String(env[key]).trim().length > 0`. Keep that pattern.
- **`verbatimModuleSyntax` is on.** Use `import type { ... }` for type-only imports (see `index.ts`).
- **Defaults are applied by Zod transforms**, so `loadEnv({})` does not give you a fully blank object: defaulted keys come back populated. Tests assert these defaults; do not "fix" them.
- **`build` runs no emit.** If a task expects a `dist/`, that is wrong for this package.
- **The guard hook is content-based.** Do not write the literal `DRY_RUN`-disable flag token anywhere, even in a doc or comment; reword.
