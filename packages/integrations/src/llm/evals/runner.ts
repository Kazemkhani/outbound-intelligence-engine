import type { PersonalisedOpener } from "../personalise";
import type { CompanyFacts } from "../extract";
import type {
  PersonalisationCase,
  PersonalisationAssertion,
  ExtractionCase,
  ExtractionAssertion,
} from "./cases";

/**
 * Result for a single assertion within a case.
 */
export interface AssertionResult {
  name: string;
  passed: boolean;
}

/**
 * Result for one eval case.
 */
export interface CaseResult {
  id: string;
  description: string;
  passed: boolean;
  assertions: AssertionResult[];
  /** Populated when the run function threw rather than returning output. */
  error?: string;
}

/**
 * Aggregate result from a full eval run.
 */
export interface EvalReport {
  passed: number;
  failed: number;
  total: number;
  results: CaseResult[];
}

// ── Personalisation eval runner ──────────────────────────────────────────────

/**
 * Run the personalisation eval suite.
 *
 * `runFn` is injected by the caller so the eval runner itself never makes live
 * API calls. In tests, pass a deterministic stub; in a manual eval run, pass
 * the real `personaliseOpener`. This keeps CI fixture-safe (brief §7).
 *
 * Assertions are deterministic code predicates — no LLM is involved in
 * judging the output. The LLM reasons; code checks the numbers (brief
 * scoring-conventions: "the LLM reasons, code computes the number").
 */
export async function runPersonalisationEvals(
  cases: PersonalisationCase[],
  runFn: (input: PersonalisationCase["input"]) => Promise<PersonalisedOpener>,
): Promise<EvalReport> {
  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    let output: PersonalisedOpener | undefined;
    let error: string | undefined;

    try {
      output = await runFn(evalCase.input);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const assertionResults: AssertionResult[] = evalCase.assertions.map(
      (assertion: PersonalisationAssertion) => {
        if (output === undefined) {
          return { name: assertion.name, passed: false };
        }
        let passed = false;
        try {
          passed = assertion.check(output);
        } catch {
          passed = false;
        }
        return { name: assertion.name, passed };
      },
    );

    const casePassed = error === undefined && assertionResults.every((a) => a.passed);

    results.push({
      id: evalCase.id,
      description: evalCase.description,
      passed: casePassed,
      assertions: assertionResults,
      ...(error !== undefined ? { error } : {}),
    });
  }

  return summarise(results);
}

// ── Extraction eval runner ───────────────────────────────────────────────────

/**
 * Run the extraction eval suite.
 *
 * Same injection pattern — `runFn` is always a stub in CI; the real
 * `extractCompanyFacts` is used for manual / offline eval runs.
 */
export async function runExtractionEvals(
  cases: ExtractionCase[],
  runFn: (sourceText: string) => Promise<CompanyFacts>,
): Promise<EvalReport> {
  const results: CaseResult[] = [];

  for (const evalCase of cases) {
    let output: CompanyFacts | undefined;
    let error: string | undefined;

    try {
      output = await runFn(evalCase.sourceText);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const assertionResults: AssertionResult[] = evalCase.assertions.map(
      (assertion: ExtractionAssertion) => {
        if (output === undefined) {
          return { name: assertion.name, passed: false };
        }
        let passed = false;
        try {
          passed = assertion.check(output);
        } catch {
          passed = false;
        }
        return { name: assertion.name, passed };
      },
    );

    const casePassed = error === undefined && assertionResults.every((a) => a.passed);

    results.push({
      id: evalCase.id,
      description: evalCase.description,
      passed: casePassed,
      assertions: assertionResults,
      ...(error !== undefined ? { error } : {}),
    });
  }

  return summarise(results);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function summarise(results: CaseResult[]): EvalReport {
  const passed = results.filter((r) => r.passed).length;
  return {
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
  };
}
