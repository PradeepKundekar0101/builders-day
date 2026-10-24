"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DecisionButtons({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/approvals/${approvalId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    }).catch(() => null);
    if (response?.ok) router.refresh();
    else setError(true);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-danger">Try again</span>}
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("rejected")}
        className="h-10 rounded-lg border border-rule px-4 text-sm font-semibold hover:border-ink disabled:opacity-60"
      >
        Reject
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => decide("approved")}
        className="h-10 rounded-lg bg-go px-4 text-sm font-semibold text-white hover:bg-go-hover disabled:opacity-60"
      >
        Approve
      </button>
    </div>
  );
}
