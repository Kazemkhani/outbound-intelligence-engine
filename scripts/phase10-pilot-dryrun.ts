/**
 * Phase 10 pilot dry-run (brief §11 Phase 10 acceptance). Runs the full pipeline
 * end-to-end against the seed ICP and PROVES nothing sends: every channel action
 * lands in the approval queue. Fully in-memory + fixtures (no live calls), DRY_RUN
 * on. Run:  pnpm exec tsx scripts/phase10-pilot-dryrun.ts
 */
import { seedIcp } from "../packages/db/src/seed-data";
import {
  icpProfile,
  scoreLead,
  rankByComposite,
  type ScoringSubject,
} from "../packages/core/src/index";
import {
  LlmClient,
  personaliseOpener,
  SmartleadAdapter,
  UnipileAdapter,
  type NormalisedCompany,
  type NormalisedContact,
  type NormalisedSignal,
} from "../packages/integrations/src/index";
import { stubTransport } from "../packages/integrations/src/base/http";
import {
  toScoringSubject,
  executeSendStep,
  qualifiesForEnrolment,
} from "../packages/orchestration/src/index";

const NOW = new Date("2026-06-14T00:00:00Z");

/* eslint-disable no-console -- operator evidence script */

interface Lead {
  company: NormalisedCompany;
  contact: NormalisedContact;
  signals: NormalisedSignal[];
}

/** A small realistic UAE-SMB fixture lead set. */
const leads: Lead[] = [
  {
    company: {
      domain: "alnoorjewellery.ae",
      name: "Al Noor Jewellery LLC",
      industry: "jewellery",
      employeeCount: 45,
      region: "Dubai",
      country: "United Arab Emirates",
      techStack: ["Odoo"],
      localCategory: "jewellery_store",
    },
    contact: {
      companyDomain: "alnoorjewellery.ae",
      fullName: "Aisha Al Noor",
      title: "Owner",
      seniority: "c_level",
      department: "sales",
      email: "owner@alnoorjewellery.ae",
    },
    signals: [
      {
        companyDomain: "alnoorjewellery.ae",
        type: "hiring",
        strength: 0.9,
        provider: "theirstack",
        sourceUrl: "https://jobs.alnoorjewellery.ae/sdr",
        detectedAt: new Date("2026-06-12T00:00:00Z"),
        expiresAt: new Date("2026-07-12T00:00:00Z"),
        evidence: { jobTitle: "Sales Executive", count: 3 },
      },
    ],
  },
  {
    company: {
      domain: "gulfwholesale.ae",
      name: "Gulf Wholesale Trading",
      industry: "wholesale/distribution",
      employeeCount: 80,
      region: "Sharjah",
      country: "United Arab Emirates",
      techStack: ["Zoho"],
    },
    contact: {
      companyDomain: "gulfwholesale.ae",
      fullName: "Omar Haddad",
      title: "Sales Manager",
      seniority: "manager",
      department: "sales",
      email: "omar@gulfwholesale.ae",
    },
    signals: [],
  },
  {
    company: {
      domain: "bigaero.com",
      name: "BigAero Corp",
      industry: "aerospace",
      employeeCount: 6000,
      country: "US",
      techStack: ["Salesforce"],
    },
    contact: {
      companyDomain: "bigaero.com",
      fullName: "Pat Lee",
      title: "Intern",
      seniority: "ic",
      department: "engineering",
      email: "pat@bigaero.com",
    },
    signals: [],
  },
];

