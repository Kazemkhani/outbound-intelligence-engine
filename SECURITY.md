# Security Policy

OIE handles third-party API credentials, prospect contact data and outbound messaging rails. Security and compliance are load-bearing, not optional. This policy describes how the system protects secrets and sends, and how to report a vulnerability.

## Reporting a vulnerability

Report security issues **privately** to the maintainer — do not open a public issue, and do not include live secrets in the report.

- Email: novalabshq@gmail.com
- Include: a description, reproduction steps, affected component, and impact assessment.

We aim to acknowledge within a few business days, agree a remediation timeline, and credit reporters who request it once a fix has shipped. Please give us reasonable time to remediate before any public disclosure (coordinated disclosure).

## Secrets policy

- Secrets live **only** in environment variables — `.env` locally (gitignored) and the platform secret stores in production (Vercel, Inngest, Neon, Sentry). Never in source, never in chat, never in logs.
- Every key is documented — name only, no value — in `.env.example`. Adding a key means updating `.env.example`.
- The environment is validated at startup by `@oie/config` (fail fast). `providerKeyStatus` and `scripts/gate1-credentials.ts` report present-versus-missing keys **without printing values**.
- Provider tokens use least-privilege OAuth scopes and are rotated on the provider side. They are encrypted at rest by the platform secret stores.
- An automated secret scan runs in CI; a pre-bash guard and the `security-compliance-engineer` agent review diffs for accidental secret exposure.

## The send-gate guarantee

OIE will not send on any channel without **both** of:

1. `DRY_RUN` disabled (system-level; defaults true everywhere, and stays true in production until explicit live-send approval), and
2. an explicit human approval for that specific action.

LinkedIn and WhatsApp carry a third gate: the channel must be explicitly enabled (off by default). This is enforced in code (`packages/orchestration/src/send-gate.ts`, `evaluateSendGate`) and reinforced by a deny rule and a PreToolUse hook — never as a chat instruction, which prompt injection could defeat. The gate is pure, total and unit-tested, and is **never weakened**. See [ADR-0009](./docs/adr/0009-send-gate-and-dry-run.md).

## Data protection and compliance

- Email follows CAN-SPAM / GDPR / PECR: one-click unsubscribe (List-Unsubscribe headers), a legal sender identity and physical address in every message, a suppression check before the gate, and quiet hours.
- LinkedIn and WhatsApp run within conservative, human-like limits (LinkedIn well within ~100 connects/week) and stop on reply.
- Every send, enrolment, score change and data pull is recorded in the append-only `AuditLog`.

## Dependency policy

- Dependencies are kept lean and current. Dependabot opens weekly update PRs for npm dependencies and GitHub Actions.
- Security updates are prioritised; every dependency change passes `pnpm verify` and the security review before merge.
- Internal packages are consumed as TypeScript source within the monorepo; the external surface is minimised.

## Supported versions

OIE is a single private product with one live line of development (`main`). Security fixes are applied to `main` and deployed.
