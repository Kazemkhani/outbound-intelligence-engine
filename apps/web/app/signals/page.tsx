import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { getSignals } from "@/lib/data";
import { formatDate, formatRelative, signalTypeLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signal Feed — OIE",
};

const NOW = new Date();

const SIGNAL_VARIANT = {
  hiring: "hiring",
  funding: "funding",
  tech_adoption: "tech_adoption",
  job_change: "job_change",
  news: "news",
  web_change: "web_change",
} as const;

export default async function SignalsPage() {
  const signals = await getSignals();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Signal Feed</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Every detected buying signal, newest first. Each entry shows type, strength, provider
          attribution, evidence, and expiry.
        </p>
      </header>

      {signals.length === 0 ? (
        <EmptyState
          title="No signals yet"
          description="Signals appear here once the enrichment and signal-detection pipelines have run."
        />
      ) : (
        <ol aria-label="Signal feed" className="space-y-4">
          {signals.map((sig) => {
            const isExpired = sig.expiresAt < NOW;
            return (
              <li key={sig.id} className="rounded-xl border border-ink-700 bg-ink-850 p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={SIGNAL_VARIANT[sig.type]}>{signalTypeLabel(sig.type)}</Badge>
                    <span className="text-sm font-medium text-ink-50">{sig.companyName}</span>
                    <span className="text-xs text-ink-500">· {sig.contactName}</span>
                  </div>
                  <time
                    dateTime={sig.detectedAt.toISOString()}
                    className="shrink-0 font-mono text-xs text-ink-500"
                  >
                    {formatRelative(sig.detectedAt, NOW)}
                  </time>
                </div>

                {/* Strength bar */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="label-mono">Strength</span>
                  <div
                    role="meter"
                    aria-label={`Signal strength ${Math.round(sig.strength * 100)}%`}
                    aria-valuenow={Math.round(sig.strength * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"
                  >
                    <div
                      className="h-full rounded-full bg-gold-500"
                      style={{ width: `${sig.strength * 100}%` }}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-xs font-medium text-ink-200">
                    {Math.round(sig.strength * 100)}%
                  </span>
                </div>

                {/* Evidence */}
                {Object.keys(sig.evidence).length > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(sig.evidence).map(([k, v]) => (
                      <div key={k} className="flex gap-1 text-xs">
                        <dt className="font-medium capitalize text-ink-500">{k}:</dt>
                        <dd className="text-ink-200">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Provider + expiry */}
                <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-xs text-ink-500">
                  <span>Provider: {sig.provider}</span>
                  <span>
                    Expires {formatDate(sig.expiresAt)}
                    {isExpired && <span className="ml-1 text-red-400">(expired)</span>}
                  </span>
                  <a
                    href={sig.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-400 underline-offset-2 hover:text-gold-300 hover:underline"
                  >
                    Source
                  </a>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
