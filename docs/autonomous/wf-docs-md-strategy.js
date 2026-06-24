export const meta = {
  name: 'revenue-os-docs-md-strategy-v2',
  description: 'Specialist sub-agents research + write docs/revenue-os, per-subfolder AGENTS.md, and docs/strategy plans (files written to disk, verified after)',
  phases: [
    { title: 'Research', detail: '4 WebSearch specialists capture sourced insights' },
    { title: 'Docs', detail: '10 specialists write docs/revenue-os/*' },
    { title: 'MD coverage', detail: '7 specialists write AGENTS.md per subfolder' },
    { title: 'Strategy', detail: '3 specialists write docs/strategy/*' },
  ],
}

const REPO = '/Users/Amir/outbound-intelligence-engine'

const GROUND_TRUTH = `
GROUND TRUTH — Huscribe Revenue OS (do not contradict; read repo source to confirm specifics).
- ONE product: "Huscribe Revenue OS" — an end-to-end sales control plane for HumAI selling Huscribe.com
  (Voice-AI inbound lead qualification for UAE/MENA real estate). Operator-first, used by a solo founder.
- LIVE in production at https://huscribe-revenue-os.fly.dev (Fly.io, region fra). Operator login is
  email + bcrypt password (Auth.js v5 / next-auth beta). Dev backdoor is disabled in production.
- Monorepo: pnpm 10 + Turbo, Node 22, TypeScript strict. Layout:
  - packages/core         domain types, Zod schemas, DETERMINISTIC scoring engine. Scores computed in code, NEVER by the LLM.
  - packages/db           Prisma + Postgres (Neon) unified data model, migrations, seed. Models incl Company, Contact, Signal, Score, Message, and now CallSession + CallFinding.
  - packages/integrations vendor adapters (anti-corruption layer). Stable contracts: EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore. Vendor shapes never leak into core; the waterfall/fallback lives in OUR core.
  - packages/orchestration orchestration brain + enrichment waterfall + send gate. DRY_RUN defaults TRUE; approval queue mandatory.
  - packages/config        env loading + validation, fail fast on missing keys.
  - apps/web               Next.js 15 control plane (the UI: Leads, ICP, Signals, Approvals, Voice, Analytics, Close Room).
  - scripts/               operator/ops TS scripts (nova-call.ts, discover-live.ts, seed-huscribe-icp.ts, seed-production.ts, verify-adapters-live.ts, phase*-*.ts).
- THE FLYWHEEL: discover -> enrich (waterfall across vendors) -> NOVA voice qualifies by conversation -> findings enrich the master DB -> deterministic scoring/tiering -> human-gated close. Every call makes the master DB more valuable (the verify-by-conversation moat).
- NOVA: the operator's own production voice agent (api.novalabs.ae), FastAPI + LiveKit, 4 phases
  (Greeting -> Discovery -> Pitch -> Close), DSPy pre-call context, built-in compliance gate
  (consent / DNCR / calling-window). DEMO_MODE: no real PSTN dialing without owner sign-off.
  Integrated via scripts/nova-call.ts (POST /calls, GET /calls/{id}); persists CallSession + CallFinding.
- Model tiering: claude-opus-4-8 (judgement/planning/verify), claude-sonnet-4-6 (personalisation/rationale),
  claude-haiku-4-5 (high-volume parsing). The LLM extracts/reasons over text; CODE computes every score.
- Compliance: UAE PDPL (Federal Decree-Law 45 of 2021) + TDRA telemarketing rules; consent + provenance + opt-out tracked.
- HARD INVARIANTS: DRY_RUN stays true; nothing sends/dials without explicit human approval AND a passing
  dry-run; secrets only via env / Fly secrets, never committed; LLM never computes scores; validate all
  external/LLM input with Zod at the boundary.
- STYLE: no em dashes anywhere (use a colon, comma, or period). Confident, concrete, operator-facing.
  No fabricated metrics, no invented customer names, no made-up PII. If a number is illustrative, label it.
`

