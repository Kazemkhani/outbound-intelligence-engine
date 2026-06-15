# ADR-0004 — TheirStack + PredictLeads + Exa for signals

**Status:** Accepted

## Context

Intent signals — who is hiring, who raised funding, who changed jobs, who adopted a technology — are what turn a static list into a timely outbound motion. The signal must be dated so it can decay; an undated "signal" cannot drive intent honestly. We need broad coverage at good value, plus a research path for the bespoke and un-scrapable. No single feed covers hiring, funding, job changes and tech adoption with the freshness and dedup we need.

## Decision

Integrate three signal vendors, each behind the `SignalProvider` interface:

- **TheirStack** (primary) — job postings and technographics from hundreds of thousands of sources, deduplicated and near-real-time. Yields `hiring` and `tech_adoption` signals.
- **PredictLeads** (secondary) — funding, hiring, customer wins, job changes and news events.
- **Exa** (research) — agent-grade neural web search for grounded context and the un-scrapable. Undated results are dropped — an undated signal cannot move intent.

`collectSignals` in our orchestration core owns the fan-in: cross-provider and re-pull deduplication (keep-stronger), a central decay-window assignment, skipping unconfigured providers, and continuing past per-provider errors.

## Consequences

- **Easier:** broad, fresh, dated signal coverage feeding the deterministic intent score; signals decay so stale ones stop influencing scoring.
- **Easier:** swap or add a feed by writing one adapter; the fan-in and decay logic are ours.
- **Harder:** signal taxonomy must be normalised across vendors into our `SignalType` enum.
- **Risk:** double-counting across overlapping feeds; mitigated by `signalDedupeKey` and the keep-stronger rule (a real double-count bug was found and fixed in Phase 4 by exactly this).
