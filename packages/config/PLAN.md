# packages/config Plan

> The single fail-fast env contract for Huscribe Revenue OS: validate every key once, default to safe, and gate live-send + NOVA-demo-exit reachability behind explicit booleans with no secret defaults. Derived from docs/architecture/TARGET-ARCHITECTURE.md and docs/strategy/DATA-ACQUISITION.md.

## Current state (from the code)

`@oie/config` is small, pure, and healthy. It is the base of the dependency graph with one runtime dependency (`zod`).

- `src/schema.ts` exports `envSchema` (Zod object), the coercion helpers `boolFromEnv` / `numFromEnv`, `optionalSecret` (`z.string().optional().default("")`), the `PROVIDER_KEYS` tuple (`as const satisfies readonly (keyof Env)[]`), and the inferred types `Env` and `ProviderKey`.
- `src/index.ts` exports `loadEnv(source = process.env)`, `getEnv()` (memoised), `resetEnvCache()`, `providerKeyStatus(env)`, and `EnvValidationError` (aggregates every problem into `.problems: string[]`).
- `src/index.test.ts` covers defaults, fail-fast aggregation, boolean coercion, numeric rejection, and provider-key reporting.

The contract today:
- Required / safety (fail fast): `DATABASE_URL` (URL), `AUTH_SECRET` (min 16).
- Defaulted: `DRY_RUN` -> `true`, `DAILY_LLM_COST_CAP_USD` -> `25`, `DAILY_PROVIDER_COST_CAP_USD` -> `50`, `MIN_FREE_DISK_GB` -> `5`, `NODE_ENV` -> `development`.
- 19 optional provider keys (each `optionalSecret`, each in `PROVIDER_KEYS`): `ANTHROPIC_API_KEY`, `CLAY_WEBHOOK_URL`, `CLAY_API_KEY`, `EXPLORIUM_API_KEY`, `APOLLO_API_KEY`, `GOOGLE_MAPS_API_KEY`, `SEARCHAPI_API_KEY`, `THEIRSTACK_API_KEY`, `BUILTWITH_API_KEY`, `PREDICTLEADS_API_KEY`, `PREDICTLEADS_API_TOKEN`, `EXA_API_KEY`, `SMARTLEAD_API_KEY`, `RESEND_API_KEY`, `UNIPILE_API_KEY`, `UNIPILE_DSN`, `HUBSPOT_ACCESS_TOKEN`, `COMPOSIO_API_KEY`, `SENTRY_DSN`.

