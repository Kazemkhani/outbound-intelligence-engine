# @oie/mcp — read-only MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
Outbound Intelligence Engine's **deterministic scoring** to operator and agent clients
over stdio. It is **read/compute only**: no database, no secrets, no network, and it is
**never on the send-path** (no email / LinkedIn / WhatsApp / voice). This is the
agent/runtime surface; the production send pipeline stays REST + webhooks (see CLAUDE.md).

## Tools

| Tool              | Input                                  | Returns                                                                                                  |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `score_prospect`  | `{ company, contact, signals[], icp }` | Deterministic fit/intent/composite score + tier + full rationale — the same number the product computes. |
| `describe_engine` | —                                      | Scoring model version, known signal types, and how tiers + the composite blend work.                     |
| `validate_icp`    | `{ icp }`                              | `{ valid: true }` or a list of schema issues — validate an ICP before scoring against it.                |

Input is validated with Zod at the boundary (anti-corruption). The LLM **never** computes
the score; `score_prospect` calls the same `@oie/core` `scoreLead` code the product runs.

## Run

```bash
pnpm --filter @oie/mcp start   # stdio server
```

Point an MCP client at the process. Example client config:

```json
{ "mcpServers": { "oie": { "command": "pnpm", "args": ["--filter", "@oie/mcp", "start"] } } }
```

## Invariants

- Deterministic scoring stays in code; this server only surfaces it.
- Read-only: it computes and reports, it never sends, mutates, or persists.
- No secrets, no DB, no network — safe to attach to any agent.
