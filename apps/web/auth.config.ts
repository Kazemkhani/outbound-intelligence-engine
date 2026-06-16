import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration. Deliberately contains NO Node-only code
 * (no bcrypt) so it can run in the middleware (Edge runtime). The `authorized`
 * callback gates every route; the full Credentials provider lives in `auth.ts`.
 */
export const authConfig = {
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const loggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // Public paths that must never require a session.
      const isPublic =
        pathname.startsWith("/signin") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/inngest");
      if (isPublic) return true;
      return loggedIn; // false → Auth.js redirects to the signIn page
    },
  },
} satisfies NextAuthConfig;
