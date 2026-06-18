import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

/**
 * Full Auth.js setup (Node runtime — uses bcrypt). A single operator logs in
 * against credentials held in env: `AUTH_OPERATOR_EMAIL` and a bcrypt hash in
 * `AUTH_OPERATOR_PASSWORD_HASH`. No database adapter — JWT sessions. Secrets are
 * never logged. When the env vars are absent in development, a clearly-marked
 * dev fallback keeps local work unblocked; in production, absent config denies
 * all logins (fail closed).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const operatorEmail = process.env.AUTH_OPERATOR_EMAIL?.trim().toLowerCase();
        const operatorHash = process.env.AUTH_OPERATOR_PASSWORD_HASH;

        if (operatorEmail && operatorHash) {
          if (email === operatorEmail && (await bcrypt.compare(password, operatorHash))) {
            return { id: "operator", email: operatorEmail, name: "Operator" };
          }
          return null;
        }

        // Dev fallback only. Requires a SECOND explicit opt-in (ALLOW_DEV_LOGIN)
        // so a single NODE_ENV slip in a deployed environment cannot expose the
        // hardcoded credential. Never set ALLOW_DEV_LOGIN in any deployment.
        if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_LOGIN === "true") {
          if (email === "dev@oie.local" && password === "dev") {
            return { id: "dev", email, name: "Dev Operator" };
          }
        }
        return null;
      },
    }),
  ],
});
