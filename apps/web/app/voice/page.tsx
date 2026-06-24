import { VoiceView } from "@/components/voice/voice-view";
import { getCallSessions } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Voice Calls — OIE",
};

export default async function VoicePage() {
  const sessions = await getCallSessions();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink-50">Voice Calls</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          Every NOVA voice call placed by the engine, newest first. Each session shows status,
          consent, and the structured findings captured on the call. Expand a session to read the
          full transcript and the facts written back to the master database.
        </p>
      </header>
      <VoiceView sessions={sessions} />
    </div>
  );
}
