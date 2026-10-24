"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ReviewPayment({ id }: { id: string }) {
  const [reference, setReference] = useState("");
  const [verified, setVerified] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/credits/manual/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approve,
          receiptVerified: verified,
          ...(approve ? { reference } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? d.error ?? "Review failed");
      setMessage(d.status === "credited" ? "Credits added." : "Payment rejected.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <label className="block">
        Verified bank UPI reference (12 digits)
        <input
          className="my-2 block rounded border p-2"
          inputMode="numeric"
          maxLength={12}
          value={reference}
          onChange={(e) => setReference(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      <label className="flex gap-2">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        I checked the bank or UPI app and matched the received amount, reference and customer.
      </label>
      <div className="my-4 flex gap-4">
        <button
          className="rounded bg-go px-4 py-2 text-paper disabled:opacity-40"
          disabled={!verified || busy || !/^\d{12}$/.test(reference)}
          onClick={() => void decide(true)}
        >
          Approve and add credits
        </button>
        <button disabled={busy} onClick={() => void decide(false)}>
          Reject claim
        </button>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
