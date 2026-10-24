"use client";
import { useCallback, useEffect, useState } from "react";
import "./purchase.css";
import { useSearchParams } from "next/navigation";
import { buildReturnUrl, readBuildContext, type BuildContext } from "@/lib/payments/build-context";
type Payment = {
  id: string;
  credits: number;
  reference: string | null;
  status: string;
  build_session: string | null;
  build_revision: number | null;
};
export function ManualCredits() {
  const params = useSearchParams();
  const requestedContext = readBuildContext(params);
  const [savedContext, setSavedContext] = useState<BuildContext | null>(null);
  const context = requestedContext ?? savedContext;
  const amount = Number(params.get("amount"));
  const [credits, setCredits] = useState(
      Number.isInteger(amount) && amount >= 100 && amount <= 10000 ? amount : 100,
    ),
    [selected, setSelected] = useState<number | null>(null),
    [activeId, setActiveId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]),
    [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [signedIn, setSignedIn] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/credits/manual", { cache: "no-store" });
      const d = await r.json();
      if (r.status === 401) {
        setSignedIn(false);
        setMessage("");
        return;
      }
      if (!r.ok) throw new Error(d.error);
      setSignedIn(true);
      setPayments(d.purchases);
      setBalance(d.wallet.availableCredits);
      const pending = d.purchases.find((p: Payment) => p.status === "pending");
      setSelected(pending?.credits ?? null);
      setActiveId(pending?.id ?? null);
      const linked =
        pending ?? d.purchases.find((p: Payment) => p.build_session && p.build_revision);
      if (linked?.build_session && linked.build_revision)
        setSavedContext({ session: linked.build_session, revision: linked.build_revision });
      setMessage(
        pending
          ? "Awaiting payment confirmation. If you have paid, do not pay again."
          : d.purchases[0]?.status === "credited"
            ? "Payment confirmed. Your credits have been added. Return to your estimate to review and approve the build."
            : "",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load payments.");
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!activeId) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [activeId, refresh]);
  async function submit() {
    setBusy(true);
    try {
      const r = await fetch("/api/credits/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          credits,
          ...(context ? { buildContext: context } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSelected(credits);
      setActiveId(d.id);
      await refresh();
      setMessage(
        "Awaiting payment confirmation. Your credits will appear here after payment is verified.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not submit. Check recent payments before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="credit-page">
      <a href={context ? buildReturnUrl(context) : "/apps"} className="credit-back">
        {context ? "← Back to build estimate" : "← Back to projects"}
      </a>
      <div className="credit-heading">
        <div>
          <p className="credit-eyebrow">BUILDWISE CREDITS</p>
          <h1>More room to build.</h1>
          <p>₹1 = 1 credit. Pay with any UPI app.</p>
        </div>
        <div className="credit-balance">
          <span>Available credits</span>
          <strong>{balance ?? "…"}</strong>
        </div>
      </div>
      <div className="credit-layout">
        <section className="credit-card">
          <h2>{selected ? `Pay ₹${selected.toLocaleString("en-IN")}` : "Buy credits"}</h2>
          {selected === null ? (
            <>
              <div className="credit-packs">
                {[100, 500, 1000].map((n) => (
                  <button key={n} aria-pressed={credits === n} onClick={() => setCredits(n)}>
                    <strong>₹{n}</strong>
                    <span>{n} credits</span>
                  </button>
                ))}
              </div>
              <label htmlFor="manual-amount">Amount in rupees (₹100 to ₹10,000)</label>
              <input
                id="manual-amount"
                type="number"
                min={100}
                max={10000}
                step={1}
                value={Number.isNaN(credits) ? "" : credits}
                onChange={(e) => setCredits(e.target.valueAsNumber)}
              />
              <div className="credit-total">
                <span>You receive</span>
                <strong>
                  {Number.isInteger(credits) && credits >= 100 && credits <= 10000 ? credits : 0}{" "}
                  credits
                </strong>
              </div>
              {signedIn ? (
                <button
                  className="credit-cta"
                  disabled={busy || !Number.isInteger(credits) || credits < 100 || credits > 10000}
                  onClick={submit}
                >
                  {busy ? "Opening payment…" : "Buy credits"}
                </button>
              ) : (
                <a
                  className="credit-cta"
                  href={`/signin?next=${encodeURIComponent(`/credits?${params.toString()}`)}`}
                >
                  Sign in to buy credits
                </a>
              )}
            </>
          ) : (
            <>
              <p>
                Scan this QR, then enter exactly <strong>₹{selected}</strong> in your UPI app for{" "}
                {selected} credits.
              </p>
              <div className="owner-qr">
                <img
                  src="/payments/owner-upi-qr.png"
                  alt="Owner-provided PhonePe payment QR code"
                />
              </div>
              <a href="/payments/owner-upi-qr.png" download="Buildwise-payment-QR.png">
                Download original QR image
              </a>
              <p className="credit-small">
                On the same phone? Save the image and use your UPI app’s scan-from-gallery option.
                Check the recipient in your app before paying.
              </p>
              <p className="credit-notice" role="status">
                Awaiting payment confirmation. Once your payment is verified, {selected} credits
                will be added here. If you have paid, do not pay again.
              </p>
              <button onClick={() => void refresh()}>Refresh payment status</button>
            </>
          )}
        </section>
        <aside className="credit-card credit-guide">
          <h2>Buy credits. Scan. Pay.</h2>
          <ol>
            <li>
              <strong>Scan the exact QR</strong>
              <p>
                Use Google Pay, PhonePe or another UPI app. The QR does not automatically fill your
                selected amount.
              </p>
            </li>
            <li>
              <strong>Pay the selected amount</strong>
              <p>Complete payment in your UPI app. No reference form to fill in here.</p>
            </li>
            <li>
              <strong>Credits added</strong>
              <p>
                After approval, your wallet receives the matching credits. ₹100 adds 100 credits.
              </p>
            </li>
          </ol>
          <p>
            Already paid? Your balance updates after confirmation. Do not pay again while
            confirmation is pending.
          </p>
        </aside>
      </div>
      <p role="status" className="credit-message">
        {message}
      </p>
      {context && (
        <a className="credit-cta" href={buildReturnUrl(context)}>
          Return to build estimate
        </a>
      )}
      <section className="credit-history">
        <h2>Recent payments</h2>
        <button onClick={() => void refresh()}>Refresh payment status</button>
        {payments.map((p) => (
          <div key={p.id}>
            <span>₹{p.credits}</span>
            <strong>
              {p.status === "credited"
                ? `${p.credits} credits added`
                : p.status === "rejected"
                  ? "Not verified. Contact support before paying again."
                  : "Awaiting payment confirmation"}
            </strong>
          </div>
        ))}
      </section>
    </div>
  );
}
