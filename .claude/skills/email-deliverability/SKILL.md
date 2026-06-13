---
name: email-deliverability
description: Email deliverability and law conventions for OIE — Smartlead caps, warmup, rotation, authentication, suppression, unsubscribe, quiet hours, CAN-SPAM/GDPR/PECR. Use when touching the Smartlead adapter or any email send path.
---

# Email deliverability conventions

Sending runs on **Smartlead** — warmup pools, inbox rotation, reputation monitoring. Never hand-roll sending. A system that blacklists the domain has failed.

## Authentication (pre-send gate)
- Require correct **SPF, DKIM, and DMARC** on every sending domain. Surface a setup checklist in-product and run a pre-send domain-health check.
- Block sending from any domain/mailbox failing the health check.

## Caps, ramp, rotation, jitter
- Per-mailbox **daily caps**, conservative by default. Gradual warmup ramp on new mailboxes — start low, increase slowly; do not blast a cold mailbox.
- Rotate sends across mailboxes and domains rather than concentrating volume.
- Add sending **jitter** so volume is not an exact, detectable pattern.
- Respect **quiet hours** — no sends outside configured local sending windows.

## Data quality
- **Verify emails (waterfall verification) before send.** Only `verified` status sends by default; `risky`/`invalid`/`unknown` do not send. Bad data burns the domain.

## Suppression, unsubscribe, replies, bounces
- Maintain a **global suppression list**; check it before every send, not after.
- Include **one-click unsubscribe** in every message; honour opt-outs immediately and permanently.
- **Auto-suppress hard bounces.**
- **Stop the sequence immediately on reply.**

## Law
- **CAN-SPAM:** accurate headers, no deceptive subject lines, sender identity, a physical postal address, and a working opt-out.
- **EU/UK (GDPR/PECR):** include identity + physical address, honour opt-outs, and record the lawful basis for contacting each recipient.
- Surface all of this in-product — compliance is a feature, not a footnote.

## Reminder
Nothing sends without `DRY_RUN=false` AND explicit human approval AND a passing dry-run. Automation never flips that.
