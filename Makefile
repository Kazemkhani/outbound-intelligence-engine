# OIE — friendly make targets. Run `make help` for the list.
# These wrap the pnpm scripts so the repo is approachable from any device.

.DEFAULT_GOAL := help
.PHONY: help setup dev verify db-studio pilot clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Install deps, start Postgres, migrate and seed the DB
	pnpm install && pnpm infra:up && pnpm db:migrate && pnpm db:seed

dev: ## Run the control plane at http://localhost:3000
	pnpm --filter web dev

verify: ## Typecheck + lint + test + build across the monorepo (the green gate)
	pnpm verify

db-studio: ## Open Prisma Studio against the local database
	pnpm db:studio

pilot: ## Run the Phase 10 pilot in dry-run (no live calls; nothing sends)
	pnpm exec tsx --env-file=.env scripts/phase10-pilot-dryrun.ts

clean: ## Stop infra and remove build artefacts and caches
	pnpm infra:down; rm -rf node_modules **/node_modules **/dist **/.next **/.turbo .turbo
