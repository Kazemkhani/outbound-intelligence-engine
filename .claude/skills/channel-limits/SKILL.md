---
name: channel-limits
description: LinkedIn and WhatsApp rate limits, human-like delays, per-mailbox email caps, and quiet hours for OIE. Use when touching the Unipile adapter or any channel send step.
---

# Channel limits

These channels are the highest-risk surface in the system. Limits are conservative by design — a banned LinkedIn account or domain blacklist is a failure of the definition of done.

## LinkedIn (via Unipile, authenticated rails)
- **OFF by default.** Explicit operator opt-in that surfaces the risk. Built only after email is proven.
- LinkedIn tightened enforcement in 2026 to roughly **~100 connection requests per account per week** with smarter detection. Operate **well within** that — set conservative weekly and daily caps below the ceiling, never at it.
- **Randomised, human-like delays** between actions; never burst. Spread activity across the day.
- Respect **quiet hours** — no automated activity outside configured local working windows.
- Use Unipile's authenticated rails, which relay LinkedIn's own quotas. Never defeat bot-detection or CAPTCHAs; if blocked, stop and report.
- **Mandatory human approval queue** — nothing sends or connects without a human clicking approve.

## WhatsApp (via Unipile / WhatsApp Business Platform)
- Automating a **personal** number violates WhatsApp's terms. Use the **WhatsApp Business Platform** (approved templates + opt-in) or Unipile's WhatsApp support **with a lawful basis and recipient consent**.
- Same **approval gate** as LinkedIn. Conservative pacing and quiet hours apply.

## Email (per-mailbox, via Smartlead — see email-deliverability)
- **Per-mailbox daily caps**, conservative by default; gradual warmup ramp on new mailboxes.
- Rotate across mailboxes/domains; add jitter; respect quiet hours. Only `verified` emails send.

## Universal rules
- Conservative human-like delays on every channel — randomised, never exact-volume patterns.
- Quiet hours enforced everywhere.
- **Nothing sends on any channel without human approval AND a passing dry-run.** `DRY_RUN` defaults true; automation never flips it and never bypasses the approval queue or the limits.
- Stop a sequence immediately on reply (unified reply sync).
