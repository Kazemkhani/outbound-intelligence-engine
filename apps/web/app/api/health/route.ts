import { NextResponse } from "next/server";

/**
 * Public liveness probe for uptime monitors and the Fly health check. No auth, no
 * database, no secrets: it returns 200 whenever the app process is serving. We keep
 * this a pure liveness signal (not readiness) on purpose, so a database or provider
 * blip cannot flap the app's health and trigger needless restarts. It must stay in
 * the public-path allowlist in auth.config.ts.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok", service: "huscribe-revenue-os", time: new Date().toISOString() },
    { status: 200 },
  );
}
