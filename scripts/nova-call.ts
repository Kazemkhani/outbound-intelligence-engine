/**
 * NOVA voice loop — the Revenue OS dogfooding Huscribe's own voice agent.
 *
 * Pulls queued leads from the master database, hands each to NOVA
 * (api.novalabs.ae, the team's production 4-phase LiveKit agent) to run a
 * VERIFY + DISCOVER + PITCH call, then ingests the result. Every call confirms
 * the contact, enriches the master DB, and qualifies them for Huscribe — the
 * flywheel where the calls that build the database ARE the product.
 *
 * NOVA is in DEMO MODE: place_calls dispatches the agent into a LiveKit room
 * (room = call-<context_id>); no real PSTN dial happens until the NOVA owner
 * flips it on. place_calls / get_call are PUBLIC (no token needed); a
 * NOVA_API_KEY (Bearer) unlocks account features if set.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/nova-call.ts [limit]
 *       pnpm exec tsx --env-file=.env scripts/nova-call.ts --phone +971501234567 --name "Ahmed"
 */
import { prisma } from "../packages/db/src/index";

/* eslint-disable no-console -- operator voice script */
const NOVA_BASE = (process.env.NOVA_API_BASE ?? "https://api.novalabs.ae").replace(/\/$/, "");
const NOVA_KEY = process.env.NOVA_API_KEY?.trim();
const NOVA_OWNER = process.env.NOVA_OWNER_EMAIL?.trim() ?? "gp@humai.ae";

// The call objective handed to NOVA's DSPy pre-context + 4-phase agent
// (Greeting → Discovery → Pitch → Close). Transparent, consented, value-first:
// confirm identity, learn their inbound setup + stack, then pitch Huscribe.
const HUSCRIBE_CONTEXT = [
  "You are calling on behalf of Huscribe, an AI startup in Dubai. Be transparent: identify yourself and Huscribe; this is real research plus a soft offer, never a pretext.",
  "GREETING: confirm you are speaking to the named person. Permission-based, disarming: 'you weren't expecting me, can I borrow 20 seconds?'",
  "DISCOVERY (value-first, this is the data we capture): how do they handle inbound property enquiries that arrive after hours or on weekends (agent / call centre / waits till morning)? what tools do they run those leads through (Property Finder or Bayut inbox, a CRM, WhatsApp)? roughly how many enquiries a month?",
  "PITCH (only if a fit): Huscribe is an AI voice agent that answers every enquiry in Arabic and English in under 60 seconds, qualifies the buyer, and books the viewing — it never sleeps. Offer to send a 2-minute clip of it handling a real call.",
  "CLOSE: get a WhatsApp opt-in or a follow-up time. Honour any opt-out immediately.",
  "Never use em dashes. Confident, warm, Gulf-appropriate.",
].join("\n");

type Lead = { phone: string; name: string; website?: string };

/** Normalise a UAE number to E.164; return null if not dialable (toll-free/short). */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return /^\+\d{8,15}$/.test(d) ? d : null;
  d = d.replace(/^00/, "");
  if (d.startsWith("971")) return "+" + d;
  if (d.startsWith("0")) return "+971" + d.slice(1); // UAE national → E.164
  if (/^(5\d{8})$/.test(d)) return "+971" + d; // bare mobile
  return null; // 800/toll-free/short codes are not dialable
}

