---
description: Run the complete repository gate and review the diff against its stated outcome.
---

1. Run `pnpm verify`, `pnpm format:check`, and `git diff --check`. Stop on the first failure and report the exact error.
2. Invoke the verifier agent with the current diff and the issue, pull request outcome, or user request that defines acceptance.
3. Report the command evidence and any correctness, security, privacy, idempotency, scoring, or send-gate gaps. Do not claim completion while a gap remains.
