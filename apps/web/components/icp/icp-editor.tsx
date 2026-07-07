"use client";

import { useState, useMemo, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { round1 } from "@/lib/utils";
import { scoreLead, rankByComposite } from "@oie/core";
import type { IcpProfile, ScoringSubject } from "@oie/core";
import { SEED_ICP, type ScoredLead } from "@/lib/fixtures";
import { saveSetup, type SetupData } from "@/app/setup/actions";

const NOW = new Date();

// ── Reference data ────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Computer Software", "Information Technology & Services", "Internet",
  "SaaS", "FinTech", "MarTech", "HR Tech", "LegalTech", "PropTech",
  "Management Consulting", "Professional Services", "Staffing & Recruiting",
  "Financial Services", "Banking", "Insurance", "Accounting",
  "Marketing & Advertising", "Media & Entertainment", "Publishing",
  "E-Commerce", "Retail", "Wholesale",
  "Healthcare", "Pharmaceuticals", "Medical Devices",
  "Real Estate", "Construction", "Architecture",
  "Manufacturing", "Logistics & Supply Chain", "Transportation",
  "Education", "EdTech", "Non-Profit",
  "Events Services", "Hospitality", "Travel & Tourism",
  "Oil & Energy", "Mining & Metals", "Utilities",
];

const GEOGRAPHIES = [
  "United Kingdom", "United States", "United Arab Emirates",
  "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Germany", "France", "Netherlands", "Spain", "Italy", "Sweden",
  "Canada", "Australia", "Singapore", "India", "South Africa",
];

const TITLES = [
  "CEO", "Co-Founder", "Founder", "Managing Director", "Owner",
  "CRO", "Chief Revenue Officer", "VP of Sales", "VP Sales",
  "Head of Sales", "Director of Sales", "Sales Director",
  "COO", "CFO", "CMO", "CTO", "CPO",
  "VP of Marketing", "Head of Marketing", "Director of Marketing",
  "VP of Operations", "Head of Operations", "Director of Operations",
  "Head of Business Development", "Director of Business Development",
  "VP of Partnerships", "Head of Partnerships",
  "General Manager", "Country Manager", "Regional Director",
];

const SIGNAL_OPTIONS = [
  { type: "hiring",        label: "Hiring activity",   description: "Company is actively hiring" },
  { type: "funding",       label: "Funding rounds",    description: "Recently raised capital" },
  { type: "tech_adoption", label: "Tech adoption",     description: "Adopted new technology" },
  { type: "job_change",    label: "Job changes",       description: "Key contacts changed roles" },
  { type: "news",          label: "News mentions",     description: "Featured in press or media" },
  { type: "web_change",    label: "Website changes",   description: "Updated website or pricing" },
] as const;

type SignalType = typeof SIGNAL_OPTIONS[number]["type"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function TagPills({
  label, options, selected, onChange,
}: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]);

  return (
    <div>
      <p className="label-mono mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? "bg-gold-500/20 text-gold-300 ring-1 ring-inset ring-gold-500/40"
                  : "bg-ink-800 text-ink-400 hover:bg-ink-700 hover:text-ink-200"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-600">{selected.length} selected</p>
      )}
    </div>
  );
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-44 shrink-0 text-sm text-ink-200">{label}</label>
      <input
        type="range" min={0} max={1} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-gold-500"
      />
      <span className="w-10 shrink-0 text-right font-mono text-sm text-ink-300">{value.toFixed(2)}</span>
    </div>
  );
}

