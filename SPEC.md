# OIE — Outbound Intelligence Engine: SPEC (Phase 0)

> Self-contained build specification. Authoritative source: `PROJECT_BRIEF.md`. This document
> is decision-locked: a fresh engineer can build from it without re-asking. British English throughout.

---

## 0. Mission

Build and deploy the **Outbound Intelligence Engine (OIE)**: a production system a real revenue
team runs to (1) **discover** companies and people matching a defined ICP — including local
businesses via maps data; (2) **enrich** them to a high match rate via a waterfall of best-in-class
providers; (3) detect **buying signals** from the open web (hiring, funding, tech adoption, job
changes); (4) **score and rank** every lead deterministically and explainably against the ICP; and
(5) enrol the best leads into compliant, multi-step **email + LinkedIn + WhatsApp** sequences,
governed by an operator control plane with a **mandatory human approval gate**.

The outcome metric is qualified meetings booked. The system targets an AI-native GTM operator
running outbound at scale, including local SMB / door-to-door and WhatsApp-led selling in the
Gulf/MENA market.

---

## 1. Build-vs-Buy Philosophy

OIE is a **conductor, a brain, and a cockpit** over an orchestra of specialist tools. The value is
in the _seams between_ great tools and the _intelligence and control_ wrapped around them — never in
re-implementing any single tool.

**Buy (integrate — battle-tested, you cannot beat them solo):** multi-provider data & enrichment
waterfall, signal/intent feeds, email sending infrastructure (mailbox fleets, warmup, rotation,
reputation), LinkedIn/WhatsApp messaging rails, the CRM system of record, managed auth for AI tool
access.

**Build (own — the differentiation and defensibility):**

1. **Orchestration brain** — durable workflow engine sequencing the bought rails (source → enrich →
   signal → score → CRM → sequence) with idempotency, retries, dedup, cost caps, and the approval gate.
2. **Deterministic ICP scoring & ranking engine** — explainable, unit-tested. The LLM extracts and
   reasons; **code computes the number**.
3. **Operator control plane** — ranked leads, signal feed, ICP editor with live re-rank, sequence
   builder, approval queue, analytics, channel/mailbox health, cost.
4. **Unified data model + anti-corruption adapters** — one normalised source of truth; swap any
   vendor without touching the core.
5. **Personalisation & signal-action engine** — Claude turns enrichment + the _specific_ signal into
   a reviewed, non-generic opener; fresh signals auto-enrol matching leads through the gate.
6. **Eval & observability layer** — evals for every LLM step, audit log, cost/usage tracking.

**Golden rule:** buy the commodity, build the differentiator. The waterfall and provider-fallback
logic live in _our_ core, calling adapters in priority order — we own the cascade, the cost ceiling,
and the swap.

---

## 2. Committed Stack & Vendor Decisions

All choices are locked. **Verify each provider's current API surface, auth, limits, and pricing
against its official docs at integration time** — do not trust this table or training data for live
details.

### 2.1 Owned core (build)

| Concern             | Choice                                                           | Integrates via |
| ------------------- | ---------------------------------------------------------------- | -------------- |
| Monorepo            | pnpm workspaces + Turborepo                                      | —              |
| Language            | TypeScript (strict)                                              | —              |
| Web + API           | Next.js (App Router) + route handlers / server actions           | —              |
| UI system           | Tailwind + shadcn/ui + lucide-react                              | —              |
| Database            | PostgreSQL (Neon managed; Docker locally)                        | —              |
| ORM / migrations    | Prisma                                                           | —              |
| Validation          | Zod (shared)                                                     | —              |
| Orchestration brain | **Inngest** durable step functions (delays/retries/exactly-once) | —              |
| Auth                | Auth.js (NextAuth)                                               | —              |
| Testing             | Vitest + Playwright + LLM eval harness                           | —              |
| Observability       | pino + Sentry + cost/usage tracker                               | —              |
| Deploy              | Vercel (web) + Inngest Cloud + Neon Postgres                     | —              |

