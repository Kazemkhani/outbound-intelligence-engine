# ADR-0006 — Unipile for LinkedIn + WhatsApp

**Status:** Accepted

## Context

LinkedIn and WhatsApp are authenticated messaging rails with strict, account-risking rate limits and no general-purpose public send API. WhatsApp is first-class for the Gulf/MENA market and a WhatsApp-led selling motion. Building or scraping these rails directly is fragile and gets accounts banned. We need one compliant API that relays the platforms' own rate limits and supports unified reply sync, behind a strong human-in-the-loop gate.

## Decision

Use **Unipile** for LinkedIn (Classic / Sales Navigator / Recruiter) and WhatsApp, plus mailbox send and sync, behind the `MessagingChannel` interface. It exposes one API across channels, relays LinkedIn's rate limits, and has an OAuth + GDPR posture. Channels are **off by default** (`channelEnabled` plus `ChannelAccount.enabled=false`) and pass through the send gate's third condition. Limits are conservative and human-like (weekly connect limit 80, well within LinkedIn's ~100/week). `parseUnipileWebhook` drives unified reply sync, which stops sequences on reply. The adapter honours `ctx.dryRun` with zero network in dry-run.

## Consequences

- **Easier:** compliant multi-channel messaging and reply sync from one API; no scraping.
- **Easier:** channels cannot fire by accident — three independent gates (DRY_RUN, approval, channel-enabled).
- **Harder:** WhatsApp requires Business Platform and consent; LinkedIn volume must stay conservative and human-paced.
- **Risk:** account warnings or bans from over-sending; mitigated by off-by-default channels, conservative weekly limits, human-like delays, quiet hours and the approval queue.