async function main(): Promise<void> {
  const icp = icpProfile.parse(seedIcp);

  // 1. Score + rank every lead.
  const scored = leads.map((lead) => {
    const subject: ScoringSubject = toScoringSubject(lead.company, lead.contact, lead.signals);
    return { lead, score: scoreLead(subject, icp, NOW) };
  });
  const ranked = rankByComposite(scored);

  console.log("=== OIE pilot dry-run (seed ICP) ===\n");
  console.log("Ranked leads:");
  for (const r of ranked) {
    console.log(
      `  ${r.score.tier}  composite=${r.score.composite.toFixed(1)}  fit=${r.score.fit.toFixed(0)} intent=${r.score.intent.toFixed(0)}  ${r.lead.company.name}`,
    );
  }

  const top = ranked[0]!;
  console.log(
    `\nTop lead: ${top.lead.company.name} (${top.lead.contact.fullName}, ${top.lead.contact.title})`,
  );

  // 2. Signal-triggered enrolment decision (through the gate).
  const trigger = top.lead.signals[0];
  const enrol = trigger
    ? qualifiesForEnrolment(
        {
          signalType: trigger.type,
          signalExpiresAt: trigger.expiresAt ?? null,
          tier: top.score.tier,
        },
        { minTier: "B", qualifyingTypes: ["hiring", "funding"] },
        NOW,
      )
    : { enrol: false, reason: "no signal" };
  console.log(`Auto-enrol decision: ${enrol.enrol} — ${enrol.reason}`);

  // 3. Personalise the opener from the EXACT signal (stubbed LLM, no live call).
  let opener = "Following up on your recent growth.";
  if (trigger) {
    const llm = new LlmClient({
      apiKey: "stub",
      transport: stubTransport([
        {
          body: {
            id: "m",
            type: "message",
            role: "assistant",
            model: "x",
            stop_reason: "tool_use",
            usage: { input_tokens: 50, output_tokens: 20 },
            content: [
              {
                type: "tool_use",
                id: "t",
                name: "emit_opener",
                input: {
                  opener:
                    "Saw Al Noor is hiring three Sales Executives this quarter — scaling the showroom team?",
                  citedSignal: "hiring three Sales Executives",
                },
              },
            ],
          },
        },
      ]),
    });
    const result = await personaliseOpener(llm, {
      contact: top.lead.contact,
      company: top.lead.company,
      signal: trigger,
    });
    opener = result.opener;
    console.log(`Personalised opener: "${opener}"\n   cites signal: "${result.citedSignal}"`);
  }

  // 4. Execute the first sequence step through the SEND GATE — must NOT send.
  const smartlead = new SmartleadAdapter(); // unconfigured; dry-run never touches it
  const linkedin = new UnipileAdapter({ channel: "linkedin" });
  const queue: string[] = [];

  const emailStep = await executeSendStep({
    step: { channel: "email", delayHours: 0, templateId: "opener" },
    stepIndex: 0,
    enrolmentId: "enrol-top",
    recipientEmail: top.lead.contact.email ?? "",
    fromEmail: "rep@huscribe.com",
    subject: "Quick question",
    body: opener,
    dryRun: true,
    approval: "pending",
    channelEnabled: true,
    suppressions: [],
    emailSender: smartlead,
  });
  queue.push(
    `email -> ${top.lead.contact.email}  [${emailStep.outcome}]  "${opener.slice(0, 60)}..."`,
  );

  const liStep = await executeSendStep({
    step: { channel: "linkedin", delayHours: 24, templateId: "connect" },
    stepIndex: 1,
    enrolmentId: "enrol-top",
    recipientHandle: "aisha-al-noor",
    body: opener,
    dryRun: true,
    approval: "pending",
    channelEnabled: false, // off by default
    suppressions: [],
    messagingChannel: linkedin,
  });
  queue.push(`linkedin -> aisha-al-noor  [${liStep.outcome}]`);

  console.log("\n=== Approval queue (nothing sent) ===");
  for (const q of queue) console.log(`  - ${q}`);

  const anySent = [emailStep, liStep].some((s) => s.outcome === "sent");
  console.log(`\nSAFETY CHECK — anything sent? ${anySent ? "YES (FAIL)" : "NO ✓ (all gated)"}`);
  if (anySent) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Pilot failed:", err);
  process.exitCode = 1;
});
/* eslint-enable no-console */
