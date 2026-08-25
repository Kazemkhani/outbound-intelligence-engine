# Documentation

The shortest path through OIE's public documentation:

1. [Architecture](ARCHITECTURE.md): boundaries, data flow, stable interfaces, and the unified model.
2. [Architecture decisions](adr/README.md): the reasoning behind the monorepo, orchestration, adapters, scoring engine, and send gate.
3. [Operations runbook](../RUNBOOK.md): local operation, safety checks, recovery, and deployment-neutral procedures.
4. [Deployment guide](../infra/deploy.md): one supported managed topology and its release checklist.
5. [Security policy](../SECURITY.md): reporting, secrets, data handling, and supported versions.

Package-level guides live beside the code:

- [`@oie/core`](../packages/core/README.md): deterministic scoring and domain contracts.
- [`@oie/config`](../packages/config/README.md): typed environment validation.
- [`@oie/db`](../packages/db/README.md): Prisma model, migrations, and seed data.
- [`@oie/integrations`](../packages/integrations/README.md): adapter contracts and provider boundaries.
- [`@oie/orchestration`](../packages/orchestration/README.md): workflows, sequencing, and the send gate.
- [`@oie/mcp`](../packages/mcp/README.md): read-only scoring tools for agent clients.
- [Web control plane](../apps/web/README.md): Next.js routes, runtime boundaries, and local setup.
- [Operator scripts](../scripts/README.md): dry-run proofs and explicitly invoked integration utilities.

The repository intentionally excludes customer-specific playbooks, credentials, production URLs, operator identities, and deployment run logs. Examples use synthetic data only.
