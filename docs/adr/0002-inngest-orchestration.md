# ADR-0002 — Inngest durable orchestration

**Status:** Accepted

## Context

The outbound pipeline is long-running and event-driven: discovery, an enrichment waterfall, scheduled signal scans, multi-day sequences with delays and branches, stop-on-reply, and signal-triggered enrolment. This needs exactly-once semantics, retries with backoff, durable delays measured in days, and the ability to resume in-flight work after a deploy. Hand-rolled cron jobs plus a queue would re-implement a durable workflow engine badly. A separate decision is where to draw the line between MCP (interactive agent tool calls) and REST/webhooks (the production pipeline).

## Decision

Use **Inngest** durable step functions as the orchestration brain. Sequencing, waterfall schedulers, signal scans and signal-triggered enrolment run as Inngest functions in `packages/orchestration`. Steps are idempotent and resumable; delays, retries and exactly-once execution are provided by the platform. The production pipeline talks to vendors over **REST and webhooks**, never over MCP. MCP is reserved for agents at runtime and for build-time exploration. **The production send-path is never placed behind an interactive MCP call.**

## Consequences

- **Easier:** multi-day cadences, retries and resume-after-deploy come for free; the send step is a single durable step that routes through the send gate.
- **Easier:** a clean MCP-versus-REST rule prevents the fragile pattern of an agent triggering a real send conversationally.
- **Harder:** local development needs the Inngest dev server; durable functions must be written to be idempotent, which is a discipline.
- **Risk:** vendor lock-in to Inngest Cloud for the hosted runtime; mitigated because the orchestration logic (waterfall, signal fan-in, send gate) is plain functions in our core and only the durable wrapper is Inngest-specific.
