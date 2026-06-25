# Phase 3 — 8-hour autonomous "world-class app" loop

Operator left for ~8 hours with full authority: build, commit, push, merge, deploy, research,
strategize, document, improve — do NOT stop until the window closes. Make all decisions.

## Window
- STARTED_AT_EPOCH: 1782396519  (2026-06-25 18:08 +04)
- STOP_AFTER_EPOCH: 1782425319  (2026-06-26 02:08 +04, 8 hours)
- Cron cadence: twice hourly (:07, :34). The loop self-terminates (CronDelete + final PROGRESS
  summary) once `date +%s` >= STOP_AFTER_EPOCH.

## Mission (operator's words, distilled)
Build the world's best AI GTM app for Huscribe. Every firing: research what current AI GTM software
does, get inspired, strategize, architect, and EXECUTE a real verified increment. Capture ALL prior
research (DSPy/LangChain/LangGraph tooling, data-acquisition, GTM/competitor/pricing, DLD) as
prompt-engineered, world-class MD specs in subfolders so nothing is wasted. After each audit, keep
prompt-engineering and improving. Apply max creativity at roadblocks. Use every tool/framework available.

## Each firing (one solid verified increment)
1. `date +%s`; if >= STOP_AFTER_EPOCH -> CronDelete the loop job, append a final summary to
   docs/autonomous/PROGRESS.md, STOP.
2. Read the tail of docs/autonomous/PROGRESS.md + this file's Backlog to orient.
3. Pick the next theme (rotate; prefer highest leverage). Use a Workflow with parallel specialists for
   substantial work; WebSearch to sharpen against real 2026 AI GTM products.
4. VERIFY before claiming done: typecheck + lint + test (+ web build if apps/web changed). Show evidence.
5. Commit + push to security-hardening-and-searchapi. At a coherent milestone: open/update a PR, merge
   if verify + gitleaks pass, deploy to Fly, verify live (/api/health 200 + releases bump).
6. Tick/append to PROGRESS.md: what changed, evidence, next. Self-improve this contract if you learn something.

## Themes (rotate; each is perpetual — never "finished")
- DOCS: prompt-engineered, world-class MD specs under docs/ capturing all research as actionable specs +
  per-subfolder AGENTS.md/README where missing. (docs/research/, docs/strategy/, docs/architecture/.)
- RESEARCH->BUILD: WebSearch current AI GTM/SDR/voice tools -> a sharp sourced insight -> strategize (MD)
  -> architect -> implement a real increment.
- PRODUCT: make the live end-to-end richer + more real (signals, enrichment, analytics, the close loop).
- UI/UX: polish one screen per cycle (clarity, copy, a11y, demo-readiness for a client screen-share).
- QUALITY: audit (independent/adversarial) -> fix; raise tests/observability/perf.
- GTM ASSETS: founder-facing sell-first assets (discovery DMs, demo script, pilot one-pager, ROI).

## Invariants (NEVER violate)
- DRY_RUN stays true; NOVA stays DEMO_MODE; no live sends/dialing.
- LLM never computes a score (deterministic engine owns the number).
- Anti-corruption boundary; Zod at all external/LLM boundaries; no fabricated PII/signals/findings.
- Secrets only via env/Fly; never commit secrets.
- NO production DB migration (prisma db push/migrate to Neon is owner-gated by the auto-mode guard):
  if a change needs one, build it migration-free or log it BLOCKED with the exact command for the owner.
- Verify before claiming done; show evidence in PROGRESS.

## Known owner-gated items (log, don't fake)
- Neon migration for MessageStatus.approved/rejected + SignalType.transaction_spike/off_plan_launch:
  `pnpm --filter @oie/db exec prisma db push`. Approvals persistence + DLD signal persistence wait on it.
- Live DLD intent: free Dubai Pulse OAuth registration -> DLD_API_KEY/DLD_API_SECRET in env.
- NOVA voice live: api.novalabs.ae down + TDRA legal gate (owner).
