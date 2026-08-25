#!/usr/bin/env node
/**
 * Outbound Intelligence Engine — read-only MCP server (stdio).
 *
 * Exposes the engine's deterministic scoring + reference tools to operator and
 * Claude agents over the Model Context Protocol. Read/compute only: no DB, no
 * secrets, no network, and NEVER the send-path. Run it with `pnpm --filter
 * @oie/mcp start` and point an MCP client at the process over stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadOnlyTools } from "./tools";

async function main(): Promise<void> {
  const server = new McpServer({ name: "outbound-intelligence-engine", version: "0.1.0" });
  registerReadOnlyTools(server);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the MCP channel; log readiness to stderr only.
  process.stderr.write("[oie-mcp] read-only server ready on stdio\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`[oie-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
