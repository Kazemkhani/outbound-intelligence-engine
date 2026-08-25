# Outbound Intelligence Engine control plane (Next.js monorepo).
# Single stage: install the pnpm workspace, generate the Prisma client, build the
# web app, then run `next start`. Real secrets are injected at runtime
# (never baked into the image); the build only uses throwaway placeholders so the
# env-validation + `next build` pass without touching a real database or key.
FROM node:22-slim

ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NEXT_TELEMETRY_DISABLED=1
RUN corepack enable \
 && apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Install + build with BUILD-ONLY placeholder env (inline so it never persists to
# the runtime image). @oie/db postinstall runs `prisma generate`.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    AUTH_SECRET="build-only-placeholder-not-a-secret-0123456789" \
    NODE_ENV="production" \
    pnpm install --frozen-lockfile \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    AUTH_SECRET="build-only-placeholder-not-a-secret-0123456789" \
    NODE_ENV="production" \
    pnpm --filter web build

# Runtime server. Real environment values come from the hosting platform's secret store.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
