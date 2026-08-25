# OIE web control plane

The Next.js operator interface for ranked leads, evidence, ICP tuning, approvals, and system health. It makes the deterministic engine and the automation boundary visible to a human.

## Routes

| Route        | Purpose                                                         |
| ------------ | --------------------------------------------------------------- |
| `/`          | System overview and dry-run status                              |
| `/agent`     | Natural-language read and draft interface                       |
| `/leads`     | Ranked leads with evidence and scoring rationale                |
| `/icp`       | ICP editor with deterministic re-ranking                        |
| `/signals`   | Dated signal feed with provider and decay information           |
| `/approvals` | Action-level human approval queue                               |
| `/voice`     | Read-only view of imported call sessions and consented findings |
| `/dojo`      | Synthetic role-play and qualitative coaching                    |
| `/close`     | Grounded drafting, call review, and deterministic ROI framing   |
| `/knowledge` | Product-neutral, canon-grounded operator assistance             |
| `/analytics` | Tier, signal, approval, and cost summaries                      |
| `/setup`     | Local configuration guidance                                    |

## Runtime boundaries

- Server-only modules own database, auth, and model access.
- Client components never import Prisma or provider secrets.
- The UI does not send or dial. It prepares and approves actions; orchestration enforces the gate.
- Scores come only from `@oie/core`. Model output may explain supplied facts but never calculate a score.
- With no database or model key, supported views render from synthetic fixtures or show a clear configuration state.

## Local development

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter web dev
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

The app runs at [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env`; never commit values. Local sign-in is available only when `ALLOW_DEV_LOGIN=true`, no operator credentials are configured, and `NODE_ENV` is not `production`.

Read [AGENTS.md](AGENTS.md) before modifying runtime boundaries, auth, model prompts, scoring, or approval behaviour.
