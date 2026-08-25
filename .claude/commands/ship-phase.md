---
description: Verify and prepare a focused change for review.
---

1. Run `pnpm verify`, `pnpm format:check`, and `git diff --check`.
2. Invoke the verifier and security-compliance agents against the exact diff.
3. Fix every correctness or safety finding and repeat the gate.
4. Commit with a clear imperative subject and open a focused pull request containing the verification evidence.
5. Never push directly to the default branch, change deployment state, enable a channel, disable dry-run, approve an action, or enter a secret without explicit human authorisation.
