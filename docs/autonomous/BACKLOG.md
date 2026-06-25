# Autonomous build backlog — Huscribe Revenue OS (world-class, A→Z)

Ordered. The loop picks the next 1–3 unchecked items per firing, does them at world-class quality,
verifies, commits + pushes, ticks the box, and logs to PROGRESS.md. Never commit secrets.

## Next-phase build (ACTIVE — Phase 2 from docs/architecture/TARGET-ARCHITECTURE.md + BUILD-PLAN.md)
Work top-down. Offline/pure-TS items first so the build always stays green. Each firing: ONE item, verified
(typecheck/lint/test/build), commit + push, and at a milestone open/merge a PR + deploy. Respect every
invariant (deterministic scoring stays code; DRY_RUN + send-gate untouched; anti-corruption boundary; secrets
only in env/Fly; NOVA stays DEMO_MODE).
- [x] NX1  DONE — DLD / Dubai Pulse SignalProvider adapter (packages/integrations/src/dld): mapper +
        adapter + fixture + 10 tests. Maps Dubai-Pulse rows to transaction_spike (ratio-scaled, saturates
        at 3x) + off_plan_launch (0.8). Anti-corruption: vendor shapes confined to ./mapper. Not wired to
        live ingestion (DB migration + spike GO still gated). Exported as DLDAdapter. typecheck + lint +
        test green (194 integrations tests).
- [x] NX2  DONE — Suppression extended to phone + per-channel scope. SuppressionRecord gained phone? +
        channel? (optional, so existing rows stay valid); isSuppressionMatch is now exported as the pure
        util, matches email/domain/phone (digits-only), and honours channel scope (unscoped = global
        opt-out). executeSendStep takes recipientPhone. +7 tests. DB column migration deferred + documented
        (packages/db/PLAN.md). typecheck + lint + test green (87 orchestration).
- [x] NX3  DONE — Durable send-gate. runEnrolment now step.waitForEvent on "oie/send.approved" (matched to
        the enrolment, 3d timeout) before the send, BUT only when DRY_RUN is off and not pre-approved, so the
        demo/dry-run path is unchanged. New pure approval.ts (SEND_APPROVED_EVENT + approvalFromEvent; timeout
        falls back to pending = never sends). +9 tests prove resume re-checks DRY_RUN: dryRun on + approved =
        simulate; reject = blocked; timeout = blocked. typecheck 6/6, lint clean, test 96 orchestration.
- [x] NX4  DONE — Enrichment waterfall hardening + quiet hours. (a) enrichCompanyWaterfall gained an
        optional runStep hook so each provider can be memoised under its own Inngest step.run (replay
        re-runs only what failed); wrapped call returns a value so the cascade still falls through on error.
        (b) runEnrolment got declarative concurrency [{key: enrolmentId, limit: 1}] + throttle {50/1m}.
        (c) New pure quiet-hours.ts: isWithinCallingWindow + UAE_CALLING_WINDOW (09-18 Asia/Dubai, Mon-Fri),
        the TDRA calling-window gate (module now; wired into live send when voice activates). +12 tests.
        typecheck 6/6, lint 6/6, test 392.
- [x] NX5  DONE (harness) — promptfoo eval harness: evals/promptfooconfig.yaml (a canon-grounded system
        prompt mirroring lib/canon rules + 4 cases: <CONFIRM> on pricing/proof, llm-rubric framework-cited
        + UAE-specific, and a global no-em-dash assertion) + evals/README.md + `pnpm eval`/`eval:view`
        scripts via npx (NO devDep added, so the build stays 100% green). LIVE RUN + CI pass-rate gate are
        BLOCKED: promptfoo must call the model and CI has no ANTHROPIC_API_KEY (owner action to add it).
- [x] NX6  DONE (Knowledge) — Streaming AI UI via Vercel AI SDK. Added ai ^6 + @ai-sdk/anthropic ^3 to
        apps/web (install + full build stayed green). lib/llm streamAsk() returns a text-stream Response
        (Anthropic provider, model tiers, key lazy + never logged, Sentry onError). New auth-gated route
        app/api/ask (zod-validated, canon-grounded) streams the answer. KnowledgeWorkspace now streams the
        answer token-by-token via fetch + ReadableStream. Close/Dojo wiring is the follow-up (NX6b).
        Verify: web typecheck + lint (0 warnings) + test (50) + full build OK (/api/ask compiled).
- [ ] NX7  Observability spine: one OTel GenAI span at LlmClient.complete fanning to Sentry + Langfuse +
        cost-per-lead metadata. (No-op without the DSN env; never logs the key.)
- [ ] NX8  shadcn/ui + Tremor analytics dashboard + TanStack Table for /leads + /approvals. (Adds deps.)
- [ ] NX9  AgentKit on Inngest: an agent layer over the existing adapters, code router calling the scorer +
        evaluateSendGate as CODE steps (never an LLM). (Adds a dep.)
- [ ] NX10 One read-only internal MCP server (TS SDK) for operator/Claude agents. Never the send-path.

Next-phase guardrails (in addition to the Invariants below):
- A new npm dependency may be added ONLY if `pnpm install` succeeds AND `pnpm verify` (or typecheck+lint+test+build)
  stays green. If not, revert it and log BLOCKED.
- Any item needing an external API key, a production DB migration, or owner sign-off (live UAE PSTN / TDRA)
  is BLOCKED: log it under BLOCKED in PROGRESS.md and move to the next item. Do not fake or stub a secret.
- NOVA stays DEMO_MODE and DRY_RUN stays true for the entire phase.


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
>   - cycle 16: UPG1 = docs/README.md — a master documentation index (start-here, product docs, strategy
>     kit, ADRs, engine foundation, build log). All links verified to resolve.
>   - cycle 17: UPG1 = root README Documentation section now points to docs/README.md (the map) + the
>     revenue-os product docs + the strategy/sales kit. Links verified.
>   - cycle 18: QA = end-of-run full-repo green check — typecheck 6/6, lint 6/6 (0 warnings), test 6/6
>     (347 tests pass total). Prod healthy: /api/health 200 on v12.

Rule: do not stop while time remains in the 8h window. Each firing = research + a concrete shipped
increment + commit/push + PROGRESS log. Keep scheduling/continuing until STOP_AFTER_EPOCH.

## Invariants (never violate)
- DRY_RUN stays true; NOVA stays demo (no live dialing without owner sign-off).
- Secrets only via env/Fly secrets; never commit `.env`.
- LLM never computes scores; Zod/validation at boundaries; no fabricated PII or findings.
- Verify before claiming done; show evidence in PROGRESS.md.