### 2.2 Bought rails (integrate)

| Layer                               | Chosen                                                                       | Integrates via                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Enrichment waterfall hub            | **Clay** (100+ providers, waterfall, Claygent)                               | **REST/webhooks** (production waterfall); MCP read-only → query only |
| Runtime/agent enrichment            | **Explorium** (single credit pool, sync)                                     | **MCP** (agent/in-product sync)                                      |
| Prospecting DB / people data        | **Apollo.io**                                                                | **REST** for search/enrich; **MCP** for agent queries                |
| Local-business discovery            | **Google Places / Maps Platform**                                            | **REST** (Text Search + Place Details)                               |
| Technographics                      | **TheirStack** (+ BuiltWith secondary)                                       | **REST**                                                             |
| Signals / hiring & intent           | **TheirStack** (jobs) + **PredictLeads** (hiring, funding, wins, job-change) | **REST** (scheduled pulls)                                           |
| AI web research                     | **Exa** (neural search)                                                      | **REST/MCP**                                                         |
| Email sending infrastructure        | **Smartlead** (mailboxes, warmup, rotation)                                  | **REST + webhooks**                                                  |
| LinkedIn + WhatsApp + unified inbox | **Unipile** (one API, relays LinkedIn limits)                                | **REST + webhooks**, HITL-gated                                      |
| CRM / system of record              | **HubSpot** (free tier, find-or-create)                                      | **REST + MCP**                                                       |
| MCP gateway / managed auth          | **Composio / Rube**                                                          | **MCP**                                                              |
| LLM                                 | **Anthropic Claude** (Opus/Sonnet/Haiku tiering)                             | **SDK** (structured output)                                          |

### 2.3 MCP vs REST — a load-bearing distinction

- **MCP** = _agents at runtime_ and _build-time exploration_ — interactive tool calls, queries,
  one-off actions with managed auth. Use for querying enriched data, in-product CRM reads/writes,
  runtime enrichment (Explorium), and build-time exploration.
- **REST + webhooks** = the _production pipeline_ — high-throughput, reliable, idempotent,
  observable. Durable workflows source/enrich/signal/score/sequence via REST + webhook events,
  **not** MCP.
- **Rule:** human / in-product-agent triggers it conversationally → MCP. Durable workflow runs it at
  scale unattended → REST/webhooks. **Never put the production send-path behind an interactive MCP
  call.** Clay's MCP is read-only and cannot trigger its waterfall — that runs via webhooks/HTTP.

---

## 2.4 Stable Internal Interfaces (anti-corruption layer)

Every bought rail is wrapped in an adapter under `packages/integrations/<vendor>` that: implements
one of the stable interfaces below; translates vendor payloads to/from the unified data model (§10.2)
so vendor shapes never leak into the core; owns its auth, rate-limit handling, retries, idempotency
keys, error taxonomy, and cost accounting; and is covered by integration tests against **recorded
fixtures** (no live calls in CI). The **waterfall and provider-fallback logic live in our
orchestration core**, calling adapters in priority order.

Signature sketches (illustrative — finalise types in `packages/core`):

