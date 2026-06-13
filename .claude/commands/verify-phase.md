---
description: Run pnpm verify, then have the verifier subagent check the diff against PLAN.md and the current phase's acceptance criteria.
---

Verify the current phase before claiming it is done. Do not skip steps; show the evidence.

1. Run `pnpm verify` (typecheck + lint + test + build). Print the full result. If it does not exit 0, stop and report the failing step with its actual error message — do not proceed.
2. Determine the current phase and its acceptance criteria from `PLAN.md`.
3. Invoke the `verifier` subagent in a fresh context. Give it: the current diff (e.g. `git diff` against the phase's base), `PLAN.md`, and the current phase's acceptance criteria. Ask it to report ONLY missing requirements, correctness bugs, untested required behaviour, secrets/security issues, broken idempotency, and any path that could send without the approval gate — with file:line citations.
4. Summarise the outcome: state plainly whether `pnpm verify` printed exit 0 AND the verifier reported no missing requirements. If the verifier found gaps, list them and stop — the phase is not done.

Remember: the `/goal` evaluator only judges what is printed in the transcript. Print the evidence here, and verify BEFORE any `/clear`.
