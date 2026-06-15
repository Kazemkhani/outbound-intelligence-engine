# Contributing to OIE

OIE is a private commercial product built largely by autonomous specialist agents under human supervision. These conventions keep the build green, the safety rails intact, and the work legible to the next session — human or agent.

## Development setup

Prerequisites: Node 22+ and pnpm 10 (see `.nvmrc` and `packageManager`). Docker (via Colima locally) for Postgres.

```bash
pnpm install
cp .env.example .env        # fill in what you have; provider keys are optional at build time
pnpm infra:up               # Postgres on Colima/Docker
pnpm db:migrate             # apply migrations
pnpm db:seed                # seed the ICP (idempotent)
pnpm verify                 # must be green before you claim done
```

A one-command setup is available via `make setup`. The repo also opens cleanly in GitHub Codespaces — see `.devcontainer/`.

## The verify gate

**`pnpm verify` must pass before any work is claimed done.** It runs, across every package via Turborepo:

```
typecheck → lint → test → build
```

Show the evidence (exit code, task count, test count) — do not assert success without it. If verify is red, stop and report the actual error; do not loop or retry silently.

## Autonomous-agent workflow

Most work is done by the specialist subagents in `.claude/agents/`. Each owns a domain:

- `workflow-engineer` — Inngest functions, the waterfall, schedulers, the send gate.
- `integration-engineer` — the vendor adapters and the anti-corruption layer.
- `scoring-engineer` — the deterministic scoring engine and its evals.
- `data-architect` — the Prisma schema, dedupe, migrations, seed.
- `deliverability-engineer` / `channels-engineer` — Smartlead and Unipile send paths.
- `frontend-engineer` — the control plane.
- `qa-eval-engineer` — tests and the LLM eval harness.
- `security-compliance-engineer` and `verifier` — the pre-merge gates.

The flow: plan with deep thinking before multi-file changes; build behind the right interface; verify with evidence; have `verifier` check the diff against `PLAN.md` and the phase acceptance criteria; have `security-compliance-engineer` review the diff; then commit. The `/verify-phase` and `/ship-phase` skills wrap this.

## Commit conventions

- Commit after every slice — git is the safety net.
- Use clear, imperative subjects (Conventional-Commits style is welcome: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- Reference the phase where relevant (e.g. "Phase 7 — wire send gate first").
- Update `PLAN.md` after each phase and `.env.example` whenever you add an env key.

## Hard rules — never weaken these

- **Never weaken the send gate.** Every send path routes through `evaluateSendGate` first; both `DRY_RUN` off and explicit human approval are required for a real send; LinkedIn/WhatsApp need the channel enabled too. Do not auto-approve a send, auto-disable `DRY_RUN`, or move the gate behind an MCP call. See [ADR-0009](./docs/adr/0009-send-gate-and-dry-run.md).
- **Never commit secrets.** Secrets live only in `.env` (gitignored) and platform secret stores. Document every new key in `.env.example` with no value.
- **Code computes the score, never the LLM.** Keep the LLM client out of `packages/core`.
- **Vendor shapes never leak into the core.** New providers go behind an adapter implementing one of the five interfaces, mapping to the unified model.
- **TypeScript strict; validate external and LLM input with Zod at the boundary.** No `any` without a one-line reason.
- Prefer the simplest approach; no speculative abstraction; delete dead code.

## Pull request flow

1. Branch from `main` (feature branches push freely; `main` is never pushed without explicit instruction).
2. Make the change behind the right interface; keep the diff focused.
3. `pnpm verify` green — paste the evidence.
4. `verifier` PASS against `PLAN.md`; `security-compliance-engineer` PASS on the diff.
5. Open a PR using the template; tick every box (verify green, no secrets, send gate intact).
6. Merge only with both gates green.
