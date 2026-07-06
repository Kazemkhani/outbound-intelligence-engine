# Run OIE yourself

> This is the friend-facing guide: get the whole Outbound Intelligence Engine running **on your own machine (or your own cloud), with your own API keys**, in a few minutes. Everything is safe by default — **nothing sends on any channel** until you deliberately open the send gate and approve each action (see [Safety](#safety)).

You do **not** need every API key to start. With **zero keys** the dashboard runs on built-in fixtures so you can click around. Add keys as you go to light up real discovery, enrichment, signals, and personalisation.

---

## Pick one path

| Path | Best for | What you need |
| --- | --- | --- |
| **A. Codespaces** | Trying it fast, in the browser, zero install | A GitHub account with access to this repo |
| **B. Local** | Running it on your own device | Docker, Node 22, pnpm 10 |
| **C. Your own Vercel** | A hosted URL that's yours | Vercel + Neon + Inngest accounts (all free tier) |

---

## A — GitHub Codespaces (zero install)

The repo ships a devcontainer, so a Codespace boots with everything ready.

1. Open **https://codespaces.new/Kazemkhani/outbound-intelligence-engine** (or click **Code ▸ Codespaces ▸ Create** on the repo).
2. In the Codespace terminal:
   ```bash
   cp .env.example .env      # then edit .env and add whatever keys you have (optional to start)
   make setup                # installs deps, starts Postgres, migrates + seeds
   make dev                  # runs the control plane
   ```
3. Open the forwarded **port 3000** when Codespaces prompts you.
4. Sign in with the local dev login: **`dev@oie.local` / `dev`**.

---

## B — Local on your machine

Prerequisites: **Docker Desktop** (or Colima), **Node 22+**, **pnpm 10+** (`corepack enable`).

```bash
git clone https://github.com/Kazemkhani/outbound-intelligence-engine.git
cd outbound-intelligence-engine
cp .env.example .env          # add your keys (optional to start — fixtures work with none)
make setup                    # deps + Postgres + migrate + seed
make dev                      # control plane at http://localhost:3000
```

Sign in with **`dev@oie.local` / `dev`**. Then:

```bash
make pilot                    # runs the full pipeline in dry-run and prints "anything sent? NO"
```

> If port 3000 or 5432 is busy on your machine, set `PORT=3001` before `make dev`, and change the host port in `infra/docker-compose.yml`.

---

## C — Your own hosted instance (Vercel + Neon + Inngest)

For a URL that's yours, hosted, and running your keys. All three services have a free tier.

1. **Neon** — create a Postgres project; copy the pooled connection string (and a direct one for migrations).
2. **Inngest** — create an environment; copy the event + signing keys.
3. **Vercel** — import this repo, set **Root Directory = `apps/web`**, and add your keys as **Environment Variables** (mirror `.env.example`). Keep `DRY_RUN=true`.

[**Deploy to Vercel ▸**](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FKazemkhani%2Foutbound-intelligence-engine&root-directory=apps%2Fweb&env=DATABASE_URL,AUTH_SECRET,DRY_RUN,ANTHROPIC_API_KEY,AUTH_OPERATOR_EMAIL,AUTH_OPERATOR_PASSWORD_HASH&envDescription=Fill%20from%20.env.example&envLink=https%3A%2F%2Fgithub.com%2FKazemkhani%2Foutbound-intelligence-engine%2Fblob%2Fmain%2F.env.example&project-name=oie&repository-name=outbound-intelligence-engine)

Then apply the schema against Neon and seed it:

```bash
pnpm --filter @oie/db migrate:deploy
pnpm db:seed
```

Set a real operator login (no dev fallback in production):

```bash
# generate a bcrypt hash for your password, then set AUTH_OPERATOR_EMAIL + AUTH_OPERATOR_PASSWORD_HASH
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],12))" 'your-password'
```

---

## Your API keys

Every provider sits behind an adapter, so each is **independent and optional** — add the ones you have. Put them in `.env` (local/Codespaces) or in your platform's env vars (Vercel). Check what's detected any time (values are never printed):

```bash
pnpm exec tsx --env-file=.env scripts/gate1-credentials.ts
```

| Function | Providers (any one is enough to start) |
| --- | --- |
| LLM (personalisation, rationale) | `ANTHROPIC_API_KEY` |
| Discovery (find companies) | `GOOGLE_MAPS_API_KEY` · `SEARCHAPI_API_KEY` · `DGIS_API_KEY` |
| Enrichment | `APOLLO_API_KEY` · `CLAY_API_KEY` · `EXPLORIUM_API_KEY` |
| Signals | `THEIRSTACK_API_KEY` · `PREDICTLEADS_API_KEY` · `EXA_API_KEY` |
| Email sending | `SMARTLEAD_API_KEY` · `RESEND_API_KEY` |
| LinkedIn + WhatsApp | `UNIPILE_API_KEY` · `UNIPILE_DSN` |
| CRM | `HUBSPOT_ACCESS_TOKEN` |
| Errors | `SENTRY_DSN` |

The full annotated list is in [`.env.example`](../.env.example).

---

## Safety

- **`DRY_RUN` stays true.** The whole pipeline discovers, scores, enriches, and drafts — but **no email, LinkedIn, or WhatsApp message is ever sent** while it's on. This is enforced in code (`packages/orchestration/src/send-gate.ts`), not by convention.
- Going live is a **deliberate two-part human step**: turn the dry-run flag off **and** approve each specific action in the approval queue. LinkedIn and WhatsApp carry a third gate — the channel must be explicitly enabled (off by default).
- Start with dry-run, watch the approval queue, confirm the drafts cite real signals — then decide. See [`RUNBOOK.md`](../RUNBOOK.md) and [`SECURITY.md`](../SECURITY.md).
