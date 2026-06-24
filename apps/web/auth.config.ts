import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration. Deliberately contains NO Node-only code
 * (no bcrypt) so it can run in the middleware (Edge runtime). The `authorized`
 * callback gates every route; the full Credentials provider lives in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/signin" },
  // Self-hosted (non-Vercel) deploys must trust the host or Auth.js v5 throws
  // `UntrustedHost` on every /api/auth call. We set the AUTH_TRUST_HOST env var
  // in production too; baking it here is belt-and-suspenders so the app is never
  // one missing env var away from a login outage.
  trustHost: true,
  // JWT sessions with an explicit lifetime. maxAge is the absolute cap; the
  // rolling window re-extends on activity but never beyond 12h of inactivity,
  // bounding the blast radius of an exfiltrated session token (vs Auth.js's
  // 30-day default). Mirrors APEX's sliding idle timeout.
  session: { strategy: "jwt", maxAge: 60 * 60 * 12, updateAge: 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const loggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // Public paths that must never require a session.
      const isPublic =
        pathname.startsWith("/signin") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/inngest");
      if (isPublic) return true;
      return loggedIn; // false → Auth.js redirects to the signIn page
    },
  },
} satisfies NextAuthConfig;
