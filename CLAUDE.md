# OIE project memory

Outbound Intelligence Engine is a TypeScript monorepo for explainable lead intelligence and human-approved outbound workflows.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Verify: `pnpm verify`
- Format check: `pnpm format:check`
- Local database: `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`
- Web app: `pnpm --filter web dev`

## Architecture

- `packages/core`: pure domain schemas and deterministic scoring. An LLM never computes a score.
- `packages/config`: environment validation.
- `packages/db`: Prisma schema, migrations, seed, and shared client.
- `packages/integrations`: provider adapters behind stable internal contracts.
- `packages/orchestration`: waterfall, signal fan-in, send gate, sequencing, and durable workflows.
- `packages/mcp`: read-only scoring tools; never part of the send path.
- `apps/web`: operator-facing evidence and approval control plane.

## Hard rules

- A real action requires dry-run to be deliberately disabled and that exact action to be approved by a human.
- LinkedIn and WhatsApp are off by default and require explicit channel enablement.
- Missing values stay unknown. Do not invent facts, scores, proof, or customer data.
- Validate external and model-shaped input at the boundary with Zod.
- Keep vendor payloads inside their adapters and scoring free from I/O, environment, randomness, and wall-clock reads.
- Read secrets only from the environment; never commit or log values.
- Use synthetic fixtures and keep tests offline.
- Run `pnpm verify`, `pnpm format:check`, and `git diff --check` before claiming completion.

Read the nearest `AGENTS.md` before changing a package. Architecture and safety decisions live in `docs/ARCHITECTURE.md` and `docs/adr/`.
