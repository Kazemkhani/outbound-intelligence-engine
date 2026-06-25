# AGENTS.md — working in `@oie/mcp`

Purpose: a **read-only** Model Context Protocol server exposing the engine's deterministic
scoring to operator/Claude agents. Agent/runtime surface only — never the send-path.

## Contracts
- Tools register via `registerReadOnlyTools(server, clock?)` in `src/tools.ts`.
- Each tool validates its input with Zod (`scoreProspectInput`, `icpProfile`) at the boundary.
- Scoring goes through `@oie/core` `scoreLead(subject, icp, now)` — code, never an LLM.
- `now` is injected via `clock` (default wall-clock) so scores are reproducible in tests.

## Invariants (do not break)
- READ/COMPUTE ONLY. No DB, no secrets, no network, no sending of any kind.
- The LLM never computes a score; this server only surfaces the deterministic engine.
- stdout is the MCP transport — log only to **stderr** (`process.stderr.write`).
- Keep the anti-corruption boundary: agent JSON in → typed subject → core scorer.

## Do / Don't
- DO add new read-only tools by writing a pure function + a `server.registerTool` wrapper,
  and unit-test the pure function (not the transport).
- DO keep tools side-effect free and deterministic given `(input, now)`.
- DON'T add a tool that writes, sends, enrolls, or touches a vendor send API — that belongs
  behind the orchestration send-gate, not here.
- DON'T read `Date.now()` inside scoring; pass `now` from the boundary.

## Example: add a tool
```ts
export function summarize(args: MyArgs): MyResult { /* pure */ }
server.registerTool("my_tool", { title, description, inputSchema: myShape },
  (args) => ({ content: [{ type: "text", text: JSON.stringify(summarize(args as MyArgs)) }] }));
```

## Verify
`pnpm --filter @oie/mcp typecheck && pnpm --filter @oie/mcp lint && pnpm --filter @oie/mcp test`