Verified gaps (from `grep process.env` across the repo and the AGENTS.md gotcha):
- Several keys live in `.env.example` and are read directly via `process.env`, bypassing the schema: `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH`, `ALLOW_DEV_LOGIN` (`apps/web/auth.ts`); `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (orchestration runtime); `NOVA_API_BASE`, `NOVA_API_KEY`, `NOVA_OWNER_EMAIL` (`scripts/nova-call.ts`); `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_ENV`.
- There is NO live-send reachability flag and NO NOVA `DEMO_MODE` flag in the contract. `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` reads `dryRun` + per-action `approval` + per-channel `channelEnabled`, but nothing in `@oie/config` expresses a system-wide "live-send is reachable at all" kill-switch. Part 10 of the architecture calls for exactly this: a flag layer that "gates REACHABILITY of live-send, NOVA's DEMO_MODE exit, and model-tier rollouts" and "NEVER flips DRY_RUN or computes a score."
- The only live consumer today is `scripts/gate1-credentials.ts`, which imports by relative source path. No workspace package lists `@oie/config` in `dependencies` yet.
- Observability is one key (`SENTRY_DSN`). The architecture's "Now" OTel span emits to Sentry only, so no new observability DSN is strictly required now, but the OTel semconv pinning and the future Langfuse keys need a home.

## Target architecture for this module (from the research)

The architecture treats secrets and flags as a single fail-fast contract behind one invariant: "Secrets only via env, read lazily." `@oie/config` is the place where every new key from every phase lands BEFORE the adapter that reads it, so a misconfigured deploy fails at boot, not mid-run. Concretely the research roadmap will add these key families, and this module must absorb each fail-fast (required where the system cannot run without it, optional-secret where an adapter can be fixture-tested before the credential arrives):

- Observability (Part 8): OTel span to Sentry now (`SENTRY_DSN` exists); Langfuse later (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`) only once a self-host exists. Pin the OTel semconv version as a config value so `gen_ai.*` deprecation churn is a one-line flip.
- Compliance providers (Part 11, NOVA-go-live, TDRA-gated): DNCR / consent / audit-sink / PII-vault credentials (`DNCR_API_KEY`, `SKYFLOW_*`, `IMMUDB_*`, `NIGHTFALL_API_KEY`), all optional-secret stubs until a real call exists, never required before TDRA approval.
- Dubai Pulse / DLD (Part 5): the FREE `transaction_spike` rail needs OAuth client-credential keys (`DUBAI_PULSE_CLIENT_KEY`, `DUBAI_PULSE_CLIENT_SECRET`) plus the token endpoint and optional CSV-ingest knobs. Gated on the 1-day availability/licensing spike passing. Oqood (`off_plan_launch`) keys only if/when the gated business onboarding lands.
- Voice providers (Part 4): NOVA is EXTERNAL (`api.novalabs.ae`); this repo only holds the HTTP-client keys (`NOVA_API_BASE`, `NOVA_API_KEY`, `NOVA_OWNER_EMAIL`), which currently bypass the schema. The LiveKit / Telnyx / Deepgram / Cartesia / ElevenLabs keys live in NOVA's own repo and MUST NOT be added here.
- Perimeter / infra (Part 10): Upstash (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), Infisical (upstream sync into Vercel env, optional-secret if read here at all), feature-flag provider (`POSTHOG_*` or Flagsmith) when adopted. All Next, not Now.
- The flags layer (Part 10, the highest-leverage config addition): explicit boolean flags that gate REACHABILITY only. `LIVE_SEND_ENABLED` (default false), `NOVA_DEMO_MODE` (default true, i.e. demo on / live off), and model-tier rollout flags. These NEVER flip `DRY_RUN` and NEVER compute a score; `evaluateSendGate` stays the authority. They are a second, independent kill-switch in front of the gate, mirroring the DRY_RUN-safe default.

Hosting note carried from the research: the deployed unit is `apps/web` on Vercel (the root `fly.toml` is stale). Secrets flow Vercel env -> `process.env`, synced by `scripts/sync-keys-to-vercel.sh`; Infisical (Next) sits upstream of that flow, so the app still reads `process.env` and this module's contract is unchanged by it.

## Invariants this module must preserve

- Deterministic scoring stays in code. No key, flag, or default in this package ever feeds the scorer or emits a number. The scoring engine in `packages/core` never imports `@oie/config` for a score.
- `DRY_RUN` defaults `true`, always, and is never removed. New flags (`LIVE_SEND_ENABLED`, `NOVA_DEMO_MODE`) are SEPARATE conditions: they can only further restrict reachability, never relax DRY_RUN or the human send-gate. `evaluateSendGate` remains the authority.
- Vendor shapes never leak into core. This package holds key NAMES and primitive config values only; no vendor SDK, no vendor response type. The only dependency stays `zod`.
- Secrets only via env, no secret defaults. Every credential is `optionalSecret` (default `""`), never a hardcoded value. The guard hook is content-based: never write the literal DRY_RUN-disable flag token anywhere in this package, even in a comment; reword.
- UAE PDPL + TDRA gate live voice. Compliance and voice-provider keys ship as optional-secret stubs only; they are never required, so DEMO_MODE stays provably safe until TDRA approval and a real call exist. No compliance key being present can, by itself, enable a send or a dial.
- `loadEnv` stays pure and side-effect-free (no logging, no network, no mutation of `source`); memoisation lives only in `getEnv`. Every new credential added to `envSchema` is also added to `PROVIDER_KEYS` and to the repo-root `.env.example` (name only, no value).

## Now (0 to 4 weeks): concrete tasks, each with a copy-pasteable spec + acceptance check + effort

These four tasks make `@oie/config` the fail-fast home for the keys and flags the "Now" architecture phase needs (the OTel-to-Sentry span, the durable send-gate, the cheap compliance trio, the NOVA findings boundary), WITHOUT adding any hosted infra and without adopting a flags vendor. They are pure schema + helper changes, fully unit-testable, no new dependency.

### Task 1 (S): Add the reachability flag layer (`LIVE_SEND_ENABLED`, `NOVA_DEMO_MODE`) as fail-fast booleans, default-safe, never secret

