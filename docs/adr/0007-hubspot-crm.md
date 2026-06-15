# ADR-0007 — HubSpot as CRM system of record

**Status:** Accepted

## Context

OIE needs a durable system of record for companies, contacts and deals that operators already trust and that integrates with the wider sales stack. The seed ICP is a Gulf SMB motion, where HubSpot is a common default. We need find-or-create semantics (no duplicates), two-way field mapping into the unified model, and ideally an official MCP endpoint for in-product agent reads — all without committing to a vendor we cannot later swap.

## Decision

Use **HubSpot** as the CRM system of record, behind the `CrmStore` interface. It has an official MCP endpoint, a free tier (zero starting cost), the broadest object coverage and an SMB-default footprint that fits the seed ICP. The adapter syncs over REST with find-or-create (idempotent, no duplicates) and two-way mapping to the unified data model; MCP is wired for in-product and agent reads.

Attio, the modern alternative, was considered. HubSpot's official MCP, free tier and ubiquity win for v1; the `CrmStore` interface keeps it swappable.

## Consequences

- **Easier:** zero-cost start, familiar to operators, idempotent sync that round-trips without dupes.
- **Easier:** in-product agents can read CRM state over the official MCP without bespoke plumbing.
- **Harder:** HubSpot's object model must be mapped to and from our unified model; rate limits apply on bulk sync.
- **Risk:** bad data propagating to the CRM; mitigated by find-or-create idempotency — correct the source field and re-sync.
