/**
 * Live adapter verification. For every adapter whose key is present in the
 * environment, makes ONE real, READ-ONLY call against the provider and reports
 * pass/fail. Senders (Smartlead/Resend/Unipile) and the CRM are checked for
 * configuration only — NEVER a live send or write. DRY_RUN stays true; the
 * live-send gate is untouched.
 *
 * Run:  pnpm exec tsx --env-file=.env scripts/verify-adapters-live.ts
 */
import {
  PlacesAdapter,
  ApolloAdapter,
  ExploriumAdapter,
  TheirStackAdapter,
  PredictLeadsAdapter,
  ExaAdapter,
  HubSpotAdapter,
  SmartleadAdapter,
  ResendAdapter,
  UnipileAdapter,
  LlmClient,
  MODEL_IDS,
  type AdapterContext,
} from "../packages/integrations/src/index";

const ctx: AdapterContext = { dryRun: true };
const env = process.env;
/* eslint-disable no-console -- operator verification script */

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const results: Result[] = [];

async function check(name: string, configured: boolean, fn: () => Promise<string>) {
  if (!configured) {
    results.push({ name, status: "SKIP", detail: "no key in env" });
    return;
  }
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
  } catch (e) {
    const err = e as { kind?: string; message?: string };
    results.push({
      name,
      status: "FAIL",
      detail: `${err.kind ?? "error"}: ${(err.message ?? String(e)).slice(0, 100)}`,
    });
  }
}

async function main() {
  // ── Enrichment / signals: real read-only calls ───────────────────────────
  await check("places", !!env.GOOGLE_MAPS_API_KEY, async () => {
    const a = new PlacesAdapter({ apiKey: env.GOOGLE_MAPS_API_KEY });
    const c = await a.discoverCompanies({ text: "jewellery stores in Dubai" }, ctx);
    return `${c.length} companies returned`;
  });
  await check("apollo", !!env.APOLLO_API_KEY, async () => {
    const a = new ApolloAdapter({ apiKey: env.APOLLO_API_KEY });
    const r = await a.enrichCompany({ domain: "stripe.com" }, ctx);
    return `enrichCompany matched=${r.matched}`;
  });
  await check("explorium", !!env.EXPLORIUM_API_KEY, async () => {
    const a = new ExploriumAdapter({ apiKey: env.EXPLORIUM_API_KEY });
    const r = await a.enrichCompany({ domain: "stripe.com" }, ctx);
    return `enrichCompany matched=${r.matched}`;
  });
  await check("theirstack", !!env.THEIRSTACK_API_KEY, async () => {
    const a = new TheirStackAdapter({ apiKey: env.THEIRSTACK_API_KEY });
    const s = await a.fetchSignals({ companyDomain: "stripe.com" }, ctx);
    return `${s.length} signals`;
  });
  await check(
    "predictleads",
    !!(env.PREDICTLEADS_API_KEY && env.PREDICTLEADS_API_TOKEN),
    async () => {
      const a = new PredictLeadsAdapter({
        apiKey: env.PREDICTLEADS_API_KEY,
        apiToken: env.PREDICTLEADS_API_TOKEN,
      });
      const s = await a.fetchSignals({ companyDomain: "stripe.com" }, ctx);
      return `${s.length} signals`;
    },
  );
  await check("exa", !!env.EXA_API_KEY, async () => {
    const a = new ExaAdapter({ apiKey: env.EXA_API_KEY });
    const s = await a.fetchSignals({ companyDomain: "stripe.com" }, ctx);
    return `${s.length} signals`;
  });

  // ── LLM: a tiny real completion ───────────────────────────────────────────
  await check("anthropic (llm)", !!env.ANTHROPIC_API_KEY, async () => {
    const c = new LlmClient({ apiKey: env.ANTHROPIC_API_KEY });
    const r = await c.complete({
      model: MODEL_IDS.parse,
      maxTokens: 8,
      system: "Reply with one word.",
      messages: [{ role: "user", content: "Say OK" }],
    });
    return `model replied (${r.cost.costUsd > 0 ? "billed" : "ok"})`;
  });

  // ── CRM + senders: configuration only (no writes, no sends) ───────────────
  results.push({
    name: "hubspot",
    status: new HubSpotAdapter({ accessToken: env.HUBSPOT_ACCESS_TOKEN }).isConfigured()
      ? "PASS"
      : "SKIP",
    detail: "configured (read-verify skipped to avoid writes)",
  });
  results.push({
    name: "smartlead",
    status: new SmartleadAdapter({ apiKey: env.SMARTLEAD_API_KEY }).isConfigured()
      ? "PASS"
      : "SKIP",
    detail: "configured (no live send — gate)",
  });
  results.push({
    name: "resend",
    status: new ResendAdapter({ apiKey: env.RESEND_API_KEY }).isConfigured() ? "PASS" : "SKIP",
    detail: "configured (no live send — gate)",
  });
  results.push({
    name: "unipile",
    status: new UnipileAdapter({
      apiKey: env.UNIPILE_API_KEY,
      dsn: env.UNIPILE_DSN,
      channel: "linkedin",
    }).isConfigured()
      ? "PASS"
      : "SKIP",
    detail: "configured (off by default + gate)",
  });

  console.log("=== Live adapter verification (read-only; no sends) ===");
  for (const r of results) console.log(`  ${r.status.padEnd(4)} ${r.name.padEnd(18)} ${r.detail}`);
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(
    `\n${pass} passed, ${fail} failed, ${skip} not configured. DRY_RUN stays on; nothing sent.`,
  );
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exitCode = 1;
});
/* eslint-enable no-console */
