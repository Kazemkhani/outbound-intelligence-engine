# Autonomous build backlog — Huscribe Revenue OS (world-class, A→Z)

Ordered. The loop picks the next 1–3 unchecked items per firing, does them at world-class quality,
verifies, commits + pushes, ticks the box, and logs to PROGRESS.md. Never commit secrets.

## Deploy (highest priority — finish what's in flight)
- [ ] D1  Build Docker image + fly.toml; create Fly app `huscribe-revenue-os` (region fra); stage all
        secrets from `.env` (DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY, APOLLO_API_KEY,
        THEIRSTACK_API_KEY, SEARCHAPI_API_KEY, NOVA_API_BASE, NOVA_OWNER_EMAIL); set
        AUTH_OPERATOR_EMAIL=gp@humai.ae + AUTH_OPERATOR_PASSWORD_HASH = bcrypt("Huscribe1234");
        NODE_ENV=production; do NOT set ALLOW_DEV_LOGIN. Deploy. Verify HTTPS, login works, dev
        backdoor dead, /signin 200.
- [ ] D2  Harden: confirm secure cookies + HSTS/CSP headers (next.config headers), no NEXT_PUBLIC_* leak
        of any secret, force_https, machine scale-to-zero. Document the live URL.

## Docs (world-class, cover the product A→Z) — under docs/revenue-os/
- [ ] DOC1 ARCHITECTURE.md — the one system: discover → enrich → NOVA voice → master DB → score → close.
- [ ] DOC2 PRODUCT.md — every module (Leads, ICP, Signals, Approvals, Voice, Analytics, Close Room).
- [ ] DOC3 GTM.md — reference the strategy brief + Tellref; ICP, offer, pricing, distribution.
- [ ] DOC4 SECURITY.md — deploy posture, secrets, auth, the human send-gate, dependency hygiene.
- [ ] DOC5 COMPLIANCE.md — UAE PDPL + TDRA, NOVA's compliance gate, consent + provenance + opt-out.
- [ ] DOC6 DATA-MODEL.md — Company/Contact/Signal/Score/Message + CallSession/CallFinding; enrichment rules.
- [ ] DOC7 VOICE-NOVA.md — integration (place_calls/get_call), demo→live path, the verify-by-conversation moat.
- [ ] DOC8 RUNBOOK.md — run locally, deploy, rotate keys, daily operator playbook.
- [ ] DOC9 ROADMAP.md — phases incl Dojo/Knowledge port, live calling, master-DB resale.
- [ ] DOC10 ADRs — NOVA as the voice layer; one-app consolidation; context-not-contacts; deterministic scoring.

## Finish the single app
- [ ] PORT1 Port Voice Dojo (interactive roleplay + scoring) into the control plane at /dojo.
- [ ] PORT2 Port Knowledge Q&A (grounded over the canon) at /knowledge. Then APEX can retire.

## Quality + ship
- [ ] QA1  Run `pnpm verify`; fix anything; keep it green.
- [ ] QA2  Add tests for the new logic (canon grounding, ROI math, finding extraction).
- [ ] PR1  Open PR `security-hardening-and-searchapi` → main; ensure CI green; merge.

## Continuous (every spare iteration)
- [ ] R1  Research one dimension (competitor/pricing/compliance/voice-AI) and fold a sharp insight into docs.
- [ ] P1  Polish UI/UX, copy, accessibility on one screen.

## Invariants (never violate)
- DRY_RUN stays true; NOVA stays demo (no live dialing without owner sign-off).
- Secrets only via env/Fly secrets; never commit `.env`.
- LLM never computes scores; Zod/validation at boundaries; no fabricated PII or findings.
- Verify before claiming done; show evidence in PROGRESS.md.
