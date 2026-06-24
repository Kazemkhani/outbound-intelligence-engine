# Voice Layer: NOVA Integration

Operator reference for how Huscribe Revenue OS drives NOVA, the operator's own production voice agent (FastAPI + LiveKit, `api.novalabs.ae`). NOVA is the voice surface of the control plane: the Revenue OS dogfoods Huscribe by calling real-estate prospects, qualifying interest, and writing verified facts back to the master database on every call. Source of truth: `scripts/nova-call.ts` and the `CallSession` / `CallFinding` models in `packages/db/prisma/schema.prisma`.

## Why voice, and why this shape

Speed-to-lead is the dominant conversion lever in UAE real estate, and human teams structurally lose it: the average agent first-response is cited at ~917 minutes, ~62% of inquiries arrive outside business hours, and ~78% of buyers transact with the first responder (per NAR data, via industry roundups; AgentZap, https://agentzap.ai/blog/real-estate-lead-statistics). NOVA's pitch is answering inbound "in Arabic and English in under 60 seconds" (the `product` and context strings in `nova-call.ts`). The category is real but commoditizing: voice vendors (Bland, Synthflow, Retell, Vapi) sell per-minute infrastructure (~$0.11-$0.23/min plus $299-$499/mo platform fees), not a qualification-grade, CRM-enriching, compliance-gated motion (Retell, https://www.retellai.com/blog/bland-vs-synthflow). NOVA wins by wrapping commodity minutes in a governed control plane: deterministic scoring it never touches, a built-in consent / DNCR / calling-window gate, DEMO_MODE on by default, and the verify-by-conversation enrichment loop.

## The 4-phase agent

NOVA runs a fixed conversational arc, encoded in `HUSCRIBE_CONTEXT` in `nova-call.ts`:

1. **Greeting**, confirm the named person, permission-based and disarming ("you weren't expecting me, can I borrow 20 seconds?"). Transparent identification of self and Huscribe is mandatory; "never a pretext."
2. **Discovery**, the value-extraction phase and the data we capture: how the prospect handles inbound enquiries after hours or on weekends (agent / call centre / waits till morning), what tools they run leads through (Property Finder or Bayut inbox, a CRM, WhatsApp), and rough monthly enquiry volume.
3. **Pitch**, only on a fit: Huscribe as an AI voice agent answering every enquiry in Arabic and English in under 60 seconds, qualifying the buyer, booking the viewing. Offers a 2-minute clip of a real call.
4. **Close**, secure a WhatsApp opt-in or a follow-up time, and honour any opt-out immediately.

The arc maps to a LiveKit pipeline (LiveKit reports <300ms end-to-end "feels human" and ~85% true-positive semantic turn detection; https://livekit.com/blog/understand-and-improve-agent-latency). The Discovery question about after-hours handling is both the qualifier and the wedge: a prospect who admits enquiries "wait till morning" is a hot ICP match losing the 62% of after-hours leads.

## DSPy pre-call context

Before each call NOVA's DSPy pre-context primer receives the structured `CallRequest` payload from the Revenue OS. Rather than letting the model improvise, the engine hands NOVA the `product` one-liner, the full `HUSCRIBE_CONTEXT` script (the 4-phase arc above), the `goal`, and `goal_criteria` (the exact fields to collect). This is the deterministic-control pattern the market now demands (constrain the LLM with templates and server logic so it does not choose what to report; 72.3% of AI professionals rank explainability/auditability the top accountability factor, https://www.allaboutai.com/resources/llm-hallucination/). The model conducts the conversation; it does not invent the objective.

## The place_calls / get_call contract

NOVA exposes two endpoints. Both `place_calls` (POST `/calls`) and `get_call` (GET `/calls/{id}`) are **public** (no token required). An optional `NOVA_API_KEY` Bearer unlocks account features; its absence is what the script treats as DEMO_MODE.

**place_calls**, POST `/calls` with the `CallRequest` body (the literal sent in `nova-call.ts`):

| Field | Value / meaning |
| --- | --- |
| `owner_email` | `NOVA_OWNER_EMAIL`, default `gp@humai.ae` (the sign-off identity) |
| `product` | Huscribe one-liner used in Pitch |
| `leads` | `[{ phone, name, website? }]`, each `phone` already normalised to E.164 by `toE164()` |
| `context` | `HUSCRIBE_CONTEXT` (the 4-phase script) |
| `goal` | `"qualify_interest"` |
| `language` | `"en"` (NOVA itself runs Arabic + English) |
| `goal_criteria` | the explicit fields to collect (after-hours handling, tools, volume, demo interest) |
| `consent` | `true` |
| `idempotency_key` | `huscribe-<firstPhone>-<pid>` (dedup anchor) |

Response: `{ calls: [{ call_id, context_id, phone? }] }`. In DEMO_MODE the agent joins a LiveKit room `call-<context_id>`; no PSTN dial occurs. The console prints a hint to join the demo conversation via NOVA's `get_demo_token` for that `context_id`.

**get_call**, GET `/calls/{id}` returns the live/final payload: `status` (`pending` | `in_progress` | `completed` | `failed` | `no_answer`), `transcript`, `outcome`, `summary`, `cost_usd`, and `findings`. The script polls the first call ~6 times at 5s intervals, then ingests. The full payload is stored verbatim in `CallSession.raw` for provenance.

The reader is defensive: NOVA's exact shape is not guaranteed, so `extractFindings()` reads several plausible locations and keeps only the seven canonical keys. A missing field yields no finding (the repo invariant: missing data = unknown, never guessed).

## The CallRequest schema and persistence

There is no standalone Zod `CallRequest` type in `packages/core`; the request is the inline POST body above, and the **persisted contract** is the `CallSession` / `CallFinding` Prisma models. On accept, every call is upserted as a `CallSession` (status `pending`) so the control plane shows it immediately, keyed on the unique `novaCallId`, with `novaContextId`, `goal`, `language`, `demoMode`, `consent: true`, and `consentBasis: "operator_initiated_demo"`. `ingestCallResult()` then updates `status`, `transcript`, `summary`, `outcome`, `costUsd`, `optOut`, `raw`, and `completedAt`.

Findings persist as `CallFinding` rows (`key`, `value`, `confidence`, `source: "nova"`). Canonical keys: `identity_confirmed`, `after_hours_handling`, `tools`, `monthly_volume`, `mobile`, `demo_interest`, `opt_in`. `CallSession` has back-relations from both `Company` and `Contact`.

## Demo to live activation path (owner sign-off required)

DEMO_MODE is the default and the safety floor. In the script, `demoMode = !NOVA_KEY`: with no Bearer key, calls dispatch into a LiveKit room only, never the PSTN. Flipping NOVA to live dialing is the NOVA owner's action, not a code change in this repo, and it is gated:

- **Owner sign-off**: `owner_email` (`gp@humai.ae`) is the accountable identity on every request; only the NOVA owner can disable DEMO on the NOVA side.
- **UAE legal prerequisites (blocking, not code)**: TDRA telemarketing approval, a licence-registered local UAE caller-ID, and DNCR access must exist before a single real call. Cabinet Resolution 56 of 2024 restricts marketing calls to 09:00-18:00, bans weekends/public holidays, and carries graduated DNCR fines (AED 50k/75k/150k); PDPL (Federal Decree-Law 45/2021) requires clear, withdrawable consent (https://www.pinsentmasons.com/out-law/news/uae-telemarketing-rules-ensure-businesses-operate-transparency-integrity).
- **Engine-side invariants stay on**: nothing dials without explicit human approval and a passing dry-run; DRY_RUN stays true; secrets live only in Fly secrets. The leads selected for calls are pulled from `Message` rows already in `awaiting_approval` (the same human gate as every other channel).

NOVA's compliance gate (consent / DNCR / calling-window) is fail-closed by design: if no authoritative DNCR status exists for a number, treat it as not-callable. The agent must also disclose it is an automated/AI caller and run the Greeting permission checkpoint before any Pitch.

## The verify-by-conversation moat

This is the durable differentiator. B2B contact data decays ~22.5%/year and stale phone data tanks connect rates (verified numbers lift connect rates materially; https://www.spotlight.ai/post/ai-crm-data-enrichment). NOVA replaces decaying third-party records with conversation-verified facts the moment they are spoken. After a completed call, `ingestCallResult()` enriches the master DB **only for consented sessions** (`if (!session.consent) return`):

- **`mobile` finding** → normalised by `toE164()` and written to `Contact.phone` and `Contact.whatsapp`. This is why the loop exists: most queued numbers are toll-free/landline switchboards (`800..`, `04..`) NOVA cannot dial, so the verify-call captures a dialable mobile.
- **`tools` finding** → tokenised, merged into `Company.techStack`, and recorded as a `tech_adoption` `Signal` (`provider: "nova"`, `strength` from the finding confidence, `evidence` citing the `call_id`).

The compounding loop is the product: the calls that build the database ARE the database. Every consented call confirms identity and enriches the master DB, feeding the deterministic scoring engine in `packages/core` (the LLM never computes a score). Where commodity voice vendors sell minutes, the Revenue OS sells the governed outcome no single tool delivers: verified facts, explainable scores, and a compliance gate UAE brokerages can trust an AI dialer with at all.

## Operator quickstart

```
# From master DB (queued awaiting_approval leads), demo mode:
pnpm exec tsx --env-file=.env scripts/nova-call.ts [limit]

# Single ad-hoc verify call:
pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +971501234567 --name "Ahmed"
```

The script health-checks `GET /health` first, prints `(authed)` vs `(public/demo)`, persists each call as a `CallSession`, polls the first for ~30s, ingests, and writes a `voice.place_calls` `AuditLog` entry. View results in the control plane at `/voice` (live: https://huscribe-revenue-os.fly.dev).
