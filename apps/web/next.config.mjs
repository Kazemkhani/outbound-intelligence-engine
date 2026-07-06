import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Local-dev convenience: load the monorepo-root .env so the web runtime sees the
// shared secrets (AUTH_SECRET, DATABASE_URL, DRY_RUN, cost caps, provider keys).
// Next.js only auto-loads env from THIS app directory, but the single source of
// truth for the whole workspace is the repo-root .env (also read by the tsx
// scripts + Prisma via dotenv-cli). On Vercel that file is absent and platform
// env is used, so this is a safe no-op there. Never overrides an already-set
// value, so platform/CI env always wins.
try {
  const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No root .env (e.g. Vercel build) — rely on platform-provided env vars.
}

/** @type {import('next').NextConfig} */

// Security response headers applied to every route. force_https is handled at the
// Fly edge (fly.toml); HSTS here tells browsers to remember it. The CSP is
// pragmatic: it locks down framing, base-uri, and object/embed sinks while still
// allowing the inline + eval that Next.js's runtime currently needs. Tightening
// script-src to nonces is tracked as a follow-up; this is a strict improvement
// over shipping no policy at all.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig = {
  transpilePackages: ["@oie/core", "@oie/db", "@oie/orchestration"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
