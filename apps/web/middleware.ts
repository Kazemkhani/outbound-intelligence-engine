import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Route protection runs on the Edge using the bcrypt-free `authConfig`, so no
 * Node-only code reaches the middleware. The `authorized` callback decides
 * access; unauthenticated requests are redirected to /signin.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except Next internals and static assets. The auth and
  // Inngest API routes are allowed through by the `authorized` callback.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export default middleware;