```ts
// Shared result envelope: every adapter call reports cost and provenance.
interface ProviderResult<T> {
  data: T;
  provider: string; // vendor id, e.g. "clay"
  cost: { units: number; costUsd: number };
  raw: unknown; // verbatim vendor payload, retained for audit
  fetchedAt: Date;
}

// 1. Enrichment — Clay, Explorium, Apollo, Places.
interface EnrichmentProvider {
  readonly name: string;
  enrichCompany(input: CompanyQuery): Promise<ProviderResult<Partial<Company>>>;
  enrichContact(input: ContactQuery): Promise<ProviderResult<Partial<Contact>>>;
  verifyEmail?(email: string): Promise<ProviderResult<EmailStatus>>; // verified|risky|invalid|unknown
}

// 2. Signals — TheirStack, PredictLeads, Exa.
interface SignalProvider {
  readonly name: string;
  fetchSignals(input: SignalQuery): Promise<ProviderResult<NormalisedSignal[]>>;
  // NormalisedSignal carries type, strength, sourceUrl, evidence, detectedAt, expiresAt.
}

// 3. Email sending — Smartlead.
interface EmailSender {
  readonly name: string;
  ensureCampaign(
    spec: CampaignSpec,
  ): Promise<ProviderResult<{ campaignId: string }>>;
  send(
    msg: OutboundEmail,
    opts: { idempotencyKey: string; dryRun: boolean },
  ): Promise<ProviderResult<{ externalId: string; status: MessageStatus }>>;
  listMailboxes(): Promise<ProviderResult<Mailbox[]>>;
  handleWebhook(event: unknown): Promise<NormalisedActivity[]>; // delivered/opened/replied/bounced
}

// 4. Messaging — Unipile (LinkedIn, WhatsApp). OFF by default; HITL-gated.
interface MessagingChannel {
  readonly name: string;
  readonly channel: "linkedin" | "whatsapp";
  send(
    msg: OutboundMessage,
    opts: { idempotencyKey: string; dryRun: boolean },
  ): Promise<ProviderResult<{ externalId: string; status: MessageStatus }>>;
  limits(): { dailyLimit: number; weeklyConnectLimit?: number };
  handleWebhook(event: unknown): Promise<NormalisedActivity[]>; // incl. inbound replies
}

// 5. CRM — HubSpot. Swappable behind CrmStore.
interface CrmStore {
  readonly name: string;
  upsertCompany(c: Company): Promise<ProviderResult<{ crmId: string }>>; // find-or-create, no dupes
  upsertContact(c: Contact): Promise<ProviderResult<{ crmId: string }>>;
  recordActivity(a: Activity): Promise<ProviderResult<{ crmId: string }>>;
}
```

### 2.5 Module Layout

Organise by **problem domain**, not technical layer.

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

Adapter ↔ interface mapping:

| Package                     | Implements                                |
| --------------------------- | ----------------------------------------- |
| `integrations/clay`         | `EnrichmentProvider`                      |
| `integrations/explorium`    | `EnrichmentProvider`                      |
| `integrations/apollo`       | `EnrichmentProvider`                      |
| `integrations/places`       | `EnrichmentProvider` (local discovery)    |
| `integrations/theirstack`   | `SignalProvider` (+ technographics)       |
| `integrations/predictleads` | `SignalProvider`                          |
| `integrations/exa`          | `SignalProvider` (research)               |
| `integrations/smartlead`    | `EmailSender`                             |
| `integrations/unipile`      | `MessagingChannel` (linkedin, whatsapp)   |
| `integrations/hubspot`      | `CrmStore`                                |
| `integrations/llm`          | Anthropic SDK wrapper (structured output) |

---

## 3. Unified Data Model

Single source of truth across all providers (Prisma; `packages/db`). Vendor shapes never leak into
the core — adapters normalise into these entities.

### 3.1 Entities (§10.2)

- **`IcpProfile`** — versioned ICP configuration (see §6 for the schema, §7 for the seed).
- **`Company`** — `domain` (unique), `name`, `website`, `industry`, `employeeCount`, `revenueBand`,
  `country`, `region`, `lat`, `lng`, `placeId`, `localCategory`, `techStack[]`, `funding` json,
  `socials` json, `sources` json (which provider gave which field), `raw` json per source, timestamps.
- **`Contact`** — `companyId`, `fullName`, `title`, `seniority`, `department`, `email`,
  `emailStatus` (verified/risky/invalid/unknown), `linkedinUrl`, `phone`, `whatsapp`, `sources` json,
  timestamps.
- **`Signal`** — `companyId?`, `contactId?`, `type`, `strength`, `sourceUrl`, `provider`,
  `evidence` json, `detectedAt`, `expiresAt` (decay).
