import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { FIXTURE_APPROVALS } from "@/lib/fixtures";

export const metadata = {
  title: "Approval Queue — OIE",
};

export default function ApprovalsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Messages queued for sending. Each must be individually approved by an operator before it
          can progress. Nothing sends without your explicit action.
        </p>
      </header>
      <ApprovalQueue items={FIXTURE_APPROVALS} />
    </div>
  );
}
