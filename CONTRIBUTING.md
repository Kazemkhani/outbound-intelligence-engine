# Contributing to OIE

Thank you for helping make outbound automation more explainable, replaceable, and safe by default.

## Set up the repository

Prerequisites: Node.js 22+, pnpm 10, and Docker for database-backed work.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm verify
```

Provider credentials are optional for normal development. Tests use recorded fixtures and must not call external services.

## Choose an issue

For substantial changes, open or claim an issue before implementation so the contract and migration path can be agreed. Security vulnerabilities must use GitHub's private reporting flow described in [SECURITY.md](SECURITY.md).

## Development rules

- Keep pull requests focused and explain the user-visible or architectural outcome.
- Preserve the central send gate and its default-deny behaviour.
- Keep scoring deterministic; LLMs may explain a score but never calculate it.
- Validate external data with Zod and keep vendor shapes inside their adapters.
- Add tests for changed behaviour and use only synthetic fixtures.
- Document new environment variable names in `.env.example`; never commit values.
- Do not add a dependency when the platform or existing code already provides the capability.

Read the nearest `AGENTS.md` before modifying a package with additional invariants.

## Verify the change

Run the complete gate before opening a pull request:

```bash
pnpm verify
pnpm format:check
git diff --check
```

Include the commands and results in the pull request description. If a change touches sending, suppression, scoring, migrations, or provider boundaries, call it out explicitly for closer review.

## Commit and pull request style

Use a short imperative commit subject. Conventional Commit prefixes are welcome, for example `fix:`, `feat:`, `docs:`, or `chore:`. Link the issue when one exists and complete the safety checklist in the pull request template.

By contributing, you agree that your contribution is licensed under Apache-2.0.