- **`Score`** — `contactId`, `icpProfileId`, `fit`, `intent`, `composite`, `tier`, `rationale`,
  `modelVersion`, `computedAt` (recompute on ICP change).
- **`Sequence`** — `name`, `status`, `steps` json (channel ∈ {email,linkedin,whatsapp}, delayHours,
  templateId, conditions).
- **`Enrolment`** — `contactId`, `sequenceId`, `status`, `currentStep`, `nextActionAt`.
- **`Message`/`Activity`** — `enrolmentId`, `channel`, `direction`, `status`
  (queued/awaiting_approval/sent/delivered/opened/replied/bounced/failed), `body`, `templateId`,
  `externalId`, timestamps.
- **`Mailbox`** — `provider` (smartlead), `email`, `dailyLimit`, `warmupStatus`, `health`, `domain`.
- **`ChannelAccount`** — `provider` (unipile), `type` (linkedin/whatsapp), `handle`, `dailyLimit`,
  `weeklyConnectLimit`, `health`.
- **`Suppression`** — `email`/`domain`, `reason`, `createdAt`.
- **`AuditLog`** — append-only `{ actor, action, entity, entityId, payload, at }`.
- **`ProviderCost`** — `{ provider, task, units, costUsd, at }`.

### 3.2 Dedupe keys (mandatory)

| Entity      | Primary dedupe key                 | Secondary     |
| ----------- | ---------------------------------- | ------------- |
| `Company`   | `domain` (unique)                  | `placeId`     |
| `Contact`   | `email`                            | `linkedinUrl` |
| `Enrolment` | unique (`contactId`, `sequenceId`) | —             |

Re-running discovery/enrichment must never create a duplicate company or contact; provider
attribution is merged into `sources`, never overwritten blindly.

---

## 4. Scope — v1

### In scope (v1)

- Company + people discovery against an ICP, including **local-business discovery** via Google Places.
- Enrichment **waterfall** across Clay (production, webhooks), Apollo (REST), Explorium (MCP runtime),
  with our orchestration owning priority order, fallback, cost ceiling, and dedupe.
- Email **waterfall verification** before any send.
- **Signal detection** from TheirStack (jobs/technographics) + PredictLeads (hiring/funding/wins/
  job-change) on a scheduler; Exa for bespoke research; signal scoring with decay feeding intent.
- **Deterministic ICP scoring & ranking** — fit, intent-with-decay, composite, tiers, rationale —
  with heavy unit tests; recompute on ICP change.
- **HubSpot CRM sync** — find-or-create, two-way field mapping, idempotent.
- **Operator control plane** — ranked leads with detail drawer (enrichment + signal timeline + score
  rationale), ICP editor with live re-rank, signal feed, analytics shell, **approval queue UI**;
  accessible (WCAG AA), with empty/loading/error states.
- **Multi-step sequencing** across email (Smartlead) + LinkedIn + WhatsApp (Unipile), with the
  `DRY_RUN` gate and approval queue wired **first**, per-mailbox limits, rotation, suppression,
  one-click unsubscribe, bounce/reply handling, stop-on-reply.
- **Signal-triggered auto-enrolment** of matching leads — through the approval gate.
- **LLM personalisation** using the _exact_ signal, reviewed before send.
- Compliance plane: CAN-SPAM / GDPR / PECR obligations, channel rate limits, audit log, cost caps.
- Eval harness (10–20 labelled cases per LLM task), observability, daily cost caps.
- Single-operator deployment (Vercel + Inngest Cloud + Neon + Sentry); a pilot dry-run against the
  seed ICP.

### Out of scope (v1)

- Multi-tenant / multi-user accounts, roles, and org management (single operator to start; additive
  later).
- Channels beyond email + LinkedIn + WhatsApp (no SMS, no cold-calling, no ads).
- Hand-rolled email-sending infrastructure, warmup, or deliverability engine (Smartlead owns this).
- Re-implementing any vendor's enrichment, messaging, or CRM internals.
- Custom scraping beyond a last-resort adapter for public data where no API exists (never defeat
  auth/paywalls/bot-detection).
