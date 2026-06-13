---
description: Ship a completed phase — verify, security-compliance review, commit, and update PLAN.md.
---

Ship the current phase only once it genuinely passes. Stop at the first failing gate; never force a phase through.

1. **Verify.** Run `pnpm verify` (typecheck + lint + test + build) and print the full result. If it does not exit 0, stop and report the failing step with its actual error. Then invoke the `verifier` subagent against the current diff, `PLAN.md`, and the phase's acceptance criteria. If the verifier reports any missing requirement, stop and fix before continuing.
2. **Security & compliance review.** Invoke the `security-compliance-engineer` subagent against the diff. It checks for secrets, missing boundary validation, over-broad scopes, unencrypted tokens, PII over-collection, missing audit logging, missing unsubscribe/suppression, and any send-path that bypasses the approval gate or channel rate limits. If it flags a real issue, stop and fix before continuing.
3. **Commit.** Only after both gates are green, commit the slice with a clear message describing the phase and what it delivers. Push feature branches freely; never push to `main`/`production` without explicit human instruction. Never auto-flip `DRY_RUN`, auto-approve a send, or enter secrets.
4. **Update PLAN.md.** Mark the phase complete, record the evidence (verify exit code, verifier and security verdicts), and note anything carried forward. Persist progress so a fresh session resumes with zero re-explanation.

Print all evidence in the transcript before any `/clear` — the acceptance evaluator only sees what is printed.
