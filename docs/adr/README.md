# Architecture Decision Records

This directory records the locked architectural decisions for OIE. Each ADR captures one decision in a standard format — Title, Status, Context, Decision, Consequences — so a future reader (or a fresh agent session) understands not just what was chosen, but why, and what it costs.

These records capture decisions that shape OIE's public contracts. Change a decision by writing a new ADR that supersedes the old one, never by editing history.

## Index

| ADR                                                   | Title                                                   | Status   |
| ----------------------------------------------------- | ------------------------------------------------------- | -------- |
| [0001](./0001-typescript-monorepo.md)                 | TypeScript monorepo                                     | Accepted |
| [0002](./0002-inngest-orchestration.md)               | Inngest durable orchestration                           | Accepted |
| [0003](./0003-clay-apollo-explorium-enrichment.md)    | Clay + Apollo + Explorium for enrichment                | Accepted |
| [0004](./0004-theirstack-predictleads-exa-signals.md) | TheirStack + PredictLeads + Exa for signals             | Accepted |
| [0005](./0005-smartlead-email.md)                     | Smartlead for email sending infrastructure              | Accepted |
| [0006](./0006-unipile-linkedin-whatsapp.md)           | Unipile for LinkedIn + WhatsApp                         | Accepted |
| [0007](./0007-hubspot-crm.md)                         | HubSpot as CRM system of record                         | Accepted |
| [0008](./0008-deterministic-scoring-engine.md)        | Deterministic scoring engine (code computes the number) | Accepted |
| [0009](./0009-send-gate-and-dry-run.md)               | Send gate and dry-run safety rail                       | Accepted |
| [0010](./0010-anti-corruption-adapters.md)            | Anti-corruption adapters                                | Accepted |

## Format

Each ADR follows:

- **Title** — a short noun phrase.
- **Status** — Proposed, Accepted, Superseded.
- **Context** — the forces at play and the constraints.
- **Decision** — what we chose, in the active voice.
- **Consequences** — what becomes easier, what becomes harder, and the residual risk.