This is the single highest-value config change: the architecture (Part 10) wants a kill-switch that "can instantly disable live-send reachability or NOVA's DEMO_MODE exit without a deploy and without ever auto-clearing the send-gate." Put the booleans in the contract now (the flags VENDOR, PostHog/Flagsmith, is Next).

In `src/schema.ts`, add a new block after the safety block:

```ts
  // ── Reachability flags (gate REACHABILITY only; never relax DRY_RUN/scoring) ─
  // LIVE_SEND_ENABLED is a SECOND kill-switch in front of evaluateSendGate.
  // Default false: even with DRY_RUN off and a human approval, the send path
  // stays unreachable until this is explicitly enabled.
  LIVE_SEND_ENABLED: boolFromEnv(false),
  // NOVA_DEMO_MODE true = demo only (no live dial). Default true (safe).
  // Exiting demo mode is TDRA-gated and is a deliberate, explicit flip.
  NOVA_DEMO_MODE: boolFromEnv(true),
```

These are NOT provider keys, so do NOT add them to `PROVIDER_KEYS`. Add both to `.env.example` under a new `# ── Reachability flags ──` block with their safe defaults documented (`LIVE_SEND_ENABLED=false`, `NOVA_DEMO_MODE=true`).

Acceptance check: a new test asserts `loadEnv(validBase).LIVE_SEND_ENABLED === false` and `.NOVA_DEMO_MODE === true` by default; `loadEnv({...validBase, LIVE_SEND_ENABLED: "true"}).LIVE_SEND_ENABLED === true`; `loadEnv({...validBase, NOVA_DEMO_MODE: "false"}).NOVA_DEMO_MODE === false`. Also assert `providerKeyStatus(loadEnv(validBase))` does NOT list either flag (they are not secrets). `pnpm --filter @oie/config test` green.

### Task 2 (S): Centralize the env vars that currently bypass the schema (Inngest signing, NOVA client, operator auth, Vercel env) into the contract, fail-fast where the system cannot safely run without them

Per the AGENTS.md gotcha, these are read raw via `process.env` today. Bring them under the contract so a misconfigured deploy fails at boot. Be precise about which become REQUIRED and which stay optional, and respect Next.js `NEXT_PUBLIC_*` inlining (do NOT move `NEXT_PUBLIC_*` into a server-validated required key).

In `src/schema.ts`:

```ts
  // ── Durable workers (Inngest) ──────────────────────────────────────────────
  // Optional in dev; in production the serve endpoint must reject unsigned calls.
  // Enforced as a production-conditional refinement below, not a blanket require.
  INNGEST_EVENT_KEY: optionalSecret,
  INNGEST_SIGNING_KEY: optionalSecret,

  // ── NOVA voice client (EXTERNAL service at api.novalabs.ae) ─────────────────
  NOVA_API_BASE: z.string().url().default("https://api.novalabs.ae"),
  NOVA_API_KEY: optionalSecret,
  NOVA_OWNER_EMAIL: optionalSecret,

  // ── Operator auth (apps/web/auth.ts) ───────────────────────────────────────
  AUTH_OPERATOR_EMAIL: optionalSecret,
  AUTH_OPERATOR_PASSWORD_HASH: optionalSecret,
  ALLOW_DEV_LOGIN: boolFromEnv(false),

  // ── Deploy environment (read-only, informational) ──────────────────────────
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
```

Add a `.superRefine` to `envSchema` that fails fast on production-only requirements, keeping dev/test loose:

```ts
export const envSchema = z.object({ /* ...fields... */ }).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production") {
    if (!env.INNGEST_SIGNING_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["INNGEST_SIGNING_KEY"],
        message: "INNGEST_SIGNING_KEY is required in production (rejects unsigned trigger calls)" });
    }
    if (!env.AUTH_OPERATOR_EMAIL || !env.AUTH_OPERATOR_PASSWORD_HASH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_OPERATOR_EMAIL"],
        message: "operator credentials are required in production (login fails closed otherwise)" });
    }
    if (env.LIVE_SEND_ENABLED && env.DRY_RUN) {
      // Defensive: live-send reachability with DRY_RUN on is a misconfig signal, not a send.
      // This does NOT enable a send; it surfaces the contradiction at boot.
    }
  }
});
```