const WRITER_RULES = `
YOU ARE A WRITER SUB-AGENT. Rules:
1. You MAY read anything in ${REPO} with Read / Grep / Glob to ground your writing. READ the relevant
   source for your assigned area BEFORE writing so the doc matches reality.
2. You MUST create your assigned file(s) by calling the Write tool with the EXACT absolute path given.
   This is the whole job: a confirmation without a written file is a FAILURE.
3. Do NOT run git, pnpm, npm, builds, installs, or any shell mutation. Do NOT create files other than
   the ones assigned. Do NOT modify source code.
4. NEVER read, print, or write .env / secrets / API keys. If you see a secret value, do not reproduce it.
5. Markdown only. Prompt-engineered and copy-pasteable, not filler. No em dashes. No fabricated metrics or PII.
6. Return ONLY the structured confirmation.
${GROUND_TRUTH}
`

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'insights'],
  properties: {
    topic: { type: 'string' },
    insights: {
      type: 'array', minItems: 3, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['claim', 'evidence', 'source', 'soWhat'],
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          source: { type: 'string' },
          soWhat: { type: 'string', description: 'concrete implication for Huscribe Revenue OS' },
        },
      },
    },
  },
}

const CONFIRM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'written', 'summary', 'approxWords'],
  properties: {
    path: { type: 'string' },
    written: { type: 'boolean', description: 'true only if you actually called Write and it succeeded' },
    summary: { type: 'string' },
    approxWords: { type: 'number' },
  },
}

// ---------------- Phase 1: Research ----------------
phase('Research')
const RESEARCH = [
  { key: 'competitors-pricing', q: 'Research the competitive + pricing landscape (2025-2026) for AI SDR / outbound-intelligence / "clay agency" / lead-enrichment + AI voice qualification platforms. Cover what tools like Clay, Apollo, ColdIQ-style agencies, and AI voice qualifiers charge and how they package. Find concrete pricing and positioning so Huscribe Revenue OS can price as a high-ticket end-to-end system.' },
  { key: 'voice-ai-realestate', q: 'Research AI voice agents for real-estate lead qualification and inbound speed-to-lead in 2025-2026: adoption, ROI evidence, what good discovery/qualification looks like, and buyer objections. Focus on UAE/MENA real estate where useful.' },
  { key: 'uae-mena-gtm', q: 'Research UAE / Dubai real-estate go-to-market in 2025-2026: developers, portals (Bayut, Property Finder), brokerages, lead volume problems, and how a solo founder could land pilots. What channels and messaging work for selling sales-tech to UAE real estate.' },
  { key: 'uae-compliance', q: 'Research UAE compliance for telemarketing + personal data in 2025-2026: PDPL (Federal Decree-Law 45 of 2021), TDRA telemarketing rules / robocall + calling-window restrictions, consent and DNCR requirements. What must an AI voice + outbound platform do to stay compliant.' },
]
const research = (await parallel(RESEARCH.map(r => () =>
  agent(
    `You are a research specialist for Huscribe Revenue OS. Use WebSearch (multiple queries) to investigate:\n${r.q}\n\nReturn 3-6 sharp, SOURCED insights. Each needs a concrete claim, the evidence, the source (name + URL), and a "soWhat" implication for the product. Prefer 2025-2026 sources. No fabrication: if you cannot source a number, say so in evidence.${GROUND_TRUTH}`,
    { label: `research:${r.key}`, phase: 'Research', schema: RESEARCH_SCHEMA }
  )
))).filter(Boolean)

const digest = research.map(r =>
  `### ${r.topic}\n` + (r.insights || []).map(i => `- ${i.claim} (src: ${i.source}). Implication: ${i.soWhat}`).join('\n')
).join('\n\n')
log(`Research done: ${research.length} topics, ${research.reduce((n, r) => n + (r.insights ? r.insights.length : 0), 0)} insights captured`)

