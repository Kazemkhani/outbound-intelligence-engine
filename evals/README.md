# Eval harness (promptfoo)

Turns the canon-grounded prompt quality into measured, regression-testable numbers,
the quality-flywheel bet from docs/architecture/TARGET-ARCHITECTURE.md.

## Run locally

```bash
export ANTHROPIC_API_KEY=...   # required: promptfoo calls the model
pnpm eval                      # runs promptfooconfig.yaml via npx promptfoo
pnpm eval:view                 # open the results UI
```

No dependency is added to the repo: `pnpm eval` invokes `npx promptfoo`, so the
build and lockfile are untouched.

## What it checks

The system prompt in `promptfooconfig.yaml` mirrors the production grounding rules
(apps/web/lib/canon.ts + the Knowledge/Close server actions). Assertions:

- Deterministic: a pricing or proof-point question must contain the literal
  `<CONFIRM>` token (never an invented number); model output must contain no em dash.
- Model-judged (llm-rubric): objection and discovery answers must cite a named
  framework and be specific to UAE real estate, not generic.

Keep the system prompt here in sync with apps/web/lib/canon.ts when the canon changes.

## CI gate status: BLOCKED (needs a secret)

A CI pass-rate gate is intentionally NOT wired yet, because promptfoo must call the
model and CI has no `ANTHROPIC_API_KEY`. To enable it (an owner action):

1. Add `ANTHROPIC_API_KEY` to the GitHub Actions secrets.
2. Add a `promptfoo` job to `.github/workflows/ci.yml` running `pnpm eval` with that
   secret, failing the build below a target pass-rate.

Until then this harness runs on demand, locally.
