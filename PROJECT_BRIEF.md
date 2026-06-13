> # ENVIRONMENT & TOOLING ADDENDUM — READ FIRST (added 2026-06-14)
>
> **This addendum reflects the verified runtime as of June 2026 and OVERRIDES any conflicting tooling instruction in the body below.** The committed product decisions in §13 stand unchanged; only the Claude-Code assumptions are corrected here.
>
> 1. **Model & thinking.** This runs on **Claude Opus 4.8 (1M context)**, which uses **always-on adaptive thinking**. The manual `"ultrathink"`/`"think hard"` keywords referenced in §3.1 are a **no-op** and must not be relied on. Planning depth comes from the session **effort level** (run `/effort` → `max`), not from thinking keywords — adaptive thinking already engages on every turn.
> 2. **Permission posture.** Run in **`--permission-mode auto`** (the classifier), **never** `--dangerously-skip-permissions`. Auto mode's classifier is the §3.1/§3.5 safety layer — it blocks force-push, push-to-main, prod deploys and external sends, none of which bypass mode does. The DRY_RUN / live-send gate (§3.5) MUST be enforced as a **deny rule in `.claude/settings.json` + a `PreToolUse` hook + a code-level check**, never as a remembered chat instruction: auto mode re-reads "boundaries stated in chat" from the live transcript, and context compaction over a long run can silently erase them.
> 3. **Parallelism.** Implement Streams A–D with **native git worktrees** (`claude --worktree <name>`, or `isolation: worktree` in a specialist subagent's frontmatter), NOT the experimental "agent teams" feature (it needs an env flag, costs ~5× tokens, and cannot restore in-process teammates on resume). Cap concurrency at **≤4 streams** (this box is 10-core / 16 GB). Add `.claude/worktrees/` to `.gitignore` and create a `.worktreeinclude` listing `.env` so each worktree gets local config.
> 4. **Acceptance gates.** `/goal` is the correct per-phase gate, but its evaluator **only judges what is printed in the transcript** — it does not run commands or read files. Phrase each phase goal around printed evidence (e.g. "`pnpm verify` printed exit 0 AND the verifier reported no missing requirements") and **always verify BEFORE `/clear`** — clearing erases the transcript the evaluator depends on.
> 5. **MCP reality.** Build-time MCP servers are optional conveniences — **defer all credentialed MCP wiring to Human Gate 1**; nothing in Phases 0–1 needs them. The **HubSpot MCP** is a local stdio server (`npx -y @hubspot/mcp-server`) authenticated with a **private-app access token** — NOT the hosted OAuth URL (it lacks dynamic client registration and fails). **Clay's MCP is read-only and CANNOT trigger the enrichment waterfall** — the production waterfall runs via Clay **REST/webhooks only** (§2.2/§2.3). Keep every send-path rail (Clay, Smartlead, Unipile) behind a REST adapter, never behind MCP.
> 6. **Cost & limits.** Claude Code has **no built-in cost cap**. `DAILY_LLM_COST_CAP_USD` / `DAILY_PROVIDER_COST_CAP_USD` (§13.10) govern the **OIE application's** provider spend and must be enforced in the Inngest orchestration code — they are not a property of the tooling. Input over **200k tokens** incurs long-context pricing, so prefer a lean `PLAN.md`/`CLAUDE.md` plus `/clear` between phases over one ever-growing context.
> 7. **Model tiering (current IDs, June 2026).** `claude-opus-4-8` for hard judgement, planning, and the `verifier`/security subagents; `claude-sonnet-4-6` for personalisation and scoring rationale; `claude-haiku-4-5` for high-volume parsing/classification. `claude-fable-5` is the newest GA model and optional. Set per-subagent via the `model:` frontmatter field. Confirm identifiers and pricing against official docs at build time per §7.
> 8. **Local infrastructure.** Postgres runs locally via Docker on **Colima** (`colima start`, then `docker compose up -d postgres`). **Free disk is tight (~18 GB)** — free more before Phase 3 spawns parallel worktrees, and add a guard that halts the run if free disk drops below ~5 GB.

---

# MASTER BUILD PROGRAM — Outbound Intelligence Engine (OIE)

### Autonomous, integration-first, world-class. Built for Claude Code in auto mode with parallel workstreams.

> **WHAT THIS IS.** The complete, decisions-locked build program for **Claude Code** to autonomously deliver a production outbound sales intelligence platform: prospecting → enrichment → signal detection → ICP scoring/ranking → multi-channel sequencing (email + LinkedIn + WhatsApp) with an operator control plane. Every architectural and vendor decision has been made for you by senior-specialist judgement (see §13). There are **no questions to answer before building** — paste this in, switch on auto mode, and execute.
>
> **WHO IT IS FOR.** An AI-native GTM operator running outbound at scale — including local SMB / door-to-door and WhatsApp-led selling in the Gulf/MENA market, where local-business discovery and WhatsApp are first-class channels.
>
> **HOW TO RUN IT (auto mode + parallel).**
>
> 1. Install Claude Code; open it in an **empty git repository**: `git init && claude`.
> 2. Save this file as `PROJECT_BRIEF.md` in that directory.
> 3. Start an autonomous session: `claude --permission-mode auto` and send:
>    **`Read PROJECT_BRIEF.md in full. Use extended thinking ("ultrathink") to plan, then execute the entire program autonomously per the Autonomous Execution Protocol (§3): bootstrap, then run the parallel workstreams via git worktrees / agent teams, verifying every slice, until all phases pass. Stop ONLY at the defined human gates. Do not cut corners.`**
> 4. Keep your terminal open; respond at the human gates (§3.4) and approve the single live-send gate when you are ready to go live.
>
> **THE THREE GOLDEN RULES.**
> **(1) Buy the commodity, build the differentiator.** You will lose if you try to out-build Clay's enrichment waterfall, Smartlead's deliverability infrastructure, or LinkedIn's messaging rails. Integrate them. Spend engineering on the seams, the intelligence, the control plane, and the experience.
> **(2) Explore → Plan → Implement → Verify.** Plan with deep thinking before building. Never report success without showing evidence. Build the simplest design that fully meets the requirement.
> **(3) Autonomy accelerates building, never sending.** Auto mode builds and verifies unattended. It must **NEVER** auto-approve a real send, auto-disable `DRY_RUN`, enter credentials/secrets, or perform irreversible actions. A human approves every live send. This gate is absolute.

---

## 0. ROLE & MISSION

<role>
You are a **principal platform engineer and systems architect** operating an autonomous engineering team. You know when to integrate versus build, you wrap every third-party rail behind a clean anti-corruption layer, and you design for provider-swap from day one. You are decisive, justify trade-offs in a sentence or two, and refuse to ship anything you cannot verify. You hold a hard line on type-safety, error handling, security, deliverability hygiene, and the human-in-the-loop gate before anything sends. You coordinate specialist subagents and parallel workstreams like a staff engineer running a delivery squad.
</role>

<mission>
Build and deploy the **Outbound Intelligence Engine (OIE)**: a system a real revenue team runs in production to (1) discover companies and people matching a defined ICP — including **local businesses** via maps data, (2) enrich them to a high match rate using a **waterfall** of best-in-class providers, (3) detect **buying signals** from the open web (hiring, funding, tech adoption, job changes), (4) **score and rank** every lead deterministically and explainably against the ICP, and (5) enrol the best leads into automated, compliant, multi-step **email + LinkedIn + WhatsApp** sequences — governed by a clean operator control plane with a mandatory approval gate. Outcome metric: qualified meetings booked. Ship it to production at scale.
</mission>

<non_negotiables>

- **Integrate, don't reinvent.** Bought rails do what they are best at. Owned code is the orchestration brain, the scoring engine, the control/compliance plane, the unified data model, and the UX.
- **No vendor lock-in.** Every external service sits behind an adapter implementing a stable internal interface and feeding one normalised data model. Swapping a provider must not touch the core.
- **Plan deeply, verify everything.** Tests, typecheck, build, and — for UI — screenshots compared to intent. Show evidence. If you cannot verify it, do not ship it.
- **The five pillars are never deferred:** types, error handling, security/secrets, compliance gates, tests.
- **Compliance is a feature.** Deliverability hygiene, channel rate limits, and a mandatory review-before-send gate are part of the definition of done. A system that blacklists the domain or bans the LinkedIn account has failed.
- **Simplicity over cleverness.** Simplest design that fully satisfies the requirement. No speculative abstraction. Delete dead code.
- **British English** in all code comments, UI copy, and docs. Confident, plain, professional register. No emojis in product copy.
  </non_negotiables>

---

## 1. BUILD-VS-BUY PHILOSOPHY — the architecture's core idea

OIE is a **conductor, a brain, and a cockpit** over an orchestra of specialist tools.

**BUY (integrate — battle-tested, you cannot beat them solo):** multi-provider data & enrichment waterfall; signal/intent feeds; email sending infrastructure (mailbox fleets, warmup, rotation, reputation); LinkedIn/WhatsApp messaging rails; the CRM system of record; managed auth for AI tool access.

**BUILD (own — your differentiation and defensibility):**

1. **Orchestration brain** — the durable workflow engine sequencing the bought rails (source → enrich → signal → score → CRM → sequence) with idempotency, retries, dedup, cost caps, and the approval gate.
2. **Deterministic ICP scoring & ranking engine** — explainable, unit-tested; the LLM extracts and reasons, **code computes the number**.
3. **Operator control plane (dashboard)** — ranked leads, signal feed, ICP editor with live re-rank, sequence builder, the approval queue, analytics, channel/mailbox health, cost.
4. **Unified data model + anti-corruption adapters** — one normalised source of truth across all providers; swap any vendor without touching the core.
5. **Personalisation & signal-action engine** — Claude turns enrichment + the _specific_ signal into a reviewed, non-generic opener; fresh signals auto-enrol matching leads (through the gate).
6. **Eval & observability layer** — evals for every LLM step, audit log, cost/usage tracking.

> **Principle of seams:** the value is in the _connections between_ great tools and in the _intelligence and control_ wrapped around them — never in re-implementing any single tool.

---

## 2. THE INTEGRATION ARCHITECTURE — committed stack (final)

All choices are locked (rationale in §13). **Verify each provider's current API surface, auth, limits, and pricing against its official docs at integration time** — do not trust this table or training data for live details.

### 2.1 Owned core (build)

| Concern                 | Choice                                                                         |
| ----------------------- | ------------------------------------------------------------------------------ |
| Monorepo                | pnpm workspaces + Turborepo                                                    |
| Language                | TypeScript (strict)                                                            |
| Web + API               | Next.js (App Router) + route handlers/server actions                           |
| UI system               | Tailwind + shadcn/ui + lucide-react                                            |
| Database                | PostgreSQL (Neon managed; Docker locally)                                      |
| ORM / migrations        | Prisma                                                                         |
| Validation              | Zod (shared)                                                                   |
| **Orchestration brain** | **Inngest** durable step functions (event-driven; delays/retries/exactly-once) |
| Auth                    | Auth.js (NextAuth)                                                             |
| Testing                 | Vitest + Playwright + an LLM **eval harness**                                  |
| Observability           | pino + Sentry + a cost/usage tracker                                           |
| Deploy                  | Vercel (web) + Inngest Cloud + Neon Postgres                                   |

### 2.2 Bought rails (integrate via API + webhooks; MCP where it helps agents)

| Layer                                              | Chosen                                                                                                                                           | Integration                                                                                               | Replaces building                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Enrichment waterfall hub**                       | **Clay** (100+ providers, waterfall, Claygent AI research, native CRM sync)                                                                      | **Webhooks/HTTP** in+out for the production waterfall. Clay's MCP is read-only → query only, not trigger. | A multi-provider enrichment cascade + verification + AI research. |
| **Runtime/agent enrichment**                       | **Explorium** (MCP-native aggregator, single credit pool, sync responses) — _swappable behind the adapter_                                       | **MCP** for agent/in-product sync enrichment.                                                             | An agent-callable enrichment API for conversational/runtime use.  |
| **Prospecting DB / people data**                   | **Apollo.io** (large B2B DB + free MCP + intent)                                                                                                 | REST for search/enrich; **Apollo MCP** for agent queries.                                                 | A people/company database + contact discovery.                    |
| **Local-business discovery**                       | **Google Places / Maps Platform** (Text Search + Place Details)                                                                                  | REST: name, address, lat/lng, place_id, category, website, phone, rating.                                 | A local-business directory for door-to-door / SMB ICPs.           |
| **Technographics**                                 | **TheirStack** (+ BuiltWith as secondary)                                                                                                        | REST: "uses X / avoids Y"; tech-adoption deltas.                                                          | A tech-stack detection engine.                                    |
| **Signals / hiring & intent**                      | **TheirStack** (job postings, 315k+ sources incl. ATS, deduped, near real-time) + **PredictLeads** (hiring, funding, customer wins, job changes) | REST; scheduled pulls into the signal store.                                                              | A multi-source job-posting + intent feed.                         |
| **AI web research**                                | **Exa** (agent-grade neural search)                                                                                                              | REST/MCP for grounded research and the "un-scrapable".                                                    | A research crawler for bespoke context.                           |
| **Email sending infrastructure**                   | **Smartlead** (API-first, unlimited mailboxes, inbox rotation, AI warmup, webhooks)                                                              | REST + webhooks: campaigns, mailboxes, send, events.                                                      | Mailbox fleet, warmup, rotation, reputation, deliverability.      |
| **LinkedIn + WhatsApp + unified inbox**            | **Unipile** (one API: LinkedIn Classic/Sales Nav/Recruiter + WhatsApp + mailbox send/sync; relays LinkedIn rate limits; OAuth, GDPR)             | REST + webhooks. **HITL-gated** (§6.2).                                                                   | Authenticated multi-channel messaging rails + unified reply sync. |
| **CRM / system of record**                         | **HubSpot** (official MCP endpoint; free tier; broad objects; find-or-create)                                                                    | REST + **MCP**.                                                                                           | The durable contact/company/deal store.                           |
| **MCP gateway (agent tool access + managed auth)** | **Composio / Rube** (managed auth for thousands of apps as MCP tools)                                                                            | One MCP connection → many tools, plus direct official MCP (HubSpot, Apollo).                              | Bespoke OAuth/credential plumbing per integration.                |
| **LLM**                                            | **Anthropic Claude** (Opus / Sonnet / Haiku tiering)                                                                                             | SDK with structured tool/JSON output.                                                                     | The reasoning/extraction/writing engine.                          |

### 2.3 MCP vs REST — a load-bearing distinction

- **MCP** = _agents at runtime_ and _you, Claude Code, at build time_ — interactive tool calls, queries, one-off actions with managed auth. Use for: querying enriched data, CRM reads/writes from an in-product AI, runtime enrichment (Explorium), and build-time exploration.
- **REST + webhooks** = the _production pipeline_ — high-throughput, reliable, idempotent, observable. The durable workflows source/enrich/signal/score/sequence via REST + webhook events, **not** MCP. (Clay's MCP cannot trigger its waterfall — that runs via webhooks/HTTP.)
- **Rule:** human/in-product-agent triggers it conversationally → MCP. Durable workflow runs it at scale unattended → REST/webhooks. **Never put the production send-path behind an interactive MCP call.**

### 2.4 Anti-corruption layer (prevents lock-in)

Every bought rail is wrapped in an adapter under `packages/integrations/<vendor>` that: implements a **stable internal interface** (`EnrichmentProvider`, `SignalProvider`, `EmailSender`, `MessagingChannel`, `CrmStore`); translates vendor payloads to/from the **unified data model** (§10.2) so vendor shapes never leak into the core; owns its auth, rate-limit handling, retries, idempotency keys, error taxonomy, and **cost accounting**; and is covered by integration tests against **recorded fixtures** (no live calls in CI). The **waterfall and provider-fallback logic live in our orchestration core**, calling adapters in priority order — we own the cascade, the cost ceiling, and the swap.

### 2.5 Module layout

```
/apps
  /web                      # Next.js control plane (dashboard) + API
/packages
  /core                     # domain types, Zod schemas, the scoring engine (pure, unit-tested)
  /db                       # Prisma schema, client, migrations, seed (the unified data model)
  /orchestration            # Inngest functions: pipelines, waterfall logic, schedulers, send gate
  /integrations             # anti-corruption adapters, one per vendor:
      /clay /explorium /apollo /places /theirstack /predictleads /exa
      /smartlead /unipile /hubspot /llm
  /intelligence             # scoring orchestration, signal scoring+decay, personalisation, evals
  /mcp                      # MCP gateway wiring + direct MCP servers for in-product AI
  /config                   # env loading + validation (fail fast on missing keys)
/infra                      # docker-compose (postgres), deployment notes, runbook
```

Organise by **problem domain**, not technical layer.

---

## 3. AUTONOMOUS EXECUTION PROTOCOL — auto mode + parallel workstreams

This section is how you run the program unattended. Follow it precisely.

### 3.1 Run configuration

- Run in **auto permission mode** (`claude --permission-mode auto`): a classifier approves routine actions and blocks scope escalation, unknown infrastructure, and hostile-content-driven actions. Combine with a **permission allowlist** for known-safe commands (`pnpm *`, `git *`, `gh *`, `npx prisma *`) and **sandboxing** where available.
- Use **extended thinking ("think hard" / "ultrathink")** for Phase 0 planning, the dependency graph, every integration design, and the scoring model — these are the high-leverage decisions.
- Set acceptance checks as **`/goal` conditions** and **Stop hooks** so an unattended run cannot end a phase until its acceptance criteria pass.
- Commit after every slice; use `gh` for PRs. Git is the safety net — never rely on checkpoints alone.

### 3.2 Parallelisation model

After the sequential foundation, run independent workstreams concurrently. Use **git worktrees** (one isolated checkout per stream) or **Claude Code agent teams** (automated coordination with shared tasks and a team lead). You (main session) are the **orchestrator**: you own the dependency order, merge sequence, and conflict resolution. Each stream verifies independently and merges via a PR reviewed by the `verifier` subagent. Use non-interactive `claude -p` for fan-out batch work (e.g. generating adapter stubs, running evals across cases).

**Dependency graph:**

```
Phase 0 (bootstrap) ─▶ Phase 1 (foundation) ─▶ Phase 2 (scoring core)
                                                      │
        ┌───────────────────────────────┬────────────┼───────────────────────┐
        ▼ Stream A (data)                ▼ Stream B   ▼ Stream C (CRM)         ▼ Stream D (frontend)
   Phase 3 discovery+enrichment     Phase 4 signals  Phase 5 HubSpot      Phase 6 control plane
   (Places, Apollo, Clay, Explorium)(TheirStack,     sync                 (uses fixed data model +
                                     PredictLeads,                          API contracts; fixture data)
                                     Exa)
        └───────────────────────────────┴────────────┴───────────────────────┘
                                         ▼ converge
                         Phase 7 sequencing + email + send gate
                                         ▼
                         Phase 8 LinkedIn + WhatsApp (gated)
                                         ▼
                         Phase 9 signal-triggered enrolment + hardening
                                         ▼
                         Phase 10 productionisation + pilot
```

Streams A–D are independent because each is an adapter (or the UI) built against the **fixed unified data model and stable internal interfaces** from Phases 1–2. Cross-cutting subagents (`security-compliance-engineer`, `qa-eval-engineer`, `verifier`) run continuously across all streams.

### 3.3 The autonomous loop per stream

For each stream/phase: enter plan mode and think → write the slice plan into `PLAN.md` → implement in default mode → run `pnpm verify` → run `verifier` against `PLAN.md` → run `security-compliance-engineer` if the slice touches secrets/sends/PII → fix → re-verify → commit/PR. Then proceed without waiting for a human, **except** at the gates below.

### 3.4 Human gates — the ONLY places you stop

1. **Credentials checkpoint (once, after Phase 1).** List exactly which provider keys are present versus missing (read from env). **Do not block on missing keys:** build and **fixture-test every adapter regardless**, and queue _live verification_ of any keyless adapter for when its key arrives. Proceed with everything you can.
2. **Live-send gate (hard, never auto-approved).** Before `DRY_RUN` is ever set to `false`, or before any real email/LinkedIn/WhatsApp action, **stop and require explicit human approval in chat plus a passing dry-run**. Auto mode must never flip this itself.
3. **Irreversible/destructive actions.** Stop and ask before dropping data, deleting anything you did not create, force-pushing, or anything that cannot be undone.

### 3.5 Safety invariants under autonomy (absolute)

- **Never** auto-approve a send, auto-disable `DRY_RUN`, or remove/loosen the approval queue.
- **Never** enter credentials, passwords, API keys, or payment details into any field, and never handle secrets in plaintext. If a credential is needed, state which one and let the human place it in env.
- **Never** attempt to defeat bot-detection or CAPTCHAs; prefer the licensed API. If a non-interactive run is repeatedly blocked by the classifier, **stop and report** rather than escalating.
- If you have corrected the same problem twice, `/clear` that stream and restart with a sharper prompt; do not thrash.

---

## 4. OPERATING PROTOCOL — engineering discipline

### 4.1 Verification is mandatory — close the loop yourself

Before any slice is "done": `pnpm typecheck`, `pnpm lint`, `pnpm test` (new behaviour has new tests), `pnpm build` all pass; for UI, capture a screenshot and compare to intent, list and fix differences. **Show the evidence** — never assert "this works".

### 4.2 Context discipline (your scarcest resource)

Keep `CLAUDE.md` **lean** — only what you cannot infer from code; for each line ask "would removing this cause a mistake?" Use **subagents** for investigation/verification (summaries in, no pollution). `/clear` between unrelated tasks and between phases. Persist progress to `PLAN.md` after each slice so a fresh session resumes with zero re-explanation.

### 4.3 Tooling

MCP gateway (Composio) + direct official MCP (HubSpot, Apollo) for build-time exploration and in-product AI; `gh` for all GitHub ops; **hooks** for lint+typecheck after edits and to **block** writes to `prisma/migrations` and `*.env` without confirmation; the bundled **`/code-review`** skill on each phase's diff; **fetch current provider docs** before integrating rather than assuming the API shape.

---

## 5. THE SPECIALIST CAST — subagents (generate in Phase 0)

You (main session) are the **orchestrator / tech-lead**. Define these specialists in `.claude/agents/*.md`; delegate explicitly; give each only the tools it needs; keep each prompt tight.

1. **integration-engineer** — builds/maintains the anti-corruption adapters (Clay, Explorium, Apollo, Places, TheirStack, PredictLeads, Exa, Smartlead, Unipile, HubSpot). Owns auth, rate-limit handling, retries, idempotency, error taxonomy, cost accounting, fixture tests.
2. **data-architect** — owns the unified Prisma schema, normalisation, dedup (domain / email / linkedin_url), migrations, seed; guards against vendor-shape leakage.
3. **scoring-engineer** — owns the deterministic scoring engine (fit, intent-with-decay, composite, tiers, rationale) and its evals; enforces "code computes the number".
4. **workflow-engineer** — owns the Inngest durable functions: pipelines, waterfall/fallback logic, schedulers, signal-triggered enrolment, idempotency, retries, the send gate.
5. **deliverability-engineer** — owns Smartlead + email health: SPF/DKIM/DMARC checks, warmup, per-mailbox limits, rotation, suppression, bounce/reply handling, quiet hours.
6. **channels-engineer** — owns Unipile for LinkedIn + WhatsApp: connection/message steps, conservative human-like rate limits, the HITL approval queue, unified reply sync.
7. **frontend-engineer** — owns the control plane: design system, leads view, ICP editor with live re-rank, signal feed, sequence builder, approval queue, analytics; accessible (WCAG AA), empty/loading/error states; applies the `frontend-design` skill if present.
8. **mcp-tooling-engineer** — sets up the Composio gateway + direct MCP servers and in-product AI tool access; keeps MCP (runtime/agent) and REST (pipeline) cleanly separated.
9. **security-compliance-engineer** — reviews for secrets, over-broad OAuth scopes, unencrypted tokens, PII over-collection, missing audit logging, missing unsubscribe/suppression, and any send-path that bypasses the gate or rate limits; owns CAN-SPAM/GDPR/PECR obligations in-product.
10. **qa-eval-engineer** — owns unit/integration/e2e tests and the LLM eval harness; runs evals on prompt/model change.
11. **devops-engineer** — owns deploy (web + workers + Postgres), platform secrets/vault, monitoring/alerts, backups, CI, cost dashboards.
12. **verifier** _(adversarial reviewer, model: opus)_ — in a fresh context, checks a diff against `PLAN.md` and the phase's acceptance criteria; reports ONLY missing requirements, correctness bugs, untested required behaviour, secrets/security issues, broken idempotency, and any path that could send without the gate. No style nitpicks. Cites file:line.

---

## 6. COMPLIANCE & RISK — build in, do not bolt on

### 6.1 Email deliverability & law

Sending runs on **Smartlead** (warmup pools, inbox rotation, reputation monitoring) — never hand-rolled. Configure per-mailbox daily caps, gradual ramp, rotation across mailboxes/domains, sending jitter (avoid exact-volume patterns), quiet hours. Require correct **SPF, DKIM, DMARC**; surface a setup checklist and a pre-send domain-health check. **Verify emails (waterfall verification) before send** — bad data burns the domain. Maintain a global **suppression list**; honour **one-click unsubscribe** in every message; auto-suppress hard bounces; **stop a sequence immediately on reply**. Respect CAN-SPAM and, for EU/UK recipients, GDPR/PECR (identity + physical address, honour opt-outs, record basis). Surface these in-product.

### 6.2 LinkedIn & WhatsApp — explicit hard stops

> **LinkedIn's User Agreement prohibits automated scraping and automated connection/messaging; automation risks restriction or permanent ban, and LinkedIn tightened enforcement in 2026 (roughly ~100 connection requests per account per week, smarter detection).** Therefore the LinkedIn channel **must**: be **off by default** with explicit operator opt-in surfacing the risk; operate behind a **mandatory human approval queue** (nothing sends without a human clicking approve); enforce conservative **human-like limits well within ~100 connects/week** with randomised delays; use the authenticated rails (Unipile relays LinkedIn's own quotas); and be built **after** every other channel is proven.
>
> **WhatsApp:** automating a _personal_ number violates WhatsApp's terms. Use the **WhatsApp Business Platform** (templates + opt-in) or Unipile's WhatsApp support **with a lawful basis and recipient consent**, behind the same approval gate. Implement it properly, not as a grey-area hack.

### 6.3 Scraping & data

Prefer **provider APIs** (TheirStack, PredictLeads, Apollo, Exa) over scraping. Custom scraping (Playwright) is a **last-resort adapter** only where no API exists: public data only, never defeat auth/paywalls or bot-detection, honour `robots.txt`, rate-limit and identify the crawler. **Data minimisation:** collect only ICP-relevant fields; support deletion/suppression; document the lawful basis.

---

## 7. ENGINEERING STANDARDS — definition of done

**Types:** TS `strict: true`; **no `any`** without a one-line justification; explicit types at boundaries. Validate all external input (API params, provider payloads, webhooks, LLM output) with Zod at the boundary.
**Resilience:** no empty `catch`; every external call has timeout, bounded retry with backoff + jitter, and a typed failure path. All pipeline operations are **idempotent** with idempotency keys; re-running never duplicates or re-sends.
**Security:** secrets only via env; nothing secret in git/logs/errors; least-privilege OAuth scopes; encrypt provider tokens at rest; append-only **audit log** for every send, enrolment, score change, and data pull.
**Testing & eval:** pure logic (scoring, decay, dedup, waterfall priority, sequence-state, rate-limit math) has thorough **unit tests with fixtures** — the scoring engine is the crown jewel. Integration tests for every adapter against **recorded fixtures**. e2e (Playwright) for critical control-plane flows. **LLM eval harness:** 10–20 labelled cases per LLM task; run on prompt/model change; tune against evals, not vibes.
**Simplicity:** simplest design that fully meets the requirement; no abstraction without a second concrete caller; comments explain **why**; small single-purpose files; delete dead code.
**Cost & model tiering:** Haiku-class for high-volume parsing/classification; Sonnet-class for personalisation and scoring rationale; Opus-class reserved for genuinely hard judgement and planning. Cache LLM + provider results on input hash; track spend per provider/task; enforce configurable **daily cost caps** that halt non-critical work when exceeded. **Confirm current Anthropic model identifiers and all provider API shapes against official docs at build time.**

---

## 8. PROMPT-ENGINEERING STANDARDS for OIE's own LLM steps

Be explicit and specific (exact schema, constraints, edge cases). Structure with XML tags (`<instructions>`, `<context>`, `<input>`, `<output_format>`, `<examples>`); long inputs first. Use structured output (tool/JSON) for anything code-parsed; validate with Zod; handle parse failures. Positive steering with brief motivation. Few-shot (3–5) covering style and tricky cases. **Ground extraction in the source** — quote the span, emit `unknown` rather than guess, **never fabricate a data point or a score**. **Personalisation must use the _exact_ signal** ("you're hiring three SDRs this quarter…"), never generic. Version each prompt in the prompt library with its eval set beside it.

---

## 9. ARTEFACT TEMPLATES (generate in Phase 0)

### 9.1 `CLAUDE.md` (keep LEAN — loads every session)

```md
# OIE — Project memory

## Commands

- Install: `pnpm install`
- Dev (web): `pnpm dev` | Dev (workers): `pnpm inngest:dev`
- Verify (run before claiming done): `pnpm verify` # typecheck + lint + test + build
- DB: `pnpm db:migrate` | `pnpm db:seed` | `pnpm db:studio`
- Single test: `pnpm test <path>`

## Architecture (where things live)

- Scoring engine + domain types: packages/core (scores computed HERE, never by the LLM)
- Unified data model / migrations: packages/db
- Vendor adapters (anti-corruption): packages/integrations/<vendor> (vendor shapes NEVER leak into core)
- Orchestration brain + waterfall + send gate: packages/orchestration (DRY_RUN defaults true; approval queue mandatory)

## Autonomy & integration rules (YOU MUST)

- Auto mode builds + verifies. NEVER auto-approve a send, auto-disable DRY_RUN, or enter secrets. Live send = human gate.
- MCP = agent/runtime + build-time. REST/webhooks = the production pipeline. Never put the send-path behind MCP.
- Every external service sits behind an adapter; the waterfall/fallback logic lives in OUR core, not the vendor.
- Verify every provider's CURRENT API/limits/auth against official docs before integrating; do not assume from memory.

## Hard rules (YOU MUST)

- Plan with deep thinking before multi-file changes. Verify before claiming done; show evidence.
- TS strict; no `any` without a one-line reason. Validate all external/LLM input with Zod.
- Secrets only via env; never commit secrets; update .env.example when adding a key.
- Nothing sends on ANY channel without my approval AND a passing dry-run.
- LinkedIn & WhatsApp OFF by default, behind the approval queue, within conservative limits.
- Prefer the simplest approach. No speculative abstraction. Delete dead code.

## Gotchas

- (fill in as discovered — keep short; prune ruthlessly)
```

### 9.2 `.claude/agents/verifier.md`

```md
---
name: verifier
description: Reviews a diff against PLAN.md; reports only gaps affecting correctness or stated requirements
tools: Read, Grep, Glob, Bash
model: opus
---

You are a staff engineer reviewing a diff in a fresh context. Check it against PLAN.md and the current phase's acceptance criteria. Report ONLY: missing requirements, correctness bugs, untested required behaviour, secrets/security issues, broken idempotency, and any path that could send without the approval gate. No style preferences. Cite file:line. If it meets the criteria, say so plainly.
```

### 9.3 `.claude/agents/security-compliance-engineer.md`

```md
---
name: security-compliance-engineer
description: Reviews for security, secrets, and data-protection/compliance issues
tools: Read, Grep, Glob, Bash
model: opus
---

You are a senior security & compliance engineer. Review for: secrets in code/logs, missing boundary validation, over-broad OAuth scopes, unencrypted tokens at rest, PII over-collection, missing audit logging on sends/enrolments, missing unsubscribe/suppression, and any send-path that bypasses the human approval gate or channel rate limits. Give specific file:line references and concrete fixes.
```

### 9.4 Suggested `.claude/` extras

**Skills** (`.claude/skills/*/SKILL.md`), on demand: `scoring-conventions`, `email-deliverability`, `adapter-contract` (internal interfaces + mapping rules), `channel-limits`. **Hooks** (`.claude/settings.json`): `pnpm lint --fix` + `pnpm typecheck` after edits; block writes to `prisma/migrations` and `*.env` without confirmation. **Slash commands**: `/verify-phase` (run `pnpm verify`, then `verifier` against PLAN.md) and `/ship-phase` (verify → security-compliance review → commit → update PLAN.md).

---

## 10. REFERENCE SCHEMAS

### 10.1 ICP configuration (Zod + Prisma)

```ts
type Weight = number; // 0..1
interface ICPProfile {
  id: string;
  name: string;
  version: number;
  active: boolean;
  firmographics: {
    industries: { values: string[]; weight: Weight };
    employeeCount: { min?: number; max?: number; weight: Weight };
    revenueBand: { values: string[]; weight: Weight };
    geographies: {
      countries?: string[];
      regions?: string[];
      radiusKm?: { lat: number; lng: number; km: number };
      weight: Weight;
    };
    localCategory?: { values: string[]; weight: Weight }; // Places categories (e.g. "restaurant")
  };
  technographics: { uses: string[]; avoids: string[]; weight: Weight };
  people: {
    titles: string[];
    seniority: ("c_level" | "vp" | "director" | "manager" | "ic")[];
    departments: string[];
    weight: Weight;
  };
  signals: {
    type:
      | "hiring"
      | "funding"
      | "tech_adoption"
      | "job_change"
      | "news"
      | "web_change";
    config: Record<string, unknown>;
    weight: Weight;
  }[];
  keywords: { include: string[]; exclude: string[]; weight: Weight };
  compositeBlend: { fit: number; intent: number };
  tierThresholds: { A: number; B: number; C: number };
}
```

### 10.2 Unified data model (Prisma; single source of truth across providers)

- `IcpProfile` — versioned.
- `Company`: `domain` (unique), `name`, `website`, `industry`, `employeeCount`, `revenueBand`, `country`, `region`, `lat`, `lng`, `placeId`, `localCategory`, `techStack[]`, `funding` json, `socials` json, `sources` json (which provider gave which field), `raw` json per source, timestamps. Dedupe on `domain` (+ `placeId`).
- `Contact`: `companyId`, `fullName`, `title`, `seniority`, `department`, `email`, `emailStatus` (verified/risky/invalid/unknown), `linkedinUrl`, `phone`, `whatsapp`, `sources` json, timestamps. Dedupe on `email` / `linkedinUrl`.
- `Signal`: `companyId?`, `contactId?`, `type`, `strength`, `sourceUrl`, `provider`, `evidence` json, `detectedAt`, `expiresAt` (decay).
- `Score`: `contactId`, `icpProfileId`, `fit`, `intent`, `composite`, `tier`, `rationale`, `modelVersion`, `computedAt` (recompute on ICP change).
- `Sequence`: `name`, `status`, `steps` json (channel ∈ {email,linkedin,whatsapp}, delayHours, templateId, conditions).
- `Enrolment`: `contactId`, `sequenceId`, `status`, `currentStep`, `nextActionAt`. **Unique (`contactId`,`sequenceId`).**
- `Message`/`Activity`: `enrolmentId`, `channel`, `direction`, `status` (queued/awaiting_approval/sent/delivered/opened/replied/bounced/failed), `body`, `templateId`, `externalId`, timestamps.
- `Mailbox`: `provider`(smartlead), `email`, `dailyLimit`, `warmupStatus`, `health`, `domain`.
- `ChannelAccount`: `provider`(unipile), `type`(linkedin/whatsapp), `handle`, `dailyLimit`, `weeklyConnectLimit`, `health`.
- `Suppression`: `email`/`domain`, `reason`, `createdAt`.
- `AuditLog`: append-only `{ actor, action, entity, entityId, payload, at }`.
- `ProviderCost`: `{ provider, task, units, costUsd, at }`.

### 10.3 `.env.example` (document every key, no values)

```
# Core
DATABASE_URL=
AUTH_SECRET=
DRY_RUN=true
DAILY_LLM_COST_CAP_USD=25
DAILY_PROVIDER_COST_CAP_USD=50
# LLM
ANTHROPIC_API_KEY=
# Enrichment / data
CLAY_WEBHOOK_URL=
CLAY_API_KEY=
EXPLORIUM_API_KEY=
APOLLO_API_KEY=
GOOGLE_MAPS_API_KEY=
THEIRSTACK_API_KEY=
BUILTWITH_API_KEY=
PREDICTLEADS_API_KEY=
PREDICTLEADS_API_TOKEN=
EXA_API_KEY=
# Sending infrastructure
SMARTLEAD_API_KEY=
# Multichannel messaging
UNIPILE_API_KEY=
UNIPILE_DSN=
# CRM
HUBSPOT_ACCESS_TOKEN=
# MCP gateway
COMPOSIO_API_KEY=
# Observability
SENTRY_DSN=
```

---

## 11. BUILD ROADMAP — autonomous, parallel, each phase shippable

Execute in dependency order (§3.2). **Each phase ends with the §7 quality gate, a `verifier` review against `PLAN.md`, evidence shown, and a commit.** Update `PLAN.md` after each phase; `/clear` between phases. Streams A–D (Phases 3–6) run **in parallel** via worktrees/agent teams once Phases 1–2 are merged.

- **Phase 0 — Autonomous bootstrap (no app code, no interview).** Read this brief; think hard. Because all decisions are locked (§13), generate immediately: `SPEC.md` (self-contained; names files/interfaces, in/out of scope, an end-to-end verification scenario; seeds the §13.2 ICP), the lean `CLAUDE.md` (§9.1), a phased `PLAN.md` with per-phase acceptance criteria and the parallel plan, the **specialist subagents** (§5), the `.claude/` scaffolding (§9.4), and `.env.example` (§10.3). Proceed to Phase 1. (No approval needed here.)
- **Phase 1 — Foundation.** Monorepo, TS strict, Prisma unified schema (§10.2) + Postgres + migrations + seed (incl. the seed ICP), env loading/validation (fail fast), lint/typecheck/test/build + CI + hooks, the empty adapter interfaces. **Then hit Human Gate 1 (credentials checkpoint, §3.4).** Acceptance: `pnpm verify` green from a clean clone; DB migrates and seeds.
- **Phase 2 — ICP + scoring engine (pure core).** Deterministic scoring engine (fit, intent-with-decay, composite, tiers, rationale) with heavy unit tests + fixtures. Acceptance: fixture leads + ICP score/rank correctly and reproducibly; edge cases tested. _(Gate that opens parallel streams A–D.)_
- **Phase 3 — Stream A: discovery + enrichment.** Adapters: **Google Places** (local discovery → normalise → dedupe → store), **Apollo**, **Clay** webhook waterfall, **Explorium** runtime/MCP; **waterfall/fallback orchestration in our core**; LLM extraction (structured output) + eval set; idempotent, cached, cost-tracked. Acceptance: a real ICP run populates Company/Contact with enrichment, no duplicates, provider attribution recorded; evals pass.
- **Phase 4 — Stream B: signals + intent.** Adapters: **TheirStack** + **PredictLeads** (hiring, tech-adoption, funding, job-change) on a scheduler; **Exa** for research; signal scoring with decay feeding intent. Acceptance: a scheduled scan stores dated signals with evidence and visibly moves intent scores.
- **Phase 5 — Stream C: CRM sync.** **HubSpot** adapter with find-or-create (no duplicates), two-way field mapping to the unified model, via REST; MCP wired for in-product/agent reads. Acceptance: enriched, scored leads sync idempotently and round-trip without dupes.
- **Phase 6 — Stream D: operator control plane.** Leads view (ranked, filterable, detail drawer with enrichment + signal timeline + score rationale), ICP editor with **live re-rank**, signal feed, analytics shell, **approval queue UI**; real design system, empty/loading/error states, accessible. Acceptance: e2e flows pass; screenshots match intent.
- **Phase 7 — Sequencing engine + email + send gate.** Inngest durable cadences (steps/delays/branch/stop-on-reply); **wire the `DRY_RUN` gate + approval queue FIRST**; **Smartlead** adapter (campaigns, mailboxes, send, events); per-mailbox limits + rotation + suppression + unsubscribe + bounce/reply handling; LLM personalisation (reviewed, signal-specific). Acceptance: a multi-step email sequence runs end-to-end **in dry-run**, respects limits/idempotency, nothing sends without approval.
- **Phase 8 — LinkedIn + WhatsApp (gated).** **Unipile** adapter per §6.2: channels OFF by default, approval queue mandatory, conservative human-like limits (within ~100 LinkedIn connects/week), WhatsApp via Business Platform/consent; unified reply sync stops sequences on reply. Acceptance: connection/message/WhatsApp steps queue for approval and never fire automatically; limits enforced.
- **Phase 9 — Signal-triggered enrolment + hardening.** Auto-enrol on qualifying fresh signals (through the gate); cost caps enforced; audit-log review; load/limit testing; `RUNBOOK.md`. Acceptance: a fresh "hiring a BDR" signal enrols a matching lead pending approval; caps and audit verified.
- **Phase 10 — Productionisation & pilot.** Deploy (web + workers + Postgres), platform secrets vault, monitoring/alerts, backups, cost dashboards; scale check (queue concurrency, mailbox/account rotation for volume, rate-limit-aware throughput); a **real pilot dry-run** against the seed ICP. **Then Human Gate 2 (live-send approval, §3.4)** before any live send. Acceptance: deployed, observable, documented; pilot reviewed; live send enabled only on explicit human approval.

---

## 12. CREDENTIALS CHECKLIST (Human Gate 1)

Keys required to _live-verify_ adapters (build + fixture-test proceeds without them): Anthropic; Clay (workspace + webhook + key) + Explorium; Apollo; Google Maps (Places enabled); TheirStack (+ BuiltWith); PredictLeads; Exa; Smartlead (+ warmed sending domains/mailboxes with SPF/DKIM/DMARC); Unipile (+ connected LinkedIn account; WhatsApp Business Platform if used); HubSpot token; Composio; platform: Vercel, Inngest Cloud, Neon, Sentry.

---

## 13. COMMITTED DECISIONS — made by senior-specialist judgement (locked)

These replace any interview. Rationale is the consensus view of senior practitioners in each niche.

### 13.1 Stack & vendor decisions (with one-line rationale)

1. **Language/stack: TypeScript monorepo (Next.js, Prisma, Postgres, Inngest, Tailwind/shadcn).** End-to-end type-safety across pipeline ↔ API ↔ UI; one language for a small team; durable step functions are purpose-built for multi-day cadences. _(No Python pipeline — single language wins.)_
2. **Enrichment: Clay (production waterfall via webhooks) + Apollo (people DB & MCP) + Explorium (MCP-native runtime enrichment).** Clay is the dominant, most flexible waterfall orchestrator with native CRM sync; Apollo gives database depth and a free MCP; Explorium covers agent/runtime sync enrichment where Clay's MCP is read-only. All behind adapters → swappable.
3. **Local discovery: Google Places / Maps Platform.** The authoritative local-business source — essential for the door-to-door / SMB motion.
4. **Signals: TheirStack (primary) + PredictLeads (secondary) + Exa (research).** TheirStack aggregates job postings from hundreds of thousands of sources with dedup and near-real-time freshness — the best-value, API-first hiring/tech-intent feed; PredictLeads adds funding/customer-win/job-change breadth; Exa handles bespoke research.
5. **Email sending: Smartlead.** The API-first, developer-grade choice: unlimited mailboxes, granular inbox rotation, AI warmup, webhooks — correct for a code-integrated product. _(Instantly is the simpler all-in-one; not chosen because we are building, not buying a closed UI.)_
6. **LinkedIn + WhatsApp + unified inbox: Unipile.** One authenticated API across LinkedIn, WhatsApp, and mailbox sync; relays LinkedIn's own rate limits; OAuth + GDPR posture — the right rail for a compliant, code-driven multichannel build.
7. **CRM: HubSpot.** Official MCP endpoint, free tier (zero starting cost), broadest object coverage, SMB-default — fits the seed ICP. _(Attio is the modern alternative; HubSpot's official MCP + free tier + ubiquity wins for v1; swappable behind `CrmStore`.)_
8. **MCP gateway: Composio (Rube).** Deepest tool coverage and edge-case handling with managed auth — the cleanest way to give agents many tools without bespoke OAuth plumbing. _(Pipedream is the alternative.)_
9. **Channels in scope: email + LinkedIn + WhatsApp, all three.** WhatsApp is first-class given the Gulf/MENA market and a WhatsApp-led selling motion. Phasing: email (Phase 7) → LinkedIn + WhatsApp (Phase 8), both gated.
10. **Budget caps (defaults, operator-tunable in env): LLM USD 25/day, providers USD 50/day.** Sensible for an early build/pilot; the cost-cap mechanism halts non-critical work when exceeded; raise once unit economics are proven.
11. **Deployment: Vercel (web) + Inngest Cloud (workers) + Neon (Postgres) + Sentry.** Managed, scalable, low-ops; clean separation of web and long-running execution. Single-operator to start; multi-user is a later, additive concern.

### 13.2 Seed ICP (created in Phase 0; fully editable — the architecture is generic)

A concrete first target aligned to a Gulf SMB / WhatsApp-led selling motion:

- **Name:** "UAE SMB — Sales Teams Running ERP (seed)".
- **Firmographics:** industries: retail, food & beverage, jewellery, wholesale/distribution, professional services; employeeCount 10–200; geographies: UAE (Dubai, Abu Dhabi, Sharjah) with a radius around Dubai; localCategory: restaurant, jewellery_store, retailer, wholesaler.
- **Technographics:** uses: Odoo, Zoho, QuickBooks, SAP Business One, Tally, Microsoft Dynamics (ERPs); WhatsApp Business presence a plus.
- **People:** titles: Owner, Founder, Managing Director, Sales Manager, Head of Sales, Operations Manager, Commercial Manager; seniority: c_level, director, manager; departments: sales, operations, commercial.
- **Signals (intent):** hiring (keywords: "BDR", "SDR", "Sales Executive", "Sales Manager", "Tele-sales", "Business Development"); tech_adoption (new/expanded ERP); news (new branch / expansion); funding; job_change (new commercial leadership).
- **Channel priority:** WhatsApp + LinkedIn + email.
- **Composite blend:** fit 0.6 / intent 0.4. **Tiers:** A ≥ 80, B ≥ 65, C ≥ 50.

---

### FINAL REMINDER TO CLAUDE CODE

Decisions are locked — do not re-ask; build. Buy the commodity, build the differentiator. Wrap every rail in an adapter; keep the waterfall and control in our core. MCP for agents/runtime, REST/webhooks for the pipeline. Run in auto mode with parallel worktrees/agent teams; plan with deep thinking; verify before you claim; show evidence. **Autonomy never sends:** never auto-approve a live send, auto-disable DRY_RUN, or enter secrets — stop at the human gates. Treat compliance, channel limits, and the scoring engine's determinism as load-bearing. Verify every provider's current API at build time. Begin with Phase 0 now.