async function nova<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(NOVA_BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(NOVA_KEY ? { authorization: `Bearer ${NOVA_KEY}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`NOVA ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Loosely affirmative short answer (yes / true / confirmed / opted in). */
function affirmative(v: string): boolean {
  return /^(yes|true|confirmed|granted|opted[\s_-]?in|agreed|interested)$/i.test(v.trim());
}

/**
 * Defensively extract structured findings from a NOVA get_call payload. NOVA's
 * exact shape isn't guaranteed, so we read several plausible locations and only
 * keep keys we recognise. We never fabricate: a missing field yields no finding.
 */
function extractFindings(
  payload: Record<string, unknown>,
): Array<{ key: string; value: string; confidence: number | null }> {
  const CANONICAL = new Set([
    "identity_confirmed",
    "after_hours_handling",
    "tools",
    "monthly_volume",
    "mobile",
    "demo_interest",
    "opt_in",
  ]);
  const src =
    (payload.findings as unknown) ??
    (payload.outcome as Record<string, unknown> | undefined)?.findings ??
    (payload.data as Record<string, unknown> | undefined)?.findings ??
    (payload.outcome as unknown) ??
    null;
  const out: Array<{ key: string; value: string; confidence: number | null }> = [];
  const push = (key: string, value: unknown, confidence?: unknown) => {
    if (!CANONICAL.has(key)) return;
    if (value === null || value === undefined || value === "") return;
    const v = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
    const c = typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : null;
    out.push({ key, value: v.slice(0, 500), confidence: c });
  };
  if (Array.isArray(src)) {
    for (const f of src) {
      if (f && typeof f === "object") {
        const o = f as Record<string, unknown>;
        const key = typeof o.key === "string" ? o.key : "";
        push(key, o.value, o.confidence);
      }
    }
  } else if (src && typeof src === "object") {
    for (const [key, value] of Object.entries(src as Record<string, unknown>)) push(key, value);
  }
  return out;
}

/**
 * Ingest a completed get_call payload: update the CallSession (status, transcript,
 * outcome, summary, cost, full raw payload for provenance), persist the captured
 * findings, and — only for consented facts — enrich the master DB (mobile →
 * Contact.phone/whatsapp; tools → Company.techStack + a tech_adoption Signal).
 */
async function ingestCallResult(novaCallId: string, payload: Record<string, unknown>) {
  const session = await prisma.callSession.findUnique({
    where: { novaCallId },
    select: { id: true, contactId: true, companyId: true, consent: true },
  });
  if (!session) return;

  const status = typeof payload.status === "string" ? payload.status : "completed";
  const transcript = typeof payload.transcript === "string" ? payload.transcript : null;
  const summary = typeof payload.summary === "string" ? payload.summary : null;
  const outcome =
    typeof payload.outcome === "string"
      ? payload.outcome
      : typeof (payload.outcome as Record<string, unknown> | undefined)?.result === "string"
        ? ((payload.outcome as Record<string, unknown>).result as string)
        : null;
  const costUsd =
    typeof payload.cost_usd === "number"
      ? payload.cost_usd
      : typeof payload.cost === "number"
        ? (payload.cost as number)
        : null;
  const findings = extractFindings(payload);
  const optIn = findings.find((f) => f.key === "opt_in");
  const optOut = optIn ? !affirmative(optIn.value) : false;

  await prisma.callSession.update({
    where: { id: session.id },
    data: {
      status,
      transcript,
      summary,
      outcome,
      costUsd,
      optOut,
      raw: payload as object,
      completedAt: status === "completed" || status === "failed" ? new Date() : null,
    },
  });

  await prisma.callFinding.deleteMany({ where: { callSessionId: session.id } });
  if (findings.length > 0) {
    await prisma.callFinding.createMany({
      data: findings.map((f) => ({
        callSessionId: session.id,
        key: f.key,
        value: f.value,
        confidence: f.confidence,
        source: "nova",
      })),
    });
  }
  console.log(`  ingested: status=${status}, ${findings.length} finding(s)`);

  // Master-DB enrichment (honest: only consented facts compound).
  if (!session.consent) return;

  const mobile = findings.find((f) => f.key === "mobile");
  if (mobile && session.contactId) {
    const e164 = toE164(mobile.value);
    if (e164) {
      await prisma.contact
        .update({ where: { id: session.contactId }, data: { phone: e164, whatsapp: e164 } })
        .catch(() => {});
      console.log(`  enriched contact mobile: ${e164}`);
    }
  }

  const tools = findings.find((f) => f.key === "tools");
  if (tools && session.companyId) {
    const tokens = tools.value
      .split(/[,/;]| and | & /i)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && t.length <= 40);
    if (tokens.length > 0) {
      const company = await prisma.company.findUnique({
        where: { id: session.companyId },
        select: { techStack: true },
      });
      const merged = Array.from(new Set([...(company?.techStack ?? []), ...tokens]));
      await prisma.company
        .update({ where: { id: session.companyId }, data: { techStack: merged } })
        .catch(() => {});
      await prisma.signal
        .create({
          data: {
            companyId: session.companyId,
            contactId: session.contactId,
            type: "tech_adoption",
            strength: tools.confidence ?? 0.6,
            provider: "nova",
            sourceUrl: null,
            evidence: { capturedOnCall: novaCallId, tools: tokens },
            detectedAt: new Date(),
          },
        })
        .catch(() => {});
      console.log(`  enriched company techStack: ${tokens.join(", ")}`);
    }
  }
}

async function main() {
  console.log(`\n=== NOVA voice loop · ${NOVA_BASE} ${NOVA_KEY ? "(authed)" : "(public/demo)"} ===`);
  // Health check first.
  try {
    const h = await nova<{ status?: string }>("GET", "/health");
    console.log(`NOVA health: ${h.status ?? "ok"}`);
  } catch (e) {
    console.error(`NOVA unreachable: ${(e as Error).message}`);
    console.error("Set NOVA_API_BASE if self-hosting, or check connectivity.");
    process.exitCode = 1;
    return;
  }

  // Build the lead list: explicit --phone/--name, else pull from the master DB.
  const leads: Lead[] = [];
  const pArg = arg("--phone");
  if (pArg) {
    const e164 = toE164(pArg);
    if (!e164) throw new Error(`--phone ${pArg} is not a dialable E.164 number.`);
    leads.push({ phone: e164, name: arg("--name") ?? "there" });
  } else {
    const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3);
    const queued = await prisma.message.findMany({
      where: { status: "awaiting_approval" },
      include: { enrolment: { include: { contact: { include: { company: true } } } } },
      take: 40,
    });
    for (const m of queued) {
      const c = m.enrolment?.contact;
      const e164 = toE164(c?.phone);
      if (c && e164 && leads.length < Math.min(limit, 5)) {
        leads.push({ phone: e164, name: c.company.name, website: c.company.website ?? undefined });
      }
    }
  }

  if (leads.length === 0) {
    console.log("\nNo dialable leads found. Most queued numbers are toll-free/landline switchboards");
    console.log("(800.., 04..) which NOVA can't dial — exactly why the verify-call enriches a mobile.");
    console.log("Try:  scripts/nova-call.ts --phone +971501234567 --name \"Ahmed\"");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nPlacing ${leads.length} NOVA call(s) [demo: agent joins a LiveKit room, no PSTN]:`);
  leads.forEach((l) => console.log(`  ☎ ${l.phone}  ${l.name}`));

  // place_calls — public endpoint, one agent per lead.
  const batch = await nova<{ calls?: Array<{ call_id: string; context_id: string; phone?: string }> }>(
    "POST",
    "/calls",
    {
      owner_email: NOVA_OWNER,
      product:
        "Huscribe, an AI voice agent that answers and qualifies inbound property enquiries 24/7 in Arabic and English, books viewings, and hands agents only ready buyers.",
      leads,
      context: HUSCRIBE_CONTEXT,
      goal: "qualify_interest",
      language: "en",
      goal_criteria:
        "Confirm you are speaking to the right person at the company. Then collect: how they handle inbound property enquiries after hours (an agent, a call centre, or it waits till morning); what tools they run leads through (Property Finder or Bayut inbox, a CRM, WhatsApp); rough monthly enquiry volume; and whether they would take a 2-minute Huscribe demo.",
      consent: true,
      idempotency_key: `huscribe-${leads[0]?.phone ?? "x"}-${process.pid}`,
    },
  );
  const calls = batch.calls ?? [];
  console.log(`\nNOVA accepted ${calls.length} call(s).`);
  for (const c of calls) {
    console.log(`  call_id=${c.call_id}  room=call-${c.context_id}`);
    console.log(`    join the demo conversation in a browser via NOVA's get_demo_token (context_id=${c.context_id})`);
  }

  // Persist every accepted call as a CallSession up front (status=pending) so the
  // control plane shows it immediately, then poll + ingest the outcome.
  const demoMode = !NOVA_KEY;
  for (const c of calls) {
    const lead = leads.find((l) => l.phone === c.phone) ?? leads[0];
    const contact = lead
      ? await prisma.contact
          .findFirst({
            where: { OR: [{ phone: lead.phone }, { whatsapp: lead.phone }] },
            select: { id: true, companyId: true },
          })
          .catch(() => null)
      : null;
    await prisma.callSession
      .upsert({
        where: { novaCallId: c.call_id },
        create: {
          novaCallId: c.call_id,
          novaContextId: c.context_id ?? null,
          contactId: contact?.id ?? null,
          companyId: contact?.companyId ?? null,
          status: "pending",
          goal: "qualify_interest",
          language: "en",
          demoMode,
          consent: true,
          consentBasis: "operator_initiated_demo",
        },
        update: { novaContextId: c.context_id ?? null },
      })
      .catch((e) => console.log(`  persist(pending) ${c.call_id}: ${(e as Error).message}`));
  }

  // Poll the first call briefly for a transcript/outcome, then ingest it.
  if (calls[0]) {
    const id = calls[0].call_id;
    console.log(`\nPolling call ${id} for outcome (up to ~30s)…`);
    let finalPayload: Record<string, unknown> | null = null;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const call = await nova<Record<string, unknown>>("GET", `/calls/${id}`);
        const status = (call.status as string) ?? "unknown";
        console.log(`  [${(i + 1) * 5}s] status=${status}`);
        if (status === "completed" || status === "failed" || call.transcript) {
          console.log("  outcome:", JSON.stringify(call.outcome ?? call.summary ?? {}, null, 2).slice(0, 500));
          finalPayload = call;
          break;
        }
      } catch (e) {
        console.log(`  poll error: ${(e as Error).message}`);
        break;
      }
    }
    if (finalPayload) {
      await ingestCallResult(id, finalPayload).catch((e) =>
        console.log(`  ingest ${id}: ${(e as Error).message}`),
      );
    }
  }

  await prisma.auditLog.create({
    data: {
      actor: "system:nova-call",
      action: "voice.place_calls",
      entity: "CallSession",
      payload: { placed: calls.length, demo: demoMode, base: NOVA_BASE },
    },
  }).catch(() => {});

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("nova-call failed:", e);
  process.exitCode = 1;
});
/* eslint-enable no-console */
