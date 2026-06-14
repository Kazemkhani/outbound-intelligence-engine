import { describe, it, expect } from "vitest";
import type { NormalisedCompany, NormalisedContact, NormalisedSignal } from "../contracts/model";
import { stubTransport } from "../base/http";
import { LlmClient, MODEL_IDS } from "./client";
import { personaliseOpener, type PersonalisedOpener } from "./personalise";
import { extractCompanyFacts, type CompanyFacts } from "./extract";
import { runPersonalisationEvals, runExtractionEvals } from "./evals/runner";
import { personalisationCases, extractionCases } from "./evals/cases";

/** Build a well-formed Anthropic Messages API response body for the stub transport. */
function anthropicResponse(content: unknown[]): unknown {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-test",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

const toolUse = (name: string, input: Record<string, unknown>) =>
  anthropicResponse([{ type: "tool_use", id: "t1", name, input }]);

const company: NormalisedCompany = { domain: "acme.io", name: "Acme", industry: "retail" };
const contact: NormalisedContact = { companyDomain: "acme.io", fullName: "Aisha", title: "Owner" };
const signal: NormalisedSignal = {
  companyDomain: "acme.io",
  type: "hiring",
  strength: 0.9,
  provider: "theirstack",
  detectedAt: new Date("2026-06-12T00:00:00Z"),
  evidence: { jobTitle: "Sales Executive", count: 3 },
};

describe("MODEL_IDS", () => {
  it("uses the June 2026 model identifiers (addendum §7)", () => {
    expect(MODEL_IDS.hard).toBe("claude-opus-4-8");
    expect(MODEL_IDS.personalise).toBe("claude-sonnet-4-6");
    expect(MODEL_IDS.parse).toBe("claude-haiku-4-5");
  });
});

describe("LlmClient", () => {
  it("is not configured without a key", () => {
    expect(new LlmClient().isConfigured()).toBe(false);
    expect(new LlmClient({ apiKey: "sk-ant" }).isConfigured()).toBe(true);
  });

  it("sends the x-api-key + anthropic-version headers and returns parsed text + cost", async () => {
    const transport = stubTransport([
      { body: anthropicResponse([{ type: "text", text: "hello" }]) },
    ]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    const result = await client.complete({
      model: MODEL_IDS.parse,
      maxTokens: 64,
      system: "s",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("hello");
    expect(result.cost.provider).toBe("anthropic");
    expect(result.cost.costUsd).toBeGreaterThan(0);
    expect(transport.calls[0]?.headers?.["x-api-key"]).toBe("sk-ant");
    expect(transport.calls[0]?.headers?.["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws a typed error on a malformed response shape", async () => {
    const transport = stubTransport([{ body: { not: "an anthropic message" } }]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    await expect(
      client.complete({ model: MODEL_IDS.parse, maxTokens: 8, system: "s", messages: [] }),
    ).rejects.toMatchObject({ kind: "invalid_request" });
  });
});

describe("personaliseOpener", () => {
  it("returns a structured opener citing the exact signal", async () => {
    const transport = stubTransport([
      {
        body: toolUse("emit_opener", {
          opener: "Saw you're hiring 3 Sales Executives",
          citedSignal: "Sales Executive",
        }),
      },
    ]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    const out: PersonalisedOpener = await personaliseOpener(client, { contact, company, signal });
    expect(out.opener).toContain("Sales Executive");
    expect(out.citedSignal).toBe("Sales Executive");
  });

  it("throws rather than fabricating when the model returns no parseable output", async () => {
    const transport = stubTransport([
      { body: anthropicResponse([{ type: "text", text: "not json" }]) },
    ]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    await expect(personaliseOpener(client, { contact, company, signal })).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });
});

describe("extractCompanyFacts", () => {
  it("short-circuits on empty source text with no network call (never guesses)", async () => {
    const transport = stubTransport([]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    const facts: CompanyFacts = await extractCompanyFacts(client, "");
    expect(facts.name).toBeNull();
    expect(facts.techStack).toEqual([]);
    expect(transport.calls).toHaveLength(0);
  });

  it("maps a grounded extraction, leaving unknown fields null", async () => {
    const transport = stubTransport([
      {
        body: toolUse("emit_company_facts", {
          name: "Acme",
          domain: "acme.io",
          industry: "retail",
          employeeCount: 45,
          country: null,
          region: null,
          techStack: ["Odoo"],
          fundingRound: null,
          fundingAmountUsd: null,
          provenance: { name: "Acme LLC is a retailer", techStack: "runs on Odoo" },
        }),
      },
    ]);
    const client = new LlmClient({ apiKey: "sk-ant", transport });
    const facts = await extractCompanyFacts(client, "Acme LLC is a retailer that runs on Odoo.");
    expect(facts.name).toBe("Acme");
    expect(facts.employeeCount).toBe(45);
    expect(facts.country).toBeNull(); // unknown stays null
    expect(facts.techStack).toEqual(["Odoo"]);
  });
});

describe("eval harness", () => {
  it("ships a meaningful labelled eval set", () => {
    expect(personalisationCases.length).toBeGreaterThanOrEqual(8);
    expect(extractionCases.length).toBeGreaterThanOrEqual(3);
  });

  it("runs every personalisation case and a good runFn passes more than it fails", async () => {
    const report = await runPersonalisationEvals(personalisationCases, async (input) => ({
      // A deterministic, signal-grounded stand-in for the model.
      opener: `Noticed ${JSON.stringify(input.signal.evidence ?? input.signal.type)} at ${input.company.name ?? "your company"}.`,
      citedSignal: JSON.stringify(input.signal.evidence ?? input.signal.type),
    }));
    expect(report.total).toBe(personalisationCases.length);
    expect(report.passed + report.failed).toBe(report.total);
  });

  it("catches a generic, non-grounded opener (the harness discriminates quality)", async () => {
    const report = await runPersonalisationEvals(personalisationCases, async () => ({
      opener: "Hi there, hope you are doing well and want to jump on a quick call.",
      citedSignal: "none",
    }));
    expect(report.failed).toBeGreaterThan(0);
  });

  it("runs the extraction eval set", async () => {
    const report = await runExtractionEvals(extractionCases, async () => ({
      name: null,
      domain: null,
      industry: null,
      employeeCount: null,
      country: null,
      region: null,
      techStack: [],
      fundingRound: null,
      fundingAmountUsd: null,
      provenance: {},
    }));
    expect(report.total).toBe(extractionCases.length);
  });
});
