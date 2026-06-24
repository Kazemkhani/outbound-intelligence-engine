# Autonomous loop — operating manual

The operator left the machine running (caffeinated) and authorized full autonomy for ~8 hours:
build, commit, push, deploy, merge. A cron job re-invokes the assistant every ~25 minutes. Each
firing is one bounded, verified increment. This file is the contract for every firing.

## Each firing, do exactly this
1. **Check the clock.** `date +%s`. Read `docs/autonomous/STARTED_AT.md`. If now ≥ STOP_AFTER_EPOCH,
   or every BACKLOG item is checked: run `CronList`, find the job whose prompt contains
   "AUTONOMOUS BUILD LOOP", `CronDelete` it, append a final note to PROGRESS.md, and stop.
2. **Orient.** Read `docs/autonomous/BACKLOG.md` and the tail of `docs/autonomous/PROGRESS.md`.
3. **Work.** Take the next 1–3 unchecked backlog items. Do them at world-class quality. Use a
   `Workflow` for substantial/parallel work; research with WebSearch where it sharpens the result.
4. **Verify before done.** Typecheck/build/`pnpm verify` as appropriate. Show evidence.
5. **Ship.** Commit + push to `security-hardening-and-searchapi`. At a coherent milestone, open/update
   a PR to `main` (`gh pr`) and merge if checks pass. Co-author trailer on commits.
6. **Record.** Tick the backlog item(s); append to PROGRESS.md: what changed, evidence, what's next.
7. **Stop this firing.** Don't spin; the next cron tick continues.

## Guardrails
- Never commit secrets (`.env` is gitignored). Never echo secret values.
- DRY_RUN stays true; NOVA stays demo. No live sends/dials.
- If a step is genuinely blocked (needs a human decision or a missing credential), log it in
  PROGRESS.md under "BLOCKED" and move to the next backlog item — do not stall the whole loop.
- Prefer finishing/verifying started work over starting new threads.

## Working dir
`/Users/Amir/outbound-intelligence-engine`. Branch: `security-hardening-and-searchapi`.
