"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";

const DEMO = { email: "dev@oie.local", password: "dev" };

/**
 * Operator sign-in. Posts credentials to Auth.js (redirect: false) and surfaces
 * a clear error on failure. The whole control plane sits behind this page.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);
    setPending(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (res?.error) {
      setError("Those credentials were not recognised.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4">
      {/* ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-gold-500/10 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-teal-400/[0.06] blur-[120px]"
      />

      <div className="relative w-full max-w-sm">
        {/* Brand mark */}
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500 font-display text-sm font-bold text-ink-950">
            G
          </span>
          <div className="leading-tight">
            <div className="font-display text-base font-bold text-ink-50">GenRiver Revenue OS</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">
              Control plane · genriverai.com
            </div>
          </div>
        </div>

        <div className="surface p-7">
          <h1 className="font-display text-xl font-bold text-ink-50">Operator sign-in</h1>
          <p className="mt-1 text-sm text-ink-400">Your lead factory is gated. Sign in to continue.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label-mono mb-1.5 block">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="password" className="label-mono mb-1.5 block">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? "Signing in…" : "Sign in"}
              {!pending && <ArrowRight size={16} aria-hidden />}
            </button>
          </form>

          {/* Local-dev convenience only. Gated on NODE_ENV so the production build
              never renders the dev credentials or a fill button (the dev backdoor is
              disabled in production anyway). In prod this whole block is removed. */}
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-6 rounded-lg border border-ink-700 bg-ink-900/60 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-teal-400" aria-hidden />
                <span className="label-mono text-teal-400">Dev access (local only)</span>
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-400">Email</dt>
                  <dd className="font-mono text-ink-100">{DEMO.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-400">Password</dt>
                  <dd className="font-mono text-ink-100">{DEMO.password}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => {
                  setEmail(DEMO.email);
                  setPassword(DEMO.password);
                  setTimeout(() => submit(), 0);
                }}
                className="btn-ghost mt-3 w-full"
              >
                Fill &amp; sign in
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-600">
          Dry-run active · nothing sends without approval
        </p>
      </div>
    </div>
  );
}
