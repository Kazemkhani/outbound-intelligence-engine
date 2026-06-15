## Summary

<!-- What does this change do, and why? Reference the phase if relevant. -->

## Changes

<!-- Bullet the notable changes. Keep the diff focused. -->

-

## Verification

<!-- Paste the evidence — exit code, task count, test count. Do not assert without it. -->

```
pnpm verify
```

## Checklist

- [ ] `pnpm verify` is **green** (typecheck + lint + test + build) and the evidence is pasted above
- [ ] **No secrets** committed; any new env key is documented in `.env.example` (name only, no value)
- [ ] **Send gate intact** — every send path routes through `evaluateSendGate`; `DRY_RUN` not auto-flipped; channels not auto-enabled; gate not moved behind MCP
- [ ] Scores are computed by code, not the LLM (no LLM client in `packages/core`)
- [ ] New providers sit behind an adapter implementing one of the five interfaces; no vendor shapes leak into the core
- [ ] External and LLM input validated with Zod at the boundary; TypeScript strict (no unexplained `any`)
- [ ] `verifier` PASS against `PLAN.md` and the phase acceptance criteria
- [ ] `security-compliance-engineer` PASS on the diff
- [ ] `PLAN.md` updated if a phase advanced

## Notes for reviewers

<!-- Anything that needs a closer look, trade-offs taken, follow-ups. -->
