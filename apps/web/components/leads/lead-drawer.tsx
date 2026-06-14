"use client";

import { Drawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { formatDate, formatRelative, round1, signalTypeLabel } from "@/lib/utils";
import type { ScoredLead } from "@/lib/fixtures";

const NOW = new Date("2026-06-14T00:00:00Z");

interface LeadDrawerProps {
  lead: ScoredLead | null;
  onClose: () => void;
}

export function LeadDrawer({ lead, onClose }: LeadDrawerProps) {
  if (!lead) return null;

  const tierVariant = ({ A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const)[
    lead.score.tier
  ];

  const tabs = [
    { id: "enrichment", label: "Enrichment" },
    { id: "signals", label: `Signals (${lead.signals.length})` },
    { id: "rationale", label: "Score rationale" },
  ];

  return (
    <Drawer open={!!lead} onClose={onClose} title={lead.contact.fullName}>
      {/* Lead summary */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-gray-900">{lead.contact.fullName}</p>
          <p className="text-sm text-gray-500">
            {lead.contact.title} · {lead.company.name}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={tierVariant}>Tier {lead.score.tier}</Badge>
          <span className="text-xs text-gray-400">Composite {round1(lead.score.composite)}</span>
        </div>
      </div>

      <Tabs tabs={tabs} defaultTab="enrichment">
        {(activeTab) => {
          if (activeTab === "enrichment") return <EnrichmentTab lead={lead} />;
          if (activeTab === "signals") return <SignalsTab lead={lead} />;
          return <RationaleTab lead={lead} />;
        }}
      </Tabs>
    </Drawer>
  );
}

function EnrichmentTab({ lead }: { lead: ScoredLead }) {
  const { company, contact } = lead;
  return (
    <div className="space-y-6">
      {/* Company */}
      <section aria-label="Company enrichment">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Company
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <EnrichRow label="Name" value={company.name} />
          <EnrichRow label="Domain" value={company.domain} />
          <EnrichRow label="Industry" value={company.industry} />
          <EnrichRow label="Employees" value={String(company.employeeCount)} />
          <EnrichRow label="Country" value={company.country} />
          <EnrichRow label="Region" value={company.region} />
          <EnrichRow label="Local category" value={company.localCategory} />
          <EnrichRow
            label="Tech stack"
            value={company.techStack.length > 0 ? company.techStack.join(", ") : "Unknown"}
          />
          <EnrichRow
            label="Website"
            value={
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline hover:text-brand-800"
              >
                {company.website}
              </a>
            }
          />
        </dl>
      </section>

      {/* Contact */}
      <section aria-label="Contact enrichment">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Contact
        </h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <EnrichRow label="Full name" value={contact.fullName} />
          <EnrichRow label="Title" value={contact.title} />
          <EnrichRow label="Seniority" value={contact.seniority} />
          <EnrichRow label="Department" value={contact.department} />
          <EnrichRow label="Email" value={contact.email} />
          <EnrichRow
            label="Email status"
            value={
              <Badge
                variant={
                  (
                    {
                      verified: "verified",
                      risky: "risky",
                      invalid: "invalid",
                      unknown: "unknown",
                    } as const
                  )[contact.emailStatus]
                }
              >
                {contact.emailStatus}
              </Badge>
            }
          />
          <EnrichRow
            label="LinkedIn"
            value={
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline hover:text-brand-800"
              >
                View profile
              </a>
            }
          />
        </dl>
      </section>
    </div>
  );
}

function SignalsTab({ lead }: { lead: ScoredLead }) {
  if (lead.signals.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">No signals detected for this lead.</p>
    );
  }

  return (
    <ol aria-label="Signal timeline" className="relative space-y-0 border-l-2 border-gray-100 pl-5">
      {lead.signals
        .slice()
        .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
        .map((sig) => {
          const signalBadgeVariant = (
            {
              hiring: "hiring",
              funding: "funding",
              tech_adoption: "tech_adoption",
              job_change: "job_change",
              news: "news",
              web_change: "web_change",
            } as const
          )[sig.type];

          const isExpired = sig.expiresAt < NOW;
          return (
            <li key={sig.id} className="relative pb-6 last:pb-0">
              {/* Timeline dot */}
              <span
                className="absolute -left-[1.375rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-gray-300"
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={signalBadgeVariant}>{signalTypeLabel(sig.type)}</Badge>
                  <span className="text-xs text-gray-400">via {sig.provider}</span>
                  {isExpired && <span className="text-xs text-red-400">(expired)</span>}
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatRelative(sig.detectedAt, NOW)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-gray-700">
                Strength: {Math.round(sig.strength * 100)}%
              </p>
              {Object.keys(sig.evidence).length > 0 && (
                <dl className="mt-1 space-y-0.5">
                  {Object.entries(sig.evidence).map(([k, v]) => (
                    <div key={k} className="flex gap-1 text-xs text-gray-500">
                      <dt className="font-medium capitalize">{k}:</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-1 text-xs text-gray-400">Expires {formatDate(sig.expiresAt)}</p>
            </li>
          );
        })}
    </ol>
  );
}

function RationaleTab({ lead }: { lead: ScoredLead }) {
  const { rationale } = lead.score;

  return (
    <div className="space-y-6">
      {/* Score summary */}
      <section aria-label="Score summary">
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-4 text-center text-sm">
          <ScorePill label="Fit" value={rationale.fit.score} />
          <ScorePill label="Intent" value={rationale.intent.score} />
          <ScorePill label="Composite" value={rationale.composite} accent />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Data coverage: {Math.round(rationale.fit.coverage * 100)}% of fit dimensions known
        </p>
      </section>

      {/* Fit components */}
      <section aria-label="Fit breakdown">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Fit components
        </h3>
        <ul className="space-y-2">
          {rationale.fit.components.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize text-gray-700">{c.key.replace(/([A-Z])/g, " $1")}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">w={c.weight.toFixed(2)}</span>
                <span
                  className={`text-sm font-semibold ${c.score >= 75 ? "text-emerald-600" : c.score >= 40 ? "text-amber-600" : "text-red-500"}`}
                >
                  {Math.round(c.score)}
                </span>
                {!c.known && (
                  <span className="text-xs text-gray-300" title="Data unknown">
                    ?
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {rationale.fit.components.map((c) => (
          <p key={`detail-${c.key}`} className="mt-0.5 text-xs text-gray-400">
            {c.key}: {c.detail}
          </p>
        ))}
      </section>

      {/* Intent criteria */}
      {rationale.intent.criteria.length > 0 && (
        <section aria-label="Intent breakdown">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
            Intent criteria
          </h3>
          <ul className="space-y-2">
            {rationale.intent.criteria.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize text-gray-700">{signalTypeLabel(c.type)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">w={c.weight.toFixed(2)}</span>
                  <span
                    className={`text-sm font-semibold ${c.score >= 60 ? "text-emerald-600" : c.score > 0 ? "text-amber-600" : "text-gray-400"}`}
                  >
                    {Math.round(c.score)}
                  </span>
                  {c.matched && <span className="text-xs text-emerald-500">matched</span>}
                </div>
              </li>
            ))}
          </ul>
          {rationale.intent.criteria.map((c, i) => (
            <p key={`idetail-${i}`} className="mt-0.5 text-xs text-gray-400">
              {signalTypeLabel(c.type)}: {c.detail}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function EnrichRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="text-gray-800">{value}</dd>
    </>
  );
}

function ScorePill({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-brand-600" : "text-gray-800"}`}>
        {Math.round(value)}
      </p>
    </div>
  );
}