function LiveRanking({ icp, leads }: { icp: IcpProfile; leads: ScoredLead[] }) {
  const ranked = useMemo(() => {
    const scored = leads.map((lead) => {
      const subject: ScoringSubject = {
        company: {
          industry: lead.company.industry, employeeCount: lead.company.employeeCount,
          country: lead.company.country, region: lead.company.region,
          lat: lead.company.lat, lng: lead.company.lng,
          localCategory: lead.company.localCategory, techStack: lead.company.techStack,
        },
        contact: { title: lead.contact.title, seniority: lead.contact.seniority, department: lead.contact.department },
        signals: lead.signals.map((s) => ({ type: s.type, strength: s.strength, detectedAt: s.detectedAt, expiresAt: s.expiresAt, evidence: s.evidence })),
      };
      return { lead, score: scoreLead(subject, icp, NOW) };
    });
    return rankByComposite(scored);
  }, [icp, leads]);

  if (ranked.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">No leads yet — discover some to see live ranking.</p>;
  }

  const TIER_VARIANT = { A: "tier_a", B: "tier_b", C: "tier_c", D: "tier_d" } as const;
  return (
    <ol className="space-y-2">
      {ranked.slice(0, 10).map(({ lead, score }, i) => (
        <li key={lead.id} className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm">
          <span className="w-5 shrink-0 text-center font-mono text-xs font-bold text-ink-500">{i + 1}</span>
          <span className="flex-1 font-medium text-ink-100">{lead.company.name}</span>
          <Badge variant={TIER_VARIANT[score.tier]}>Tier {score.tier}</Badge>
          <span className="w-12 text-right font-mono text-xs text-gold-300">{round1(score.composite)}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IcpEditor({
  initialIcp = SEED_ICP,
  initialLeads = [],
  initialSetup,
}: {
  initialIcp?: IcpProfile;
  initialLeads?: ScoredLead[];
  initialSetup?: SetupData | null;
}) {
  const [tab, setTab] = useState<"targeting" | "weights">("targeting");
  const [icp, setIcp] = useState<IcpProfile>(initialIcp);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Targeting state — seeded from setup config if available
  const [industries, setIndustries] = useState<string[]>(
    initialSetup?.targetIndustries ?? initialIcp.firmographics.industries.values ?? []
  );
  const [geographies, setGeographies] = useState<string[]>(
    initialSetup?.targetGeographies ?? initialIcp.firmographics.geographies.countries ?? []
  );
  const [titles, setTitles] = useState<string[]>(
    initialSetup?.targetTitles ?? initialIcp.people.titles ?? []
  );
  const [sizeMin, setSizeMin] = useState(initialSetup?.companySizeMin ?? initialIcp.firmographics.employeeCount.min ?? 10);
  const [sizeMax, setSizeMax] = useState(initialSetup?.companySizeMax ?? initialIcp.firmographics.employeeCount.max ?? 5000);
  const [activeSignals, setActiveSignals] = useState<SignalType[]>(
    (initialIcp.signals.map((s) => s.type) as SignalType[]) ?? ["hiring", "funding"]
  );

  const toggleSignal = (type: SignalType) =>
    setActiveSignals((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const handleSave = () => {
    if (!initialSetup) {
      setError("Complete the Setup wizard first (/setup) to save ICP changes.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveSetup({
        ...initialSetup,
        targetIndustries: industries,
        targetGeographies: geographies,
        targetTitles: titles,
        companySizeMin: sizeMin,
        companySizeMax: sizeMax,
      });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Editor column */}
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-ink-800 bg-ink-900 p-1 w-fit">
          {(["targeting", "weights"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                tab === t ? "bg-gold-500/15 text-gold-300" : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {t === "targeting" ? "Targeting" : "Scoring weights"}
            </button>
          ))}
        </div>

        {tab === "targeting" && (
          <div className="space-y-6">
            {/* Industries */}
            <div className="surface p-5">
              <TagPills label="Target industries" options={INDUSTRIES} selected={industries} onChange={setIndustries} />
            </div>

            {/* Company size */}
            <div className="surface p-5">
              <p className="label-mono mb-3">Company size (employees)</p>
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-ink-500">Min</label>
                  <input
                    type="number" min={1} max={sizeMax} value={sizeMin}
                    onChange={(e) => setSizeMin(Number(e.target.value))}
                    className="w-28 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-50 focus:border-gold-500 focus:outline-none"
                  />
                </div>
                <span className="mt-5 text-ink-500">—</span>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-ink-500">Max</label>
                  <input
                    type="number" min={sizeMin} max={100000} value={sizeMax}
                    onChange={(e) => setSizeMax(Number(e.target.value))}
                    className="w-28 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-50 focus:border-gold-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Geographies */}
            <div className="surface p-5">
              <TagPills label="Target geographies" options={GEOGRAPHIES} selected={geographies} onChange={setGeographies} />
            </div>

            {/* Titles */}
            <div className="surface p-5">
              <TagPills label="Target job titles" options={TITLES} selected={titles} onChange={setTitles} />
            </div>

            {/* Signals */}
            <div className="surface p-5">
              <p className="label-mono mb-3">Buying intent signals</p>
              <p className="mb-4 text-xs text-ink-500">Enable signals to watch for. Active signals are used for lead scoring and agent searches.</p>
              <div className="space-y-3">
                {SIGNAL_OPTIONS.map((sig) => {
                  const active = activeSignals.includes(sig.type);
                  return (
                    <label key={sig.type} className="flex cursor-pointer items-start gap-3">
                      <div className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleSignal(sig.type)}
                          className="h-4 w-4 cursor-pointer accent-gold-500"
                        />
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${active ? "text-ink-100" : "text-ink-400"}`}>{sig.label}</p>
                        <p className="text-xs text-ink-600">{sig.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="btn-primary"
              >
                {isPending ? "Saving…" : saved ? "Saved!" : "Save ICP"}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
              {saved && <p className="text-sm text-emerald-400">ICP updated — scoring engine and agent will use new config.</p>}
            </div>
          </div>
        )}

        {tab === "weights" && (
          <div className="space-y-5">
            <div className="surface p-5 space-y-4">
              <p className="label-mono">Composite blend</p>
              <WeightSlider label="Fit weight" value={icp.compositeBlend.fit}
                onChange={(v) => setIcp((p) => ({ ...p, compositeBlend: { fit: v, intent: Math.max(0, 1 - v) } }))} />
              <WeightSlider label="Intent weight" value={icp.compositeBlend.intent}
                onChange={(v) => setIcp((p) => ({ ...p, compositeBlend: { fit: Math.max(0, 1 - v), intent: v } }))} />
              <p className="text-xs text-ink-500">Fit + Intent must sum to 1.</p>
            </div>

            <div className="surface p-5 space-y-4">
              <p className="label-mono">Tier thresholds</p>
              {(["A", "B", "C"] as const).map((tier) => (
                <div key={tier} className="flex items-center gap-3">
                  <label className="w-44 shrink-0 text-sm text-ink-200">Tier {tier} min score</label>
                  <input type="number" min={0} max={100} value={icp.tierThresholds[tier]}
                    onChange={(e) => setIcp((p) => ({ ...p, tierThresholds: { ...p.tierThresholds, [tier]: Number(e.target.value) } }))}
                    className="w-20 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-50 focus:border-gold-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="surface p-5 space-y-4">
              <p className="label-mono">Firmographic weights</p>
              <WeightSlider label="Industry" value={icp.firmographics.industries.weight}
                onChange={(v) => setIcp((p) => ({ ...p, firmographics: { ...p.firmographics, industries: { ...p.firmographics.industries, weight: v } } }))} />
              <WeightSlider label="Employee count" value={icp.firmographics.employeeCount.weight}
                onChange={(v) => setIcp((p) => ({ ...p, firmographics: { ...p.firmographics, employeeCount: { ...p.firmographics.employeeCount, weight: v } } }))} />
              <WeightSlider label="Geography" value={icp.firmographics.geographies.weight}
                onChange={(v) => setIcp((p) => ({ ...p, firmographics: { ...p.firmographics, geographies: { ...p.firmographics.geographies, weight: v } } }))} />
            </div>

            <div className="surface p-5 space-y-4">
              <p className="label-mono">Signal weights</p>
              {icp.signals.map((sig, idx) => (
                <WeightSlider key={`${sig.type}-${idx}`} label={`Signal: ${sig.type}`} value={sig.weight}
                  onChange={(v) => setIcp((p) => ({ ...p, signals: p.signals.map((s, i) => i === idx ? { ...s, weight: v } : s) }))} />
              ))}
            </div>

            <button type="button" onClick={() => setIcp(initialIcp)} className="btn-ghost">
              Reset to saved ICP
            </button>
          </div>
        )}
      </div>

      {/* Live ranking */}
      <div>
        <div className="surface p-5 sticky top-6">
          <p className="label-mono mb-1">Live re-rank</p>
          <p className="mb-4 text-xs text-ink-500">Top 10 leads re-scored against your current targeting.</p>
          <LiveRanking icp={icp} leads={initialLeads} />
        </div>
      </div>
    </div>
  );
}
