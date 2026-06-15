# ADR-0005 — Smartlead for email sending infrastructure

**Status:** Accepted

## Context

Email deliverability is an infrastructure problem: mailbox fleets, AI warmup, inbox rotation, reputation management, bounce and reply webhooks. Building this is a multi-quarter effort that a specialist already does well. The alternative archetypes are a closed all-in-one UI tool (simple, but we are building a code-integrated product, not buying a UI) versus an API-first developer-grade platform.

## Decision

Use **Smartlead** as the email sending infrastructure, behind the `EmailSender` interface. It is API-first with unlimited mailboxes, granular inbox rotation, AI warmup and webhooks for events — the correct choice for a code-integrated product. The adapter honours `ctx.dryRun`: in dry-run it produces a preview and makes zero network calls. Per-mailbox limits, rotation, suppression, one-click unsubscribe and bounce/reply handling sit in the sequencing layer above it.

Instantly, the simpler all-in-one, was considered and not chosen: it is a closed UI, and we are building rather than buying a closed product.

## Consequences

- **Easier:** production deliverability without owning warmup or reputation; dry-run makes the whole email path testable with zero network.
- **Easier:** suppression, unsubscribe and sender identity are enforced in our code before the gate, satisfying CAN-SPAM / GDPR / PECR.
- **Harder:** sending domains must be warmed with SPF/DKIM/DMARC before go-live — a pre-live checklist item, not a code change.
- **Risk:** reputation damage from sending too fast; mitigated by per-mailbox daily limits, rotation, the suppression check before the gate, and quiet hours.
