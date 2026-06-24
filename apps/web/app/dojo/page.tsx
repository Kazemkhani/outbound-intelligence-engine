import { DojoWorkspace } from "@/components/dojo/dojo-workspace";
import { SCENARIOS } from "./scenarios";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Voice Dojo · Huscribe Revenue OS",
};

export default function DojoPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Voice Dojo</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Practise selling Huscribe against a realistic UAE real-estate prospect, then get scored on
          your technique. The prospect plays in character and raises real objections; the coach
          grades you against the frameworks (SPIN, Challenger, Voss, Gap Selling). This is a drill:
          nothing here calls anyone or leaves the room.
        </p>
      </header>
      <DojoWorkspace scenarios={SCENARIOS} />
    </div>
  );
}