- Live sending of any kind without the explicit human gate (Phase 10 / Human Gate 2).
- Advanced revenue analytics / forecasting, A/B test orchestration at scale, inbox AI auto-reply.
- Mobile apps; non-English UI localisation.

---

## 5. End-to-End Verification Scenario

A concrete walk-through of one lead flowing **discovery → enrichment → signal → score/rank →
sequence enrolment**, running with `DRY_RUN=true` and stopping at the approval queue. Each step names
the **evidence** that proves it.

**Lead:** "Al Noor Trading LLC", a Dubai wholesale/distribution SMB (~60 staff) running Odoo,
hiring a Sales Manager.

1. **Discovery.** An ICP run against "UAE SMB — Sales Teams Running ERP (seed)" calls the Places
   adapter (Text Search around Dubai, `localCategory: wholesaler`) and the Apollo adapter.
   A `Company` row is created with `placeId`, `name`, `lat`/`lng`, `website`, `country=AE`,
   `region=Dubai`.
   _Evidence:_ a `Company` row exists, deduped on `domain`/`placeId`; `sources` records `places`
   and `apollo`; a `ProviderCost` row logs the call; no duplicate company on re-run.

2. **Enrichment.** Orchestration runs the waterfall in priority order: Clay (webhook) →
   Apollo → Explorium, stopping when fields are filled or the cost ceiling is hit. `employeeCount=60`,
   `revenueBand`, `techStack=["Odoo"]` populate the `Company`; a `Contact` "Sara Khan, Sales Manager"
   is created with a **waterfall-verified** email (`emailStatus=verified`) and `linkedinUrl`.
   _Evidence:_ `Company.techStack` contains Odoo; `Contact` exists deduped on `email`/`linkedinUrl`
   with `emailStatus=verified`; `sources` attributes each field to its provider; `raw` retained per
   source; LLM extraction output validated by Zod, no fabricated fields.

3. **Signal.** The scheduled scan calls TheirStack (job postings) and PredictLeads. A `Signal` of
   `type=hiring`, `strength` high, is stored — evidence: a live "Sales Manager" job posting URL,
   `detectedAt` now, `expiresAt` set by decay policy.
   _Evidence:_ a dated `Signal` row linked to the `Company`, with `sourceUrl`, `provider`, and an
   `evidence` json quoting the posting; the signal is fresh (not expired).

4. **Score / rank.** The deterministic scoring engine in `packages/core` computes **fit** from
   firmographics + technographics + people match against the ICP, and **intent** from the
   decay-weighted hiring signal. Composite = `fit*0.6 + intent*0.4`. Suppose `fit=0.85`,
   `intent=0.78` → composite 82 → **Tier A** (≥80). A human-readable `rationale` cites the matched
   ICP facets and the specific signal.
   _Evidence:_ a `Score` row with `fit`, `intent`, `composite=82`, `tier=A`, `rationale`,
   `modelVersion`; the same inputs reproduce the same number (deterministic, unit-tested); **code
   computed the number, not the LLM**.

5. **Sequence enrolment (DRY_RUN, awaiting approval).** Because the lead is Tier A with a fresh
   qualifying signal, signal-triggered enrolment proposes enrolling Sara into the seed-ICP sequence
   (channel priority WhatsApp + LinkedIn + email). LLM personalisation drafts a **signal-specific**
   opener ("noticed you're hiring a Sales Manager…"). The first `Message` is created with
   `status=awaiting_approval`; **nothing sends**.
   _Evidence:_ an `Enrolment` row (unique `contactId`,`sequenceId`) with `status` pending; a `Message`
   with `status=awaiting_approval` and a drafted, signal-grounded body; it appears in the **approval
   queue UI**; `DRY_RUN=true`, so no Smartlead/Unipile send call fired; an `AuditLog` entry records
   the enrolment proposal. The pipeline halts at the human gate.

A passing run of this scenario in dry-run — with all five evidence checks satisfied and **zero**
outbound sends — is the acceptance bar for the integrated pilot.

