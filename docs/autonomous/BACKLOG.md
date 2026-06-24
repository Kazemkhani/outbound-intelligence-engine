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
- [x] PORT1 DONE — Voice Dojo live at /dojo (nav link added). Interactive roleplay: 3 canon-grounded
        UAE scenarios (Warm/Tough/Brutal); prospectReply plays the prospect in character (objections from
        OBJECTIONS/VOSS/DUBAI canon), scoreRoleplay grades the operator vs frameworks (SPIN/Challenger/
        Voss/Gap Selling, deep tier) with a JSON scorecard + next-step coaching. LLM never computes the ICP
        score (dojo score is coaching). Input sanitised at the boundary. Verified: typecheck + lint (0
        warnings) + full build OK, /dojo compiled (5.75 kB).
- [x] PORT2 DONE — Knowledge Q&A live at /knowledge (nav link added). Server action askKnowledge grounds
        over the full canon (lib/canon) and answers ONLY from it, names the framework, emits <CONFIRM> for
        unknown Huscribe specifics; LLM never scores. Client workspace: ask box (Cmd/Ctrl+Enter),
        suggestion chips, Q&A thread. Extracted the markdown renderer to components/ui/markdown.tsx (shared
        with Close, DRY). Verified: web typecheck + lint (0 warnings) + test (14) green, full build OK,
        /knowledge route compiled.

## Quality + ship
- [x] QA1  DONE — typecheck 6/6 clean, lint 6/6 clean (removed 2 stale eslint-disable directives in
        packages/db/src/seed.ts), test 6/6 green. Build proven by the successful Fly remote build (v4).
- [x] QA2  DONE — extracted ROI math to apps/web/app/close/roi-math.ts (pure, +6 tests) and NOVA finding
        extraction to packages/integrations/src/nova/findings.ts (anti-corruption layer, +10 tests).
        190 tests pass total. Canon-grounding tests deferred (LLM-call-shaped; lower value) -> see UPG1.
- [x] PR1  DONE — PR #14 MERGED to main (merge commit ec9612c) at 2026-06-24 16:17 UTC. verify PASS
        (2m27s) + gitleaks PASS (both events, after the token + pull-requests:read CI fixes). Only the
        legacy Vercel preview checks failed (commit-author-email; prod is Fly now). main is unprotected.

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

> RECURRING: P1 and UPG1 are perpetual. Do one instance each cycle and LOG it in PROGRESS, but leave
> these boxes UNCHECKED on purpose so "every BACKLOG item is checked" never trips and the loop keeps
> running until STOP_AFTER_EPOCH (operator directive: do not stop while time remains). Cycle log:
>   - cycle 1: UPG1 = Voice Dojo boundary tests (sanitizeHistory + scenarios), +13 web tests.
>   - cycle 2: P1 = Voice Dojo a11y/UX pass (live-region chat, labelled input + key hints, descriptive
>     scenario-card labels + focus ring, focus management, status role on the thinking indicator).
>   - cycle 3: P1 = Knowledge a11y (role=feed answers, sr-only status, focus-to-latest-answer) + shipped
>     the accumulated milestone (PR + Fly redeploy).
>   - cycle 4: R1+STRAT1 = researched 2025-2026 pricing bands (AI-SDR, claygency, voice) and wrote
>     docs/strategy/PRICING.md (high-ticket packaging + pilot-to-paid), addressing the "priced too low"
>     feedback.
>   - cycle 5: UPG1 = extracted the shared markdown parser to components/ui/markdown-parse.ts and added
>     11 tests (used by Close/Knowledge/Dojo). Web suite now 38 tests.
>   - cycle 6: P1 = home/dashboard rebrand to Huscribe Revenue OS + end-to-end copy + surfaced all 9
>     routes (added Voice, Voice Dojo, Close, Knowledge cards). Shipped milestone (PR + Fly redeploy).
>   - cycle 7: UPG1 = public /api/health liveness endpoint + Fly health check; verified live 200 on v8,
>     auth still gates other routes.
>   - cycle 8: UPG1 = tests for lib/canon grounding() (the shared prompt-grounding helper); +7 tests
>     (header/cardinal-rule/<CONFIRM>, case-insensitivity, dedupe, multi-block, unknown-key). Web suite 45.
>   - cycle 9: R1+STRAT1 = researched 2025-2026 lead-response-time stats and wrote
>     docs/strategy/SPEED-TO-LEAD-PROOF.md (sourced proof pack for the pitch + ROI). Batched-merged cycle
>     8+9 to main.
>   - cycle 10: P1/UPG1 = shared accessible CopyButton on generated AI outputs (Close battlecards/outreach,
>     Knowledge answers, Dojo scorecard) so the operator can paste into WhatsApp/email. Shipped (PR + deploy).
>   - cycle 11: UPG1 = observability — capture caught LLM failures (rate limit/overload/empty) to Sentry in
>     lib/llm (no-op without DSN) so AI errors are visible, not just swallowed into a UI message. Shipped.
>   - cycle 12: P1 = signin page rebrand to Huscribe Revenue OS + neutral placeholder; gated the dev-creds
>     panel to non-production (verified the prod build strips dev@oie.local from all served JS). Shipped.
>   - cycle 13: P1 = brand sweep — nav sidebar badge + all 9 page <title>s + root layout title/description
>     rebranded OIE -> Huscribe Revenue OS (middot separator, removed em dashes from titles). Shipped.
>   - cycle 14: UPG1 = tests for the auth public-path allowlist (authorized callback) + trustHost + bounded
>     session; +5 tests. Web suite now 50. Guards a route-gate regression (security/uptime).
>   - cycle 15: STRAT1 = docs/strategy/PILOT-PLAYBOOK.md — a 14-day demo-mode pilot operating playbook
>     (day-by-day) that sequences the strategy into actions and converts a pilot to paid.

Rule: do not stop while time remains in the 8h window. Each firing = research + a concrete shipped
increment + commit/push + PROGRESS log. Keep scheduling/continuing until STOP_AFTER_EPOCH.

## Invariants (never violate)
- DRY_RUN stays true; NOVA stays demo (no live dialing without owner sign-off).
- Secrets only via env/Fly secrets; never commit `.env`.
- LLM never computes scores; Zod/validation at boundaries; no fabricated PII or findings.
- Verify before claiming done; show evidence in PROGRESS.md.