// ---------------- Phase 2: Docs ----------------
phase('Docs')
const DOCS = [
  { key: 'ARCHITECTURE', file: `${REPO}/docs/revenue-os/ARCHITECTURE.md`, brief: 'The one system end to end: discover -> enrich (vendor waterfall) -> NOVA voice qualify -> master DB enrichment -> deterministic scoring/tiering -> human-gated close. Show the package boundaries (core/db/integrations/orchestration/config/apps-web), data flow, where DRY_RUN and the send-gate sit, and the model-tiering. Read packages/* to be accurate. Include an ASCII data-flow diagram.', research: false },
  { key: 'PRODUCT', file: `${REPO}/docs/revenue-os/PRODUCT.md`, brief: 'Every module of the control plane: Leads, ICP, Signals, Approvals, Voice (NOVA), Analytics, Close Room. For each: what it does, the operator job it serves, key screens, and the underlying data. Read apps/web to ground module names.', research: false },
  { key: 'GTM', file: `${REPO}/docs/revenue-os/GTM.md`, brief: 'Go-to-market: ICP (UAE/MENA real-estate developers, portals, brokerages), the offer, high-ticket pricing rationale, distribution channels, and the pilot motion (2 free pilots -> paid). Use the research digest. Be concrete and operator-actionable for a solo founder.', research: true },
  { key: 'SECURITY', file: `${REPO}/docs/revenue-os/SECURITY.md`, brief: 'Production security posture: Fly deploy, secrets only in Fly/env (Anthropic key protected), Auth.js v5 operator login (bcrypt) with dev backdoor disabled in prod, AUTH_TRUST_HOST, the human send-gate, dependency hygiene, and what to harden next (secure cookies, HSTS/CSP). Read SECURITY.md and apps/web auth config.', research: true },
  { key: 'COMPLIANCE', file: `${REPO}/docs/revenue-os/COMPLIANCE.md`, brief: 'UAE PDPL + TDRA compliance: NOVA compliance gate (consent / DNCR / calling-window), consent + provenance + opt-out tracking, data minimisation, retention. Use the research digest for current rules. Make it a checklist the operator can act on.', research: true },
  { key: 'DATA-MODEL', file: `${REPO}/docs/revenue-os/DATA-MODEL.md`, brief: 'The data model: Company, Contact, Signal, Score, Message, CallSession, CallFinding and their relationships; enrichment + provenance rules; how scores attach. READ packages/db/prisma/schema.prisma and document what is actually there. Include a fields-per-model summary.', research: false },
  { key: 'VOICE-NOVA', file: `${REPO}/docs/revenue-os/VOICE-NOVA.md`, brief: 'NOVA voice integration: the 4 phases, DSPy pre-call context, the compliance gate, the place_call/get_call flow via scripts/nova-call.ts, DEMO_MODE vs live path, and the verify-by-conversation moat that enriches the master DB. READ scripts/nova-call.ts.', research: false },
  { key: 'RUNBOOK', file: `${REPO}/docs/revenue-os/RUNBOOK.md`, brief: 'Operations: run locally (pnpm install, infra, db, dev), deploy to Fly, rotate keys, and a daily operator playbook (review approvals, run discovery, place demo calls, check analytics). READ the root RUNBOOK.md and package.json scripts. Commands must be real.', research: false },
  { key: 'ROADMAP', file: `${REPO}/docs/revenue-os/ROADMAP.md`, brief: 'Phased roadmap: now (live control plane, demo voice) -> near (Voice Dojo at /dojo, Knowledge Q&A at /knowledge so APEX retires, harden headers) -> next (live calling with consent, master-DB resale, more vendors). Tie phases to the flywheel and to GTM milestones.', research: true },
  { key: 'ADR-README', file: `${REPO}/docs/revenue-os/adr/README.md`, brief: 'An ADR index + 4 short architecture decision records: (1) NOVA as the voice layer, (2) one-app consolidation (OIE + APEX -> Revenue OS), (3) context-not-contacts (enrich + verify by conversation, not buy lists), (4) deterministic scoring (LLM never computes the score). Each ADR: context, decision, consequences.', research: false },
]
const docTasks = DOCS.map(d => () =>
  agent(
    `${WRITER_RULES}\n\nWRITE this file: ${d.file}\nIt is a world-class product doc for Huscribe Revenue OS.\nCover: ${d.brief}\n${d.research ? `\nUse these researched, sourced insights where relevant (cite sources inline):\n${digest}\n` : ''}\nStart with a one-line purpose, then well-structured Markdown with headings, tables where they help, and concrete examples. 500-1100 words. Then call Write at the exact path above and confirm.`,
    { label: `doc:${d.key}`, phase: 'Docs', schema: CONFIRM_SCHEMA }
  )
)