---

## 6. ICP Configuration Schema (reference)

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
    localCategory?: { values: string[]; weight: Weight }; // Places categories
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

---

## 7. Seed ICP — "UAE SMB — Sales Teams Running ERP (seed)"

Created in Phase 0, seeded into the DB, fully editable. Aligned to a Gulf SMB / WhatsApp-led selling
motion. The architecture is generic; this is the concrete first target.

- **Name:** "UAE SMB — Sales Teams Running ERP (seed)".
- **Firmographics:**
  - industries: retail, food & beverage, jewellery, wholesale/distribution, professional services.
  - employeeCount: 10–200.
  - geographies: UAE (Dubai, Abu Dhabi, Sharjah), with a radius around Dubai.
  - localCategory (Places): restaurant, jewellery_store, retailer, wholesaler.
- **Technographics:**
  - uses: Odoo, Zoho, QuickBooks, SAP Business One, Tally, Microsoft Dynamics (ERPs).
  - WhatsApp Business presence a plus.
- **People:**
  - titles: Owner, Founder, Managing Director, Sales Manager, Head of Sales, Operations Manager,
    Commercial Manager.
  - seniority: c_level, director, manager.
  - departments: sales, operations, commercial.
- **Signals (intent):**
  - hiring — keywords: "BDR", "SDR", "Sales Executive", "Sales Manager", "Tele-sales",
    "Business Development".
  - tech_adoption — new/expanded ERP.
  - news — new branch / expansion.
  - funding.
  - job_change — new commercial leadership.
- **Channel priority:** WhatsApp + LinkedIn + email.
- **Composite blend:** fit **0.6** / intent **0.4**.
- **Tiers:** A ≥ **80**, B ≥ **65**, C ≥ **50**.

---

## 8. Absolute Safety Invariants

These are enforced as a **deny rule in `.claude/settings.json` + a `PreToolUse` hook + a code-level
check** — never as a remembered chat instruction. They are non-negotiable.

- **`DRY_RUN` defaults to `true`.** It is never auto-disabled. Flipping it to `false` requires
  explicit human approval in chat plus a passing dry-run.
- **The approval queue is mandatory.** Every outbound message — on **any** channel — is created with
  `status=awaiting_approval` and only sends after a human clicks approve. The send-path never
  bypasses it.
- **Never auto-send.** Autonomy builds and verifies; it never approves a live send, never loosens or
  removes the approval queue, and never performs an irreversible external action.
- **Never enter secrets.** Do not enter credentials, passwords, API keys, or payment details into any
  field, and never handle secrets in plaintext. If a credential is needed, state which one and let
  the human place it in env. Secrets only via env; nothing secret in git, logs, or errors.
- **Never put the production send-path behind an interactive MCP call** (MCP = agent/runtime + build
  time; REST/webhooks = the pipeline).
- **LinkedIn & WhatsApp OFF by default**, behind the approval queue, within conservative human-like
  limits (well within ~100 LinkedIn connects/week); WhatsApp via the Business Platform / lawful
  consent only. Built last, after every other channel is proven.
- **Verify before sending data:** waterfall-verify emails before send; maintain a global suppression
  list; honour one-click unsubscribe; auto-suppress hard bounces; stop a sequence immediately on reply.
- **Human gates — the only places the autonomous run stops (§3.4):**
  1. **Credentials checkpoint** (once, after Phase 1) — list present vs missing provider keys; do not
     block on missing keys; build and fixture-test every adapter regardless.
  2. **Live-send gate** (hard, never auto-approved) — before `DRY_RUN=false` or any real
     email/LinkedIn/WhatsApp action: stop, require explicit human approval plus a passing dry-run.
  3. **Irreversible/destructive actions** — stop and ask before dropping data, deleting anything not
     self-created, or force-pushing.

> If any path could send without the gate, the build has failed. A system that blacklists the domain
> or bans the LinkedIn account has failed.
