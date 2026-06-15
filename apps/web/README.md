# web — OIE operator control plane

The cockpit: a Next.js (App Router) dashboard and API where an operator reviews ranked leads, edits the ICP with live re-rank, watches the signal feed, and works the approval queue.

## Purpose

Make the brain and the conductor legible and controllable to a human. This is where the human-in-the-loop happens — above all, the approval queue that gates every real send. Depends on `@oie/core`, `@oie/db` and `@oie/orchestration`.

## What it owns

Routes under `app/`:

| Route        | Purpose                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| `/`          | home / overview                                                                              |
| `/leads`     | ranked, filterable leads with a detail drawer (enrichment, signal timeline, score rationale) |
| `/icp`       | ICP editor with **live re-rank** (recompute is pure, no LLM cost)                            |
| `/signals`   | the signal feed                                                                              |
| `/approvals` | the approval queue — server actions in `app/approvals/actions.ts`                            |
| `/analytics` | analytics shell                                                                              |

A real design system lives in `components/ui/` (card, badge, drawer, tabs, states) with full empty, loading and error states, built for accessibility (WCAG AA). The UI stack is Tailwind, shadcn-style components, `lucide-react`, `clsx`, `tailwind-merge` and `class-variance-authority`.

## Key surfaces

- Reads ranked leads, the signal feed and the approval queue from `@oie/db`.
- Triggers re-rank by calling the deterministic scoring engine in `@oie/core`.
- Approval actions feed the orchestration send gate — approving an action is one of the two conditions a real send needs; the operator never bypasses `DRY_RUN`.

## How to test and run

```bash
pnpm --filter web test         # Vitest + Testing Library (passWithNoTests safe)
pnpm --filter web typecheck
pnpm --filter web dev          # http://localhost:3000
```

## How it fits

The control plane is the human end of the pipeline. The orchestration brain produces ranked leads and queues actions; the operator reviews and approves here; the send gate enforces in code that nothing leaves without that approval and `DRY_RUN` off. Deployed to Vercel with the project root set to `apps/web` (see [`infra/deploy.md`](../../infra/deploy.md)).
