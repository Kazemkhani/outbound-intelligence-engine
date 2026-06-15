# ADR-0009 — Send gate and dry-run safety rail

**Status:** Accepted

## Context

OIE runs unattended in auto mode. The single most dangerous action it can take is sending a real message to a real prospect — that cannot be undone, and at volume it can damage domain reputation or get accounts banned. A chat instruction ("don't send") is not a safety mechanism: it can be forgotten, overridden, or defeated by prompt injection. The rail must be a code-level check that no instruction can weaken, and it must separate the system-level "are we live" flag from the per-action "did a human approve this" decision so that neither alone can cause a send.

## Decision

Every send-path call routes through **`evaluateSendGate`** in `packages/orchestration/src/send-gate.ts` before touching any provider adapter. Two independent conditions must **both** hold for a real send:

1. `DRY_RUN` is off (system-level, sourced from validated env; defaults true everywhere), **and**
2. the specific action has been explicitly **approved by a human** (per-action).

They are deliberately separate: flipping `DRY_RUN` alone can never cause a send, and an approval can never override `DRY_RUN`. LinkedIn and WhatsApp carry a **third** gate — the channel must be explicitly enabled (off by default). The function is pure and total: every branch returns a decision, there is no implicit "allow". In dry-run the path produces a preview and makes zero network calls. The rail is reinforced by a deny rule and a PreToolUse hook in `.claude/`, never as a chat instruction. `DRY_RUN` stays on in production until Human Gate 2 (explicit live-send approval).

## Consequences

- **Easier:** the system can run fully autonomously up to the point of sending, with confidence that nothing leaves without a human.
- **Easier:** the gate is unit-tested and total; the email and messaging adapters honour `ctx.dryRun` independently as defence in depth.
- **Harder:** every new send path must be wired through the gate first — this is a hard rule, not a convenience.
- **Risk:** none acceptable in weakening it. The gate is load-bearing and is never relaxed; going live is a deliberate one-way door documented in the RUNBOOK.
