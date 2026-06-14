import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { FIXTURE_SIGNAL_FEED } from "@/lib/fixtures";
import { formatDate, formatRelative, signalTypeLabel } from "@/lib/utils";

export const metadata = {
  title: "Signal Feed — OIE",
};

const NOW = new Date("2026-06-14T00:00:00Z");

const SIGNAL_VARIANT = {
  hiring: "hiring",
  funding: "funding",
  tech_adoption: "tech_adoption",
  job_change: "job_change",
  news: "news",
  web_change: "web_change",
} as const;

export default function SignalsPage() {
  const signals = FIXTURE_SIGNAL_FEED;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Signal Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          All detected buying signals, most recent first. Each entry shows the signal type,
          strength, provider attribution, evidence, and expiry.
        </p>
      </header>

      {signals.length === 0 ? (
        <EmptyState
          title="No signals yet"
          description="Signals will appear here once the enrichment and signal-detection pipelines have run."
        />
      ) : (
        <ol aria-label="Signal feed" className="space-y-4">
          {signals.map((sig) => {
            const isExpired = sig.expiresAt < NOW;
            return (
              <li key={sig.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: type + company */}
                  <div className="flex items-center gap-2">
                    <Badge variant={SIGNAL_VARIANT[sig.type]}>{signalTypeLabel(sig.type)}</Badge>
                    <span className="text-sm font-medium text-gray-900">{sig.companyName}</span>
                    <span className="text-xs text-gray-400">— {sig.contactName}</span>
                  </div>

                  {/* Right: date */}
                  <time
                    dateTime={sig.detectedAt.toISOString()}
                    className="shrink-0 text-xs text-gray-400"
                  >
                    {formatRelative(sig.detectedAt, NOW)}
                  </time>
                </div>

                {/* Strength bar */}
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500">Strength</span>
                  <div
                    role="meter"
                    aria-label={`Signal strength ${Math.round(sig.strength * 100)}%`}
                    aria-valuenow={Math.round(sig.strength * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${sig.strength * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-medium text-gray-600">
                    {Math.round(sig.strength * 100)}%
                  </span>
                </div>

                {/* Evidence */}
                {Object.keys(sig.evidence).length > 0 && (
                  <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(sig.evidence).map(([k, v]) => (
                      <div key={k} className="flex gap-1 text-xs">
                        <dt className="font-medium capitalize text-gray-500">{k}:</dt>
                        <dd className="text-gray-700">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Provider + expiry */}
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400">
                  <span>Provider: {sig.provider}</span>
                  <span>
                    Expires {formatDate(sig.expiresAt)}
                    {isExpired && <span className="ml-1 text-red-400">(expired)</span>}
                  </span>
                  <a
                    href={sig.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 underline hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
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