// ---------------- Phase 3: MD coverage ----------------
const MD = [
  { dir: 'packages/core', readme: false, desc: 'domain types, Zod schemas, the deterministic scoring engine (fit/intent/composite/tiers with decay). LLM never computes scores.' },
  { dir: 'packages/db', readme: false, desc: 'Prisma + Postgres (Neon) unified data model, migrations, seed; Company/Contact/Signal/Score/Message/CallSession/CallFinding.' },
  { dir: 'packages/integrations', readme: false, desc: 'vendor adapters + the stable contracts (EnrichmentProvider, SignalProvider, EmailSender, MessagingChannel, CrmStore); anti-corruption layer; waterfall lives in core.' },
  { dir: 'packages/orchestration', readme: false, desc: 'orchestration brain + enrichment waterfall + send gate; DRY_RUN defaults true; approval queue mandatory.' },
  { dir: 'packages/config', readme: false, desc: 'env loading + validation, fail fast on missing keys.' },
  { dir: 'apps/web', readme: false, desc: 'Next.js 15 control plane: Leads, ICP, Signals, Approvals, Voice, Analytics, Close Room; Auth.js v5 operator login.' },
  { dir: 'scripts', readme: true, desc: 'operator/ops TS scripts: nova-call.ts, discover-live.ts, seed-huscribe-icp.ts, seed-production.ts, verify-adapters-live.ts, phase*-*.ts.' },
]
const mdTasks = MD.flatMap(m => {
  const tasks = [() =>
    agent(
      `${WRITER_RULES}\n\nWRITE this file: ${REPO}/${m.dir}/AGENTS.md\nThis is a prompt-engineered guide for an AI agent (or engineer) working INSIDE ${m.dir}.\nThis module: ${m.desc}\nFIRST read the actual source under ${REPO}/${m.dir} (entry points, exports, key types) so the guide is true to the code.\nSections to include: Purpose; Public contract / exports (what other packages import); Invariants (do not violate); How to extend (a worked example of a common change); Do / Don't; Testing; Gotchas. Make it copy-pasteable and specific to THIS module, not generic. 350-700 words. Then call Write and confirm.`,
      { label: `agents:${m.dir}`, phase: 'MD coverage', schema: CONFIRM_SCHEMA }
    )]
  if (m.readme) tasks.push(() =>
    agent(
      `${WRITER_RULES}\n\nWRITE this file: ${REPO}/${m.dir}/README.md\nThis README documents ${m.dir}: ${m.desc}\nFIRST read ${REPO}/${m.dir} to list the actual scripts and what each does. Include: purpose, an index of each script with a one-line description + how to run it (real command, e.g. via tsx/pnpm), required env (names only, never values), and safety notes (DRY_RUN, NOVA demo, never commit secrets). 300-600 words. Then call Write and confirm.`,
      { label: `readme:${m.dir}`, phase: 'MD coverage', schema: CONFIRM_SCHEMA }
    ))
  return tasks
})

// ---------------- Phase 4: Strategy ----------------
const STRAT = [
  { key: 'GTM-EXPERIMENTS', file: `${REPO}/docs/strategy/GTM-EXPERIMENTS.md`, brief: 'A backlog of concrete, runnable GTM experiments for a solo founder selling Huscribe to UAE real estate: hypothesis, channel, what to send/do, success metric, and effort. Prioritised. Pull from the research digest.' },
  { key: 'DATA-MOAT', file: `${REPO}/docs/strategy/DATA-MOAT.md`, brief: 'The plan to build the verify-by-conversation data moat: how each NOVA call enriches the master DB, what fields compound, provenance + freshness, and how the master DB becomes a defensible asset (and eventual resale). Tie to ARCHITECTURE + DATA-MODEL.' },
  { key: 'VOICE-ACTIVATION', file: `${REPO}/docs/strategy/VOICE-ACTIVATION.md`, brief: 'The rollout from DEMO_MODE to compliant live calling: consent capture, calling windows, DNCR, escalation, and the operator approval gate. A staged plan with go/no-go gates. Use the compliance research.' },
]
const stratTasks = STRAT.map(s => () =>
  agent(
    `${WRITER_RULES}\n\nWRITE this file: ${s.file}\nThis is an actionable STRATEGY plan, not prose.\nCover: ${s.brief}\nUse these researched, sourced insights (cite inline):\n${digest}\nFormat as a plan: objective, the steps/experiments as a numbered list or table with owner=operator, metric, and effort. Be concrete and realistic for a solo founder. 450-900 words. Then call Write at the exact path and confirm.`,
    { label: `strategy:${s.key}`, phase: 'Strategy', schema: CONFIRM_SCHEMA }
  )
)

// Run docs + md + strategy together (independent file writes); phase set per-agent above.
const writes = (await parallel([...docTasks, ...mdTasks, ...stratTasks])).filter(Boolean)
const written = writes.filter(w => w.written)
log(`Writes complete: ${written.length}/${writes.length} files reported written`)

return {
  research: research.map(r => ({ topic: r.topic, insights: r.insights ? r.insights.length : 0 })),
  filesReported: writes.map(w => ({ path: w.path, written: w.written, words: w.approxWords })),
  totalReportedWritten: written.length,
}