NOTE: `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_VERCEL_ENV` stay OUT of the server schema (Next.js inlines them at build; validating them server-side would not match the client bundle). Keep them documented in `.env.example` only. Add `INNGEST_*`, `NOVA_API_KEY`, `NOVA_OWNER_EMAIL`, `AUTH_*` to `PROVIDER_KEYS`? No: `PROVIDER_KEYS` is specifically the adapter-credential gate for Human Gate 1. `INNGEST_*` and `AUTH_*` are infra/auth, not adapter credentials, so leave them OUT of `PROVIDER_KEYS`; `NOVA_API_KEY` SHOULD join `PROVIDER_KEYS` (it gates the NOVA findings adapter's live verification).

Acceptance check: new tests assert `loadEnv({...validBase, NODE_ENV: "production"})` throws `EnvValidationError` listing `INNGEST_SIGNING_KEY` and `AUTH_OPERATOR_EMAIL`; the same with all production keys present passes; `NOVA_API_BASE` defaults to the canonical URL; `ALLOW_DEV_LOGIN` defaults false. The existing `validBase` tests (NODE_ENV development) still pass unchanged. `pnpm --filter @oie/config test` and `typecheck` green.

### Task 3 (S): Add the observability + OTel-semconv config the "Now" span needs (Sentry already present; pin the semconv, reserve Langfuse names as optional stubs)

Part 8's "Now" emits one OTel GenAI span to Sentry. `SENTRY_DSN` already exists. Add the semconv pin (so `gen_ai.prompt`/`gen_ai.completion` deprecation is a one-line flip) and reserve the Langfuse names as optional-secret stubs (Later), so the adapter that registers the second span processor finds them already in the contract.

In `src/schema.ts`, under the Observability block:

```ts
  // ── Observability ─────────────────────────────────────────────────────────
  SENTRY_DSN: optionalSecret,                       // existing
  // Pin the OTel GenAI semantic-convention version so semconv churn is one flip.
  OTEL_SEMCONV_STABILITY_OPT_IN: z.string().optional().default("gen_ai_latest_experimental"),
  // Langfuse (Later, self-hosted, PDPL): optional-secret stubs only for now.
  LANGFUSE_PUBLIC_KEY: optionalSecret,
  LANGFUSE_SECRET_KEY: optionalSecret,
  LANGFUSE_HOST: z.string().url().optional(),
```

Add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` to `PROVIDER_KEYS` (they gate the Langfuse processor's live verification). Add all four to `.env.example` under Observability with no values. Re-verify the OTel semconv opt-in string against current `@opentelemetry/*` docs at adoption (the value is version-sensitive).

Acceptance check: test asserts `OTEL_SEMCONV_STABILITY_OPT_IN` default is the pinned string and is overridable; `LANGFUSE_*` default to `""` and appear in `providerKeyStatus(...).missing` for a keyless build. `pnpm --filter @oie/config test` green.

### Task 4 (S): Make `@oie/config` the validated source for `DRY_RUN` and the new flags on the orchestration send path, and add a "config-is-consistent" guard test

The send-gate reads `dryRun` from the env today, but raw. Wire the orchestration + web callers to read `DRY_RUN`, `LIVE_SEND_ENABLED`, `NOVA_DEMO_MODE` through `getEnv()` instead of raw `process.env`, so there is ONE validated source and the flag layer is real. This is the config-side half of Part 6's durable send-gate work (the `waitForEvent` change lives in `packages/orchestration`).

Steps:
1. Add `"@oie/config": "workspace:*"` to `packages/orchestration/package.json` dependencies (and to `apps/web/package.json` if the web layer reads these flags), since no workspace consumer is declared yet.
2. Where orchestration currently derives `dryRun`, source it from `getEnv().DRY_RUN`. Add a small exported helper in `src/index.ts`:

```ts
/** Reachability of the live-send path: BOTH the kill-switch on AND dry-run off.
 *  This NEVER replaces evaluateSendGate; it is an additional pre-condition. */
export function isLiveSendReachable(env: Env = getEnv()): boolean {
  return env.LIVE_SEND_ENABLED && !env.DRY_RUN;
}
/** NOVA may dial live only when demo mode is off. Default posture: demo on. */
export function isNovaLiveDialReachable(env: Env = getEnv()): boolean {
  return !env.NOVA_DEMO_MODE && !env.DRY_RUN;
}
```

Keep these PURE (take `env`, default to `getEnv()`), no side effects, mirroring `providerKeyStatus`.

Acceptance check: unit tests assert `isLiveSendReachable` is false in every combination except (`LIVE_SEND_ENABLED=true` AND `DRY_RUN=false`); `isNovaLiveDialReachable` is false unless (`NOVA_DEMO_MODE=false` AND `DRY_RUN=false`); the default `validBase` env returns false for both. Confirm `evaluateSendGate` semantics are unchanged (the orchestration send-gate test still passes: a suspended-then-approved run with DRY_RUN on still returns "simulate"). `pnpm verify` green across the repo (proves no consumer broke).

## Next (1 to 3 months)

- DLD / Dubai Pulse keys, GATED on the 1-day spike (Part 5). Add `DUBAI_PULSE_CLIENT_KEY`, `DUBAI_PULSE_CLIENT_SECRET` (optional-secret, in `PROVIDER_KEYS`), `DUBAI_PULSE_TOKEN_URL` (default `https://api.dubaipulse.gov.ae/oauth/client_credential/accesstoken`), and CSV-ingest knobs (`DUBAI_PULSE_DATASET`, `DUBAI_PULSE_CSV_PATH`). Do NOT add Oqood/`off_plan_launch` keys until its free proxy or gated onboarding is settled. Re-verify token lifetime and licensing at adoption.
- Perimeter keys (Part 10): `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (optional-secret) for the fail-open-reads / fail-closed-send RateLimiter helper; pin region EU/Frankfurt in the consumer, not here. Infisical sits upstream of Vercel env, so it likely needs NO key in this schema (the app still reads `process.env`); add an Infisical key only if a runtime SDK is introduced.
- Feature-flag vendor (Part 10): when PostHog or Flagsmith is adopted to back the flags from Task 1, add `POSTHOG_KEY`/`POSTHOG_HOST` (or `FLAGSMITH_*`) as optional-secret. The boolean flags stay the env fallback so the kill-switch works even if the flag service is down (fail-safe).
- Per-environment cost-cap tightening: consider a production-only minimum/maximum bound on `DAILY_LLM_COST_CAP_USD` / `DAILY_PROVIDER_COST_CAP_USD` via `superRefine`, so a fat-fingered prod cap fails fast.
- Add a CI step (or extend `scripts/gate1-credentials.ts`) that diffs `envSchema` keys + `PROVIDER_KEYS` against `.env.example` and fails if any key is missing from the registry, so the "add to `.env.example`" invariant is enforced, not just documented.

## Later (post-PMF, gated)

- Compliance provider keys on the NOVA-go-live track, TDRA-gated (Part 11): `DNCR_API_KEY` (DNCR scrubbing / OneTrust), `SKYFLOW_VAULT_URL` + `SKYFLOW_API_KEY` (UAE/Bahrain PiiVault), `IMMUDB_*` (tamper-evident ledger, only after the append-only Postgres AuditLog and only once a Fly/Railway host exists), `NIGHTFALL_API_KEY` (optional managed PII guard). All optional-secret stubs; none required; presence never enables a dial.
- Langfuse promoted from stub to live (Part 8): the `LANGFUSE_*` keys already reserved in Task 3 become populated once a self-host exists; confirm MIT-vs-EE for the specific judge feature at adoption.
- Analytics OLAP keys (Part 7): ClickHouse / ClickPipes / Metabase connection config, only when "N weeks of real send+reply data worth a cohort question" exists, and noting the Fly/Railway host prerequisite.
- A Fly/Railway host config block, IF the origin migration is ever decided (Part 10): an explicit gated line item; until then all "self-hosted on Fly" keys (Langfuse, Metabase, immudb) stay stubs blocked on an account that does not exist.

DELIBERATELY NOT (per the architecture's do-not list): no LiveKit / Telnyx / Twilio / Deepgram / Cartesia / ElevenLabs keys in this repo (they live in NOVA's external repo); no `step.ai.infer` gateway keys; no second orchestration-engine keys (Temporal/Trigger.dev/Restate); no separate vector-DB keys; no validating `NEXT_PUBLIC_*` server-side. Cap: at most 3 net-new vendors per quarter, and every new credential counts.

## Contracts / interfaces touched (exact names)

- `packages/config/src/schema.ts`: `envSchema`, `Env`, `ProviderKey`, `PROVIDER_KEYS`, `optionalSecret`, `boolFromEnv`, `numFromEnv`. New fields (Now): `LIVE_SEND_ENABLED`, `NOVA_DEMO_MODE`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NOVA_API_BASE`, `NOVA_API_KEY`, `NOVA_OWNER_EMAIL`, `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH`, `ALLOW_DEV_LOGIN`, `VERCEL_ENV`, `OTEL_SEMCONV_STABILITY_OPT_IN`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`. New `superRefine` on `envSchema` for production-conditional requirements.
- `packages/config/src/index.ts`: existing `loadEnv`, `getEnv`, `resetEnvCache`, `providerKeyStatus`, `EnvValidationError`; new exports `isLiveSendReachable(env?)`, `isNovaLiveDialReachable(env?)`.
- `packages/config/src/index.test.ts`: new specs for flags, production refinements, observability defaults, and the reachability helpers.
- Consumers (declare the dep): `packages/orchestration/package.json` and possibly `apps/web/package.json` gain `"@oie/config": "workspace:*"`. The send path sources `DRY_RUN` + flags via `getEnv()`; `evaluateSendGate` in `packages/orchestration/src/send-gate.ts` is UNCHANGED (still the authority).
- Registry: repo-root `.env.example` gains every new key name (no values), in matching blocks.
- `scripts/gate1-credentials.ts`: unchanged behavior; will print the larger `PROVIDER_KEYS` set automatically.

## Verification (how each task is proven done)

- Typecheck: `pnpm --filter @oie/config typecheck` (the `satisfies readonly (keyof Env)[]` guard on `PROVIDER_KEYS` fails to compile if a new credential name is wrong; `verbatimModuleSyntax` + `noUncheckedIndexedAccess` stay green).
- Lint: `pnpm --filter @oie/config lint`.
- Test: `pnpm --filter @oie/config test` (Vitest) for all four tasks' specs; `pnpm --filter @oie/orchestration test` to prove the send-gate semantics and the durable-suspend regression test still hold after Task 4.
- Build (no emit): `pnpm --filter @oie/config build`.
- Full gate before claiming done: `pnpm verify` (turbo: typecheck + lint + test + build across the workspace), which proves no consumer broke when `@oie/config` became a declared dependency.
- Manual checkpoint: `pnpm tsx scripts/gate1-credentials.ts` prints present-vs-missing key names plus `DRY_RUN`, the new flags' posture, and cost caps, and prints NO secret value (eyeball the output: only names appear).
- Negative proof (fail-fast): `NODE_ENV=production pnpm tsx -e "import('./packages/config/src/index').then(m=>m.loadEnv())"` with no Inngest/operator keys MUST throw `EnvValidationError` listing them; the same with the keys set MUST succeed.

## Risks and do-not

- DO NOT let any flag relax `DRY_RUN` or the human send-gate. `LIVE_SEND_ENABLED` and `NOVA_DEMO_MODE` are ADDITIONAL pre-conditions (AND-ed, never OR-ed). `evaluateSendGate` stays the single authority; the helpers in Task 4 are advisory pre-checks, not a bypass.
- DO NOT change `DRY_RUN`'s default away from `true`, and never write the literal disable-flag token anywhere in this package (the content-based guard hook will refuse it; reword).
- DO NOT make a provider/compliance/voice key REQUIRED. They are optional-secret so adapters build and fixture-test before credentials arrive, and so DEMO_MODE stays provably safe pre-TDRA. The only new REQUIRED keys are the production-conditional infra/auth ones (Inngest signing, operator creds), enforced via `superRefine` so dev/test stay loose.
- DO NOT add LiveKit/Telnyx/Deepgram/Cartesia/ElevenLabs (or any NOVA voice-stack) keys here: NOVA is EXTERNAL; those belong in its own repo. Only the NOVA HTTP-client keys live here.
- DO NOT validate `NEXT_PUBLIC_*` in the server schema: Next.js inlines them at build, so a server-validated value would not match the client bundle. Keep them in `.env.example` only.
- DO NOT add a dependency other than `zod`, add module-top-level side effects, or call `loadEnv()` at import time. `loadEnv` stays pure; memoisation lives only in `getEnv`.
- DO NOT assume the Dubai Pulse OAuth token lifetime, the OTel semconv opt-in string, or the Langfuse MIT/EE matrix from memory: re-verify each against official docs at adoption time (CLAUDE.md provider rule).
- Coordination risk: adding `@oie/config` as a real workspace dependency (Task 4) is the first declared consumer; run `pnpm verify` to catch any cycle or resolution issue, and keep this package dependency-free so it stays at the base of the graph.
