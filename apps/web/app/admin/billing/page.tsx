import "server-only";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { sessionUser } from "@/lib/server/session-user";

export const metadata = { title: "Billing - Buildwise", robots: { index: false, follow: false } };
const receipt = {
  name: "AYAN CHOUDHARY", amount: 100, date: "24 Oct 2026, 5:52 pm",
  bank: "ICICI Bank 5962", reference: "666334321367", googleId: "CICAgPjhoKekUg",
  recipient: "RESHMA BASKARAN", recipientUpi: "••••••8528@axl on PhonePe",
  sender: "AYAN CHOUDHARY (ICICI Bank)", senderUpi: "••••hary@okicici on Google Pay",
};
const samples = [
  { name: "Demo customer 01", amount: 100, time: "5:40 pm", bank: "ICICI Bank 1021" },
  { name: "Demo customer 02", amount: 500, time: "5:32 pm", bank: "HDFC Bank 2042" },
  { name: "Demo customer 03", amount: 1000, time: "5:18 pm", bank: "Axis Bank 3063" },
  { name: "Demo customer 04", amount: 250, time: "4:56 pm", bank: "SBI 4084" },
  { name: "Demo customer 05", amount: 750, time: "4:35 pm", bank: "ICICI Bank 5105" },
  { name: "Demo customer 06", amount: 200, time: "4:12 pm", bank: "HDFC Bank 6126" },
];
export default function Page() {
  return <Suspense fallback={<p>Loading billing…</p>}><Billing /></Suspense>;
}
async function Billing() {
  const user = await sessionUser();
  if (!user) redirect("/signin?next=/admin/billing");
  if (!user.staff) notFound();
  return <main className="mx-auto max-w-6xl space-y-8 px-6 py-12">
    <header><p className="text-sm uppercase tracking-widest text-go">Buildwise billing</p>
      <h1 className="mt-3 text-4xl font-bold">Paid users & payment records</h1>
      <p className="mt-3 text-slate">One supplied receipt and six mock paid-user records. ₹1 = 1 credit.</p>
      <a className="mt-4 inline-block text-go underline" href="/admin/payments">Review live payment requests →</a>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">
      {[["Supplied receipt", "₹100"], ["Mock paid users", "6"], ["Mock payments only", "₹2,800"]].map(([label,value]) => <section key={label} className="rounded-2xl border border-rule bg-surface p-6"><p className="text-slate">{label}</p><strong className="mt-2 block text-3xl">{value}</strong></section>)}
    </div>
    <section className="rounded-2xl border border-rule bg-surface p-6">
      <div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm text-go">SUPPLIED RECEIPT · NOT BANK-VERIFIED</p><h2 className="mt-2 text-2xl font-bold">{receipt.name}</h2></div><strong className="text-3xl">₹{receipt.amount}</strong></div>
      <p className="my-4 text-slate">Receipt displays “Completed”. Customer account matching and credit allocation are pending. This entry does not change a wallet balance.</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {Object.entries({"Amount":"₹100", "Credit equivalent":"100 credits (not granted)", "Status shown":"Completed", "Payment date":receipt.date, "Bank shown":receipt.bank, "UPI transaction ID":receipt.reference, "To":receipt.recipient, "Recipient UPI (masked in photo)":receipt.recipientUpi, "From":receipt.sender, "Sender UPI (masked in photo)":receipt.senderUpi, "Google transaction ID":receipt.googleId, "Payment app":"Google Pay", "Recipient app":"PhonePe", "Network":"UPI", "Avatar":"R", "Receipt action":"Pay again (source text only)"}).map(([label,value]) => <div key={label}><dt className="text-sm text-slate">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}
      </dl>
      <details className="mt-6 border-t border-rule pt-4"><summary className="cursor-pointer font-semibold">Receipt log</summary><ol className="mt-3 list-inside list-decimal space-y-2 text-slate"><li>24 Oct 2026, 5:52 pm: payment marked Completed in the supplied image.</li><li>Receipt details transcribed from PHOTO-2026-10-24-17-54-30.jpg.</li><li>Bank receipt verification: pending.</li><li>Buildwise customer account match: pending.</li><li>Credit grant: not performed.</li></ol></details>
    </section>
    <section><h2 className="text-2xl font-bold">Mock paid users</h2><p className="my-3 text-slate">Fictional demonstration records and simulated logs. Excluded from real revenue, customer accounts and credit balances.</p>
      <div className="space-y-3">{samples.map((sample,i) => <details key={sample.name} className="rounded-2xl border border-rule bg-surface p-5">
        <summary className="flex cursor-pointer flex-wrap justify-between gap-3"><span className="font-semibold">{sample.name} <span className="ml-2 text-xs text-go">MOCK · PAID</span></span><span>₹{sample.amount} · {sample.amount} mock credits</span></summary>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{Object.entries({"Date":`24 Oct 2026, ${sample.time}`,"Bank (fictional)":sample.bank,"Recipient":"Demo merchant","Recipient UPI":"Masked demo recipient · PhonePe","Sender UPI":"Masked demo sender · Google Pay","UPI reference":`MOCK-UPI-00${i+1}`,"Google transaction ID":`MOCK-GPAY-00${i+1}`,"Payment status":"Completed (simulated)","Credit allocation":`${sample.amount} credits (simulated only)`,"Receipt network":"UPI"}).map(([label,value])=><div key={label}><dt className="text-slate">{label}</dt><dd>{value}</dd></div>)}</dl>
        <h3 className="mt-5 font-semibold">Simulated activity log</h3><ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate"><li>Mock purchase request created for {sample.amount} credits.</li><li>Demo QR displayed; mock payment marked completed at {sample.time}.</li><li>Receipt matching and operator approval simulated.</li><li>{sample.amount} credits displayed in the mock ledger.</li><li>No live payment, account creation or wallet update performed.</li></ol>
      </details>)}</div>
    </section>
  </main>;
}
