# Huscribe Revenue OS: Production Security Posture

Operator reference for how the live control plane protects secrets, authenticates the operator, and prevents anything from sending or dialing without a human in the loop. This document describes the deployed system as it actually runs, not aspirations. Audience: the operator (gp@humai.ae, HumAI, Dubai) and any reviewer assessing the production posture before live sends or live PSTN.

Live deployment: `https://huscribe-revenue-os.fly.dev` (Fly.io app `huscribe-revenue-os`, primary region `fra`, `force_https = true`). Repo root: this monorepo (pnpm/Turbo). Control plane: `apps/web` (Next.js 15). Data: Prisma/Postgres on Neon (`packages/db`).

## Threat model in one line

The product holds third-party API credentials (especially the Anthropic key), prospect contact data, and the rails to message and call people under UAE law. The two highest-impact failures are: (1) a leaked secret, and (2) an unapproved or non-compliant send/dial. The posture below is built to make both fail closed.

## Secrets: only in Fly secrets, never in the image or repo

- **One store in production.** Every secret (`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `AUTH_OPERATOR_EMAIL`, `AUTH_OPERATOR_PASSWORD_HASH`, provider keys, `NOVA_API_KEY`) is set via `flyctl secrets set` and injected at runtime only. `fly.toml` carries only non-secret env (`NODE_ENV`, `PORT`, `NEXT_TELEMETRY_DISABLED`).
- **The image is clean.** The `Dockerfile` builds with throwaway placeholder env inline on the `RUN` line (`DATABASE_URL=postgresql://build:build@localhost...`, `AUTH_SECRET=build-only-placeholder-not-a-secret-...`) so `next build` and env validation pass without touching a real database or key. No real value is ever baked into a layer. `.dockerignore` excludes `**/.env`, `**/.env.*`, and `**/.env.local` so no local env file (including the `apps/web/.env.local` symlink) reaches the build context.
- **The Anthropic key is server-only.** It is read lazily from `process.env.ANTHROPIC_API_KEY` in `apps/web/lib/llm.ts` and used by the SDK-free fetch client in `packages/integrations/src/llm/client.ts` (POST to `api.anthropic.com`). It is never exposed to the browser, never prefixed `NEXT_PUBLIC_`, and never logged.
- **Never printed.** `providerKeyStatus` (`packages/config`) and `scripts/gate1-credentials.ts` report present-versus-missing keys by name only, never values.
- **Every key is documented by name.** `.env.example` lists each key with no value; adding a key means updating it. `.env` is gitignored (`!.env.example` is the only exception).

## Authentication: Auth.js v5 operator password + bcrypt

- **Real credentials.** Login is Auth.js v5 (`next-auth@5.0.0-beta.31`) Credentials against `AUTH_OPERATOR_EMAIL` plus a bcrypt hash in `AUTH_OPERATOR_PASSWORD_HASH` (`bcryptjs`). `apps/web/auth.ts` lowercases/trims the email and runs `bcrypt.compare`; the plaintext password is never stored anywhere, only the hash, only in Fly secrets. No database adapter; sessions are JWT.
- **Fail closed.** If operator email and hash are both absent in production, every login is denied. There is no anonymous access.
- **Bounded sessions.** `apps/web/auth.config.ts` sets `session: { strategy: "jwt", maxAge: 12h, updateAge: 1h }`, a rolling window that re-extends on activity but caps inactivity at 12 hours, bounding the blast radius of an exfiltrated token versus the 30-day Auth.js default.
- **Every route is gated.** `apps/web/middleware.ts` runs the bcrypt-free `authConfig` on the Edge; the `authorized` callback returns `loggedIn` for all paths except `/signin`, `/api/auth`, and `/api/inngest`. Unauthenticated requests redirect to `/signin`.

## Dev backdoor: disabled in production (verified)

`apps/web/auth.ts` contains a dev fallback (`dev@oie.local` / `dev`) that is reachable only when **all three** hold: operator creds are unconfigured, `NODE_ENV !== "production"`, **and** `ALLOW_DEV_LOGIN === "true"`. The double opt-in means a single `NODE_ENV` slip cannot expose it. In production, operator creds are set and `ALLOW_DEV_LOGIN` is unset. This was verified on the live app: operator login returns HTTP 302 with a real session, and the dev credential creates no session (dead in prod).

## Self-hosted host trust: AUTH_TRUST_HOST + AUTH_URL

Auth.js v5 rejects untrusted hosts on non-Vercel deploys (`UntrustedHost`, which surfaced as a 500 on first deploy). Production sets `AUTH_TRUST_HOST=true` and `AUTH_URL=https://huscribe-revenue-os.fly.dev` as Fly env so callback URLs and CSRF/host checks resolve correctly behind Fly's proxy. (A follow-up baking `trustHost: true` into `auth.config.ts` is tracked in the backlog.)

## The human send/dial gate (the core safety invariant)

Nothing sends or dials on any channel without **both** a passing dry-run and explicit human approval. This is enforced in code, not by instructions a prompt injection could defeat. The market context makes this the product's trust wedge: the 2025 AI-SDR trust collapse (11x reported at 70-80% churn and listing non-customers, per TechCrunch, 2025-03-24, https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/) and survey data putting explainability/auditability as the top accountability requirement (72.3% of AI professionals, directional, via https://www.allaboutai.com/resources/llm-hallucination/) both reward verifiable control over autonomy.

- **`evaluateSendGate`** (`packages/orchestration/src/send-gate.ts`) is pure, total, and unit-tested. Two independent conditions must both hold for a real send: `DRY_RUN` off (system-level) **and** the specific action human-approved. They are deliberately separate, so flipping `DRY_RUN` alone never sends and an approval never overrides `DRY_RUN`. There is no implicit "allow" branch.
- **`DRY_RUN` defaults true** everywhere (`packages/config` schema default) and stays true in production until explicit live-send approval. It is never auto-flipped.
- **LinkedIn and WhatsApp carry a third gate:** the channel must be explicitly operator-enabled (off by default).
- **Voice (NOVA) is gated too.** The integration in `scripts/nova-call.ts` runs in `DEMO_MODE` (no real PSTN; the agent joins a LiveKit room) whenever `NOVA_API_KEY` is unset, and persists `demoMode`, `consent`, and `consentBasis` on every `CallSession`. NOVA's own compliance gate (consent / DNCR / calling-window) plus owner sign-off are the prerequisites before real PSTN, aligned to UAE Cabinet Resolution 56 of 2024 (09:00-18:00 window, DNCR, licence-registered number) and PDPL (Federal Decree-Law 45/2021) consent (per UAE law-firm summaries, e.g. https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity and https://www.trenchlaw.com/new-telemarketing-rules-in-uae-timings-fines-exemptions-explained/). Treat exact figures as secondary-source; confirm against the official gazette before any live dialing.

The scoring engine is a separate but related invariant: the LLM never computes a score (code does, deterministically and explainably, in `packages/core`); missing data stays unknown rather than guessed. The LLM is confined to personalization and extraction behind adapters. This is the explainability the market asks for, and it is why a leaked LLM key cannot silently change who gets contacted.

## What is NEVER committed

- Any real secret value (keys, hashes, connection strings, tokens).
- `.env` and any `.env.*` except `.env.example` (gitignored; `!.env.example` whitelisted).
- Local Prisma DBs, build output, logs, coverage, and browser-automation artefacts (`.gitignore`).
- Secrets never appear in source, chat, logs, or the Docker image.

## Dependency hygiene

- **Pinned and reproducible.** `pnpm install --frozen-lockfile` against `pnpm-lock.yaml`; Node 22, pnpm 10.
- **Automated updates.** Dependabot (`.github/dependabot.yml`) opens update PRs; security updates are prioritised and pass `pnpm verify` before merge.
- **Secret scanning in CI.** `.github/workflows/secret-scan.yml` runs gitleaks (`gitleaks/gitleaks-action@v2`) on push/PR. A content-based pre-bash guard hook (`.claude/hooks/guard.sh`) refuses writes to `.env` files and refuses text containing the dry-run disable-flag token.
- **Lean surface.** Internal packages are consumed as TypeScript source; the Anthropic call uses a hand-rolled fetch client rather than pulling in the vendor SDK, keeping the external dependency graph small.

## Transport and platform

- `force_https = true` on the Fly `http_service`; HTTP is redirected to HTTPS.
- A dedicated IPv4 (`109.105.222.142`) was allocated so the hostname resolves over IPv4 as well as IPv6.
- Postgres (Neon) is reached over the Fly-injected `DATABASE_URL`; the database is not exposed by the app.

## Open hardening items (tracked, not yet shipped)

- Security response headers (HSTS, `X-Frame-Options`, CSP) are not yet set in `apps/web/next.config.mjs`; this is a tracked backlog item. Do not assume they are present.
- Bake `trustHost: true` into `auth.config.ts` so host trust does not depend on env alone.

## Reporting a vulnerability

Report privately to the maintainer; do not open a public issue and do not include live secrets. Email: novalabshq@gmail.com. Include a description, reproduction steps, affected component, and impact. Coordinated disclosure: please allow reasonable time to remediate before any public disclosure.
