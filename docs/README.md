# Documentation map: Huscribe Revenue OS

A single entry point to every doc in this repo. Huscribe Revenue OS is the end-to-end sales control plane:
discover, enrich, qualify by voice with NOVA, score deterministically, then close, governed throughout by a
human approval gate. DRY_RUN stays true and NOVA stays in DEMO_MODE until live calling is explicitly signed off.

## Start here

1. [revenue-os/ARCHITECTURE.md](revenue-os/ARCHITECTURE.md): the one system, end to end.
2. [revenue-os/PRODUCT.md](revenue-os/PRODUCT.md): every module of the control plane.
3. [revenue-os/RUNBOOK.md](revenue-os/RUNBOOK.md): run it locally, deploy, and the daily operator playbook.
4. [strategy/PILOT-PLAYBOOK.md](strategy/PILOT-PLAYBOOK.md): the day-by-day plan to run a pilot to paid.

## Product and system (`docs/revenue-os/`)

The canonical product documentation, grounded in the live system.

- [ARCHITECTURE.md](revenue-os/ARCHITECTURE.md): discover, enrich, voice-qualify, score, close; package boundaries; where DRY_RUN and the send gate sit.
- [PRODUCT.md](revenue-os/PRODUCT.md): Leads, ICP, Signals, Approvals, Voice, Voice Dojo, Close Room, Knowledge, Analytics.
- [DATA-MODEL.md](revenue-os/DATA-MODEL.md): Company, Contact, Signal, Score, Message, CallSession, CallFinding.
- [VOICE-NOVA.md](revenue-os/VOICE-NOVA.md): NOVA integration, the 4 phases, demo-to-live path, the verify-by-conversation moat.
- [SECURITY.md](revenue-os/SECURITY.md): deploy posture, secrets, auth, the human send gate, dependency hygiene.
- [COMPLIANCE.md](revenue-os/COMPLIANCE.md): UAE PDPL + TDRA, the NOVA compliance gate, consent and opt-out.
- [GTM.md](revenue-os/GTM.md): ICP, offer, pricing posture, distribution, the pilot motion.
- [ROADMAP.md](revenue-os/ROADMAP.md): phases including live calling and master-DB resale.
- [adr/README.md](revenue-os/adr/README.md): the Revenue OS architecture decision records (see also Decisions below).

## Strategy and sales kit (`docs/strategy/`)

The operator-facing playbooks for selling Huscribe.

- [PILOT-PLAYBOOK.md](strategy/PILOT-PLAYBOOK.md): a 14-day demo-mode pilot, day by day, to convert to paid.
- [PRICING.md](strategy/PRICING.md): high-ticket packaging and the pilot-to-paid offer, anchored to market bands.
- [SPEED-TO-LEAD-PROOF.md](strategy/SPEED-TO-LEAD-PROOF.md): sourced stats for the speed-to-lead gap, to cite in the pitch.
- [GTM-EXPERIMENTS.md](strategy/GTM-EXPERIMENTS.md): a prioritised backlog of runnable go-to-market experiments.
- [DATA-MOAT.md](strategy/DATA-MOAT.md): how each NOVA call compounds the master DB into a defensible asset.
- [VOICE-ACTIVATION.md](strategy/VOICE-ACTIVATION.md): the staged path from DEMO_MODE to compliant live calling.

## Decisions (`docs/adr/`)

Locked architecture decisions, including [0008 deterministic scoring](adr/0008-deterministic-scoring-engine.md)
(the LLM never computes a score), [0009 the send gate and DRY_RUN](adr/0009-send-gate-and-dry-run.md), and
[0010 anti-corruption adapters](adr/0010-anti-corruption-adapters.md). Index: [adr/README.md](adr/README.md).

## Engine foundation (`docs/`)

The original engine docs that the Revenue OS docs build on.

- [ARCHITECTURE.md](ARCHITECTURE.md): the engine design at depth.
- [HANDOFF.md](HANDOFF.md): the complete continuity brief (read first on a fresh session).
- [PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md): the sequenced path to live.

## Build log (`docs/autonomous/`)

The autonomous build loop's operating manual and durable record: [LOOP.md](autonomous/LOOP.md) (the contract),
[BACKLOG.md](autonomous/BACKLOG.md) (what was built, with the recurring cycle log), and
[PROGRESS.md](autonomous/PROGRESS.md) (append-only evidence per firing).

Per-module engineering guides live next to the code: every package and app dir has an `AGENTS.md` plus a `README.md`.
