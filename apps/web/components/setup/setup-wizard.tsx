"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import { saveSetup, type SetupData } from "@/app/setup/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type FormData = SetupData;

const EMPTY: FormData = {
  businessName: "",
  website: "",
  tagline: "",
  oneLiner: "",
  targetIndustries: [],
  companySizeMin: 10,
  companySizeMax: 500,
  targetGeographies: [],
  targetTitles: [],
  whatYouSell: "",
  keyBenefits: [],
  differentiators: [],
  pricingNote: "",
  topObjections: [],
  mainCompetitors: [],
};

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "identity", label: "Your business", Icon: Building2 },
  { id: "icp", label: "Ideal customer", Icon: Target },
  { id: "offer", label: "What you sell", Icon: Zap },
  { id: "competition", label: "Objections", Icon: Users },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ── Tag input helper ──────────────────────────────────────────────────────────

function TagInput({
  id,
  label,
  hint,
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");

  const add = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  return (
    <div>
      <label htmlFor={id} className="label-mono mb-1 block">
        {label}
      </label>
      {hint && <p className="mb-2 text-xs text-ink-500">{hint}</p>}

      {/* Existing tags */}
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-gold-500/10 px-2.5 py-0.5 text-xs font-medium text-gold-300 ring-1 ring-inset ring-gold-500/20"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                className="ml-0.5 rounded-full hover:text-gold-100"
                aria-label={`Remove ${v}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          className="input-field flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-300 transition-colors hover:border-gold-500/40 hover:text-gold-200 disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => !values.includes(s))
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border border-ink-700 px-2.5 py-0.5 text-[11px] text-ink-400 transition-colors hover:border-gold-500/30 hover:text-gold-300"
              >
                + {s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function StepIdentity({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="businessName" className="label-mono mb-1 block">Business name *</label>
        <input
          id="businessName"
          type="text"
          value={data.businessName}
          onChange={(e) => onChange({ businessName: e.target.value })}
          placeholder="e.g. GenRiver"
          className="input-field w-full"
          required
        />
      </div>
      <div>
        <label htmlFor="website" className="label-mono mb-1 block">Website</label>
        <input
          id="website"
          type="text"
          value={data.website ?? ""}
          onChange={(e) => onChange({ website: e.target.value })}
          placeholder="e.g. genriverai.com"
          className="input-field w-full"
        />
      </div>
      <div>
        <label htmlFor="tagline" className="label-mono mb-1 block">Tagline</label>
        <input
          id="tagline"
          type="text"
          value={data.tagline ?? ""}
          onChange={(e) => onChange({ tagline: e.target.value })}
          placeholder="e.g. AI-native outbound for B2B meetings"
          className="input-field w-full"
        />
      </div>
      <div>
        <label htmlFor="oneLiner" className="label-mono mb-1 block">One-line pitch *</label>
        <p className="mb-2 text-xs text-ink-500">
          The single sentence that goes in every cold email. "We help [who] [achieve what] [how] [timeframe]."
        </p>
        <textarea
          id="oneLiner"
          rows={2}
          value={data.oneLiner}
          onChange={(e) => onChange({ oneLiner: e.target.value })}
          placeholder="e.g. GenRiver builds Clay-powered outbound systems that book B2B meetings in 10 days — fully managed."
          className="input-field w-full resize-none"
          required
        />
      </div>
    </div>
  );
}

function StepIcp({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="space-y-6">
      <TagInput
        id="targetIndustries"
        label="Target industries *"
        hint="What industries are your best customers in?"
        values={data.targetIndustries}
        onChange={(v) => onChange({ targetIndustries: v })}
        placeholder="e.g. SaaS"
        suggestions={["SaaS", "Staffing", "Professional services", "Fintech", "Logistics", "Real estate", "Healthcare", "E-commerce"]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sizeMin" className="label-mono mb-1 block">Min employees</label>
          <input
            id="sizeMin"
            type="number"
            min={1}
            value={data.companySizeMin}
            onChange={(e) => onChange({ companySizeMin: Number(e.target.value) })}
            className="input-field w-full"
          />
        </div>
        <div>
          <label htmlFor="sizeMax" className="label-mono mb-1 block">Max employees</label>
          <input
            id="sizeMax"
            type="number"
            min={1}
            value={data.companySizeMax}
            onChange={(e) => onChange({ companySizeMax: Number(e.target.value) })}
            className="input-field w-full"
          />
        </div>
      </div>

      <TagInput
        id="targetGeographies"
        label="Target geographies *"
        hint="Countries or regions you sell into."
        values={data.targetGeographies}
        onChange={(v) => onChange({ targetGeographies: v })}
        placeholder="e.g. United Kingdom"
        suggestions={["United Kingdom", "United States", "United Arab Emirates", "Saudi Arabia", "Australia", "Canada", "Europe"]}
      />

      <TagInput
        id="targetTitles"
        label="Target job titles *"
        hint="Who do you sell to? Add every persona."
        values={data.targetTitles}
        onChange={(v) => onChange({ targetTitles: v })}
        placeholder="e.g. Head of Sales"
        suggestions={["CEO", "Founder", "Head of Sales", "VP Sales", "Sales Director", "Managing Director", "CRO", "COO", "Head of Growth"]}
      />
    </div>
  );
}

function StepOffer({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="whatYouSell" className="label-mono mb-1 block">What you sell *</label>
        <p className="mb-2 text-xs text-ink-500">
          Full description: what it is, how it works, what the outcome is.
        </p>
        <textarea
          id="whatYouSell"
          rows={4}
          value={data.whatYouSell}
          onChange={(e) => onChange({ whatYouSell: e.target.value })}
          placeholder="e.g. GenRiver builds end-to-end outbound systems using Clay for enrichment and AI for personalisation. We identify buying signals, enrich decision-makers, and deploy multi-channel sequences across email, LinkedIn, and WhatsApp..."
          className="input-field w-full resize-y"
          required
        />
      </div>

      <TagInput
        id="keyBenefits"
        label="Key benefits *"
        hint="The outcomes your customers get. Be specific — numbers, timeframes, results."
        values={data.keyBenefits}
        onChange={(v) => onChange({ keyBenefits: v })}
        placeholder="e.g. Booked meetings in 10 days"
        suggestions={["Booked meetings", "Reduced CAC", "Faster pipeline", "More qualified leads", "Higher reply rates", "Saved SDR costs"]}
      />

      <TagInput
        id="differentiators"
        label="What makes you different *"
        hint="Why you and not a competitor or DIY?"
        values={data.differentiators}
        onChange={(v) => onChange({ differentiators: v })}
        placeholder="e.g. Fully managed — no hire needed"
        suggestions={["Fully managed", "Signal-first targeting", "Clay-powered enrichment", "Faster setup", "Performance-based", "Specialised niche"]}
      />

      <div>
        <label htmlFor="pricingNote" className="label-mono mb-1 block">Pricing note</label>
        <p className="mb-2 text-xs text-ink-500">
          Not committed to prospects, but used to handle pricing objections in the Knowledge base.
        </p>
        <input
          id="pricingNote"
          type="text"
          value={data.pricingNote ?? ""}
          onChange={(e) => onChange({ pricingNote: e.target.value })}
          placeholder="e.g. From £2,500/mo — less than one SDR salary"
          className="input-field w-full"
        />
      </div>
    </div>
  );
}

function StepCompetition({ data, onChange }: { data: FormData; onChange: (d: Partial<FormData>) => void }) {
  return (
    <div className="space-y-6">
      <TagInput
        id="topObjections"
        label="Top objections you hear"
        hint="The most common reasons prospects don't buy. The Knowledge base will have scripted responses for each."
        values={data.topObjections}
        onChange={(v) => onChange({ topObjections: v })}
        placeholder="e.g. We already tried outbound and it didn't work"
        suggestions={[
          "We already tried outbound",
          "Too expensive",
          "We do it in-house",
          "Not the right time",
          "We rely on referrals",
          "We have a full SDR team",
        ]}
      />

      <TagInput
        id="mainCompetitors"
        label="Main competitors"
        hint="Who are prospects comparing you against?"
        values={data.mainCompetitors}
        onChange={(v) => onChange({ mainCompetitors: v })}
        placeholder="e.g. In-house SDR team"
        suggestions={["In-house SDRs", "Generic outbound agencies", "DIY with Clay", "Lemlist", "Apollo", "Outreach"]}
      />
    </div>
  );
}

// ── Wizard shell ──────────────────────────────────────────────────────────────

const STEP_IDS: StepId[] = STEPS.map((s) => s.id);

export function SetupWizard({ existing }: { existing: SetupData | null }) {
  const [step, setStep] = useState<StepId>("identity");
  const [form, setForm] = useState<FormData>(existing ?? EMPTY);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentIndex = STEP_IDS.indexOf(step);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === STEP_IDS.length - 1;

  const update = (patch: Partial<FormData>) => setForm((f) => ({ ...f, ...patch }));

  const canAdvance = (): boolean => {
    if (step === "identity") return !!form.businessName.trim() && !!form.oneLiner.trim();
    if (step === "icp")
      return (
        form.targetIndustries.length > 0 &&
        form.targetGeographies.length > 0 &&
        form.targetTitles.length > 0
      );
    if (step === "offer") return !!form.whatYouSell.trim() && form.keyBenefits.length > 0 && form.differentiators.length > 0;
    return true;
  };

  const next = () => {
    if (!canAdvance()) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEP_IDS.length) setStep(STEP_IDS[nextIndex]!);
  };

  const back = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) setStep(STEP_IDS[prevIndex]!);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveSetup(form);
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  };

  if (done) {
    return (
      <div className="surface p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <h2 className="font-display text-xl font-bold text-ink-50">Platform configured</h2>
        <p className="mt-2 text-sm text-ink-400">
          Your ICP, offer, and messaging are live. The scoring engine, agent, and knowledge base are
          all using your settings.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/agent"
            className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400"
          >
            <Sparkles size={15} /> Try the agent
          </a>
          <a
            href="/leads"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-200 transition-colors hover:bg-ink-800"
          >
            View leads
          </a>
          <a
            href="/setup"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-medium text-ink-400 transition-colors hover:bg-ink-800"
          >
            Edit setup
          </a>
        </div>
      </div>
    );
  }

  const stepDef = STEPS[currentIndex]!;

  return (
    <div>
      {/* Step progress */}
      <nav aria-label="Setup steps" className="mb-8">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const passed = i < currentIndex;
            const active = s.id === step;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { if (passed) setStep(s.id); }}
                  disabled={!passed && !active}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-gold-500/10 text-gold-300 ring-1 ring-inset ring-gold-500/30"
                      : passed
                        ? "cursor-pointer text-emerald-400 hover:text-emerald-300"
                        : "cursor-default text-ink-600"
                  }`}
                >
                  {passed ? (
                    <CheckCircle2 size={13} aria-hidden="true" />
                  ) : (
                    <s.Icon size={13} aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="text-ink-700" aria-hidden="true">›</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step content */}
      <div className="surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400 ring-1 ring-inset ring-gold-500/20">
            <stepDef.Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="label-mono">{`Step ${currentIndex + 1} of ${STEPS.length}`}</p>
            <h2 className="font-display text-base font-bold text-ink-50">{stepDef.label}</h2>
          </div>
        </div>

        {step === "identity" && <StepIdentity data={form} onChange={update} />}
        {step === "icp" && <StepIcp data={form} onChange={update} />}
        {step === "offer" && <StepOffer data={form} onChange={update} />}
        {step === "competition" && <StepCompetition data={form} onChange={update} />}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={isFirst}
            className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-ink-800 disabled:opacity-0"
          >
            <ArrowLeft size={14} /> Back
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !canAdvance()}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                <><CheckCircle2 size={15} /> Save & launch</>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
