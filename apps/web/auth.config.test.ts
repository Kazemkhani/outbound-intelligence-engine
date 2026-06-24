import { describe, it, expect } from "vitest";
import { authConfig } from "@/auth.config";

// Guards the route gate: a regression that makes a protected route public (or makes
// the health/auth endpoints private) would be a real security or uptime incident.

const authorized = authConfig.callbacks?.authorized;
if (!authorized) throw new Error("authConfig.callbacks.authorized is missing");

const decide = (pathname: string, loggedIn: boolean) =>
  authorized({
    auth: loggedIn ? { user: { email: "operator@example.com" } } : null,
    request: { nextUrl: { pathname } },
  } as Parameters<typeof authorized>[0]);

describe("authorized callback (public-path allowlist)", () => {
  it("allows the public paths without a session", () => {
    for (const p of ["/signin", "/api/health", "/api/auth/session", "/api/inngest"]) {
      expect(decide(p, false)).toBe(true);
    }
  });

  it("blocks every app route without a session", () => {
    for (const p of ["/", "/leads", "/icp", "/signals", "/voice", "/dojo", "/close", "/knowledge", "/approvals", "/analytics"]) {
      expect(decide(p, false)).toBe(false);
    }
  });

  it("allows app routes once a session exists", () => {
    for (const p of ["/", "/leads", "/close", "/dojo", "/knowledge"]) {
      expect(decide(p, true)).toBe(true);
    }
  });
});

describe("session + host hardening", () => {
  it("trusts the host (self-hosted, prevents NextAuth UntrustedHost)", () => {
    expect(authConfig.trustHost).toBe(true);
  });

  it("bounds the JWT session lifetime well below the 30-day default", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
    expect(authConfig.session?.maxAge).toBeLessThanOrEqual(60 * 60 * 12);
  });
});
