# Autonomous build backlog — Huscribe Revenue OS (world-class, A→Z)

Ordered. The loop picks the next 1–3 unchecked items per firing, does them at world-class quality,
verifies, commits + pushes, ticks the box, and logs to PROGRESS.md. Never commit secrets.

## Deploy (highest priority — finish what's in flight)
- [x] D1  DONE — LIVE at https://huscribe-revenue-os.fly.dev (operator login gp@humai.ae verified, dev
        backdoor dead, dedicated IPv4 109.105.222.142, AUTH_TRUST_HOST+AUTH_URL set, secrets in Fly).
        Build Docker image + fly.toml; create Fly app `huscribe-revenue-os` (region fra); stage all
        secrets from `.env` (DATABASE_URL, AUTH_SECRET, ANTHROPIC_API_KEY, APOLLO_API_KEY,
        THEIRSTACK_API_KEY, SEARCHAPI_API_KEY, NOVA_API_BASE, NOVA_OWNER_EMAIL); set
        AUTH_OPERATOR_EMAIL=gp@humai.ae + AUTH_OPERATOR_PASSWORD_HASH = bcrypt("Huscribe1234");
        NODE_ENV=production; do NOT set ALLOW_DEV_LOGIN. Deploy. Verify HTTPS, login works, dev
        backdoor dead, /signin 200.
- [x] D2  DONE — next.config.mjs now sends CSP + HSTS(2y, preload) + X-Content-Type-Options + X-Frame-Options:DENY
        + Referrer-Policy + Permissions-Policy on every route; poweredByHeader off. CSP verified safe (no
        external origins in app; next/font self-hosts). No NEXT_PUBLIC_* secret leak (only Sentry DSN +
        env-name, both non-secret). force_https + scale-to-zero already in fly.toml. Verified: headers()
        returns routes, web typecheck clean. Shipped via redeploy.
- [x] D3  DONE — `trustHost: true` baked into apps/web/auth.config.ts (belt-and-suspenders vs UntrustedHost;
        no longer one missing env var from a login outage). Web typecheck clean. Shipped via redeploy.

## Docs (world-class, cover the product A→Z) — under docs/revenue-os/
- [x] DOC1 ARCHITECTURE.md — the one system: discover → enrich → NOVA voice → master DB → score → close.
- [x] DOC2 PRODUCT.md — every module (Leads, ICP, Signals, Approvals, Voice, Analytics, Close Room).
- [x] DOC3 GTM.md — reference the strategy brief + Tellref; ICP, offer, pricing, distribution.
- [x] DOC4 SECURITY.md — deploy posture, secrets, auth, the human send-gate, dependency hygiene.
- [x] DOC5 COMPLIANCE.md — UAE PDPL + TDRA, NOVA's compliance gate, consent + provenance + opt-out.
- [x] DOC6 DATA-MODEL.md — Company/Contact/Signal/Score/Message + CallSession/CallFinding; enrichment rules.
- [x] DOC7 VOICE-NOVA.md — integration (place_calls/get_call), demo→live path, the verify-by-conversation moat.
- [x] DOC8 RUNBOOK.md — run locally, deploy, rotate keys, daily operator playbook.
- [x] DOC9 ROADMAP.md — phases incl Dojo/Knowledge port, live calling, master-DB resale.
- [x] DOC10 ADRs — NOVA as the voice layer; one-app consolidation; context-not-contacts; deterministic scoring.

## Finish the single app
- [ ] PORT1 Port Voice Dojo (interactive roleplay + scoring) into the control plane at /dojo.
- [ ] PORT2 Port Knowledge Q&A (grounded over the canon) at /knowledge. Then APEX can retire.

## Quality + ship
- [x] QA1  DONE — typecheck 6/6 clean, lint 6/6 clean (removed 2 stale eslint-disable directives in
        packages/db/src/seed.ts), test 6/6 green. Build proven by the successful Fly remote build (v4).
- [x] QA2  DONE — extracted ROI math to apps/web/app/close/roi-math.ts (pure, +6 tests) and NOVA finding
        extraction to packages/integrations/src/nova/findings.ts (anti-corruption layer, +10 tests).
        190 tests pass total. Canon-grounding tests deferred (LLM-call-shaped; lower value) -> see UPG1.
- [ ] PR1  Open PR `security-hardening-and-searchapi` → main; ensure CI green; merge.

## Continuous, creative + research-driven (operator directive — do this EVERY cycle, never stop)
Be creative. Keep dreaming up strategies and plans grounded in fresh research of what is genuinely
useful and valuable, and keep building + upgrading. This never "finishes" — when the explicit backlog
above is clear, keep cycling these:
- [x] R1  RESEARCH (WebSearch) one high-value angle per cycle: competitors, pricing, voice-AI, MENA
        GTM, compliance changes, data sources, AI sales tactics. Capture a sharp, sourced insight.
- [x] MD1 PROMPT-ENGINEERED MD COVERAGE: ensure EVERY subfolder has a world-class, prompt-engineered
        guide. Create/upgrade, per package and app dir: an AGENTS.md (how an AI agent should work in
        this module: purpose, contracts, invariants, do/don't, examples) + a README. Target dirs:
        packages/{core,db,integrations,orchestration,config}, apps/web, scripts/, and every docs/ subfolder.
        Each file is a reusable, copy-pasteable prompt/spec, not prose filler.
- [x] STRAT1 Turn research into an actionable plan md under docs/strategy/ (one new/upgraded plan per
        cycle: GTM experiments, pricing tests, data-moat build, voice-activation rollout, partnerships).
- [x] SUB1 EXECUTE via specialist sub-agents: use a Workflow with parallel specialists for any
        substantial build/upgrade; adversarially audit; verify; commit + push. Prefer doing real work
        over only planning.
- [ ] P1  Polish one screen (UI/UX, copy, accessibility) per cycle.
- [ ] UPG1 Pick one upgrade that raises quality (tests, observability, a new module feature, perf) and ship it.

Rule: do not stop while time remains in the 8h window. Each firing = research + a concrete shipped
increment + commit/push + PROGRESS log. Keep scheduling/continuing until STOP_AFTER_EPOCH.

## Invariants (never violate)
- DRY_RUN stays true; NOVA stays demo (no live dialing without owner sign-off).
- Secrets only via env/Fly secrets; never commit `.env`.
- LLM never computes scores; Zod/validation at boundaries; no fabricated PII or findings.
- Verify before claiming done; show evidence in PROGRESS.md.
