/* eslint-disable no-console -- operator data tool */
/**
 * Build the prospect target list for selling Huscribe to UAE real estate.
 *
 * This is the "Now" data-acquisition action from docs/strategy/DATA-ACQUISITION.md.
 * The verdict there: data is the easy part, trust and distribution are the
 * bottleneck, so you do NOT need a data engine to get the first customers. You
 * need ~150 to 300 precise accounts, narrowed to a Dream 20 to 40 where the
 * principal answers WhatsApp personally, each with a logged provenance basis.
 *
 * This script does two things, offline and with no API keys:
 *   1. Prints the public-source cascade as a checklist you can execute by hand.
 *   2. Writes a CSV template with the right columns (including the compliance
 *      provenance fields) so every contact carries its source and lawful basis
 *      from day one, not retrofitted.
 *
 * It deliberately does NOT scrape or call paid providers. The semi-automated
 * cascade (SearchApi/Places discovery, Apollo/Clay enrichment) is the "Next"
 * phase and runs behind the existing adapter contracts, never here.
 *
 * Run:  pnpm exec tsx scripts/build-target-list.ts [outPath]
 *       (default outPath: data/target-list.template.csv)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The public-source cascade (UAE real estate). Hand-run top to bottom per account. */
const CASCADE: { step: string; source: string; yields: string }[] = [
  {
    step: "1. Enumerate + segment the accounts",
    source: "DLD / RERA broker + agency registries, Dubai Pulse open data",
    yields: "the authoritative list of licensed brokerages + developers to segment",
  },
  {
    step: "2. Filter to fit",
    source: "Bayut / Property Finder (listing volume, areas, off-plan activity)",
    yields: "mid-to-large brokerages with high inbound + developers running portal lead-gen",
  },
  {
    step: "3. Name the decision-maker",
    source: "LinkedIn (owner, head of sales) + Google Maps/Places (the firm + office line)",
    yields: "a named principal/decision-maker per firm, plus the office number and site",
  },
  {
    step: "4. Get a mobile only the lawful way",
    source: "self-published agent mobile on listings, a warm intro, or an explicit opt-in",
    yields: "an E.164 mobile WITH a logged source URL + basis (never scraped at scale)",
  },
  {
    step: "5. Narrow to the Dream 20 to 40",
    source: "your judgement",
    yields: "the accounts where the principal personally answers WhatsApp: start here",
  },
];

/** CSV columns. Provenance + compliance fields are first-class, not an afterthought. */
const COLUMNS = [
  "segment", // developer | brokerage | portal_advertiser
  "agency_name",
  "website",
  "area", // e.g. Dubai Marina, Business Bay
  "decision_maker_name",
  "role",
  "office_line",
  "mobile_e164", // leave blank unless lawfully obtained; never fabricate
  "preferred_channel", // whatsapp | call | email
  "contact_source_url", // where the contact detail was published (provenance)
  "consent_basis", // made_public | warm_intro | explicit_optin | none
  "opt_out", // FALSE until a withdrawal is recorded; honour immediately
  "dncr_status", // unknown until screened; fail-closed (not callable unless clear)
  "dream_tier", // dream | shortlist | backlog
  "last_touch",
  "notes",
] as const;

const EXAMPLE_ROWS: string[][] = [
  [
    "brokerage",
    "EXAMPLE Realty (replace me)",
    "https://example.ae",
    "Business Bay",
    "Firstname Lastname",
    "Managing Director",
    "+9714XXXXXXX",
    "", // mobile blank: fill only when lawfully obtained
    "whatsapp",
    "https://www.linkedin.com/in/example",
    "made_public",
    "FALSE",
    "unknown",
    "dream",
    "",
    "Principal answers WhatsApp; lead with the after-hours speed-to-lead gap",
  ],
];

function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

function main(): void {
  const out = resolve(process.argv[2] ?? "data/target-list.template.csv");

  console.log("\nUAE real-estate target-list cascade (run top to bottom per account):\n");
  for (const c of CASCADE) {
    console.log(`  ${c.step}`);
    console.log(`     source: ${c.source}`);
    console.log(`     yields: ${c.yields}\n`);
  }

  console.log("Compliance, built in (PDPL + TDRA), see docs/strategy/DATA-ACQUISITION.md:");
  console.log("  - Log contact_source_url + consent_basis for EVERY contact.");
  console.log("  - mobile_e164 stays blank unless made-public, warm, or opted-in. Never scrape at scale.");
  console.log("  - dncr_status is fail-closed: treat anything other than a screened-clear as not callable.");
  console.log("  - Keep NOVA in DEMO_MODE and DRY_RUN on until TDRA approval + the COMPLIANCE.md gate.\n");

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, toCsv([[...COLUMNS], ...EXAMPLE_ROWS]), "utf8");
  console.log(`Wrote target-list template (${COLUMNS.length} columns) to: ${out}`);
  console.log("Aim: ~150 to 300 rows, then mark ~20 to 40 as dream_tier=dream and start there.\n");
}

main();
