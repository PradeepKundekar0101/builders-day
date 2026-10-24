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
  { name: "MEERA SHAH", amount: 100, time: "5:40 pm", bank: "ICICI Bank 1021" },
  { name: "ARJUN NAIR", amount: 500, time: "5:32 pm", bank: "HDFC Bank 2042" },
  { name: "KAVYA RAO", amount: 1000, time: "5:18 pm", bank: "Axis Bank 3063" },
  { name: "ROHAN MEHTA", amount: 250, time: "4:56 pm", bank: "SBI 4084" },
  { name: "NEHA IYER", amount: 750, time: "4:35 pm", bank: "ICICI Bank 5105" },
  { name: "VIKRAM SEN", amount: 200, time: "4:12 pm", bank: "HDFC Bank 6126" },
];
export default function Page() {
  return <Suspense fallback={<p>Loading billing…</p>}><Billing /></Suspense>;
}
async function Billing() {
  const user = await sessionUser();
  if (!user) redirect("/signin?next=/admin/billing");
  if (!user.staff) notFound();
  const rows = [
    { ...receipt, source: "Supplied receipt", logs: [
      `${receipt.date}: Completed status shown in supplied image.`,
      "Source: PHOTO-2026-10-24-17-54-30.jpg.",
      "Bank receipt verification and customer account match pending.",
      "Credit grant not performed.",
    ] },
    ...samples.map((sample, i) => ({
      ...sample, date: `24 Oct 2026, ${sample.time}`, source: "Sample data",
      reference: `SAMPLE-UPI-00${i + 1}`, googleId: `SAMPLE-GPAY-00${i + 1}`,
      recipient: receipt.recipient, recipientUpi: receipt.recipientUpi,
      sender: `${sample.name} (${sample.bank.split(" ").slice(0, -1).join(" ")})`,
      senderUpi: `••••user${i + 1}@example.invalid on Google Pay`,
      logs: [
        `${sample.time}: Purchase request for ${sample.amount} credits.`,
        `${sample.time}: QR displayed and payment completed.`,
        `${sample.time}: Receipt matched and approved.`,
        `${sample.time}: ${sample.amount} credits allocated.`,
        "All events in this sample record are fictional; no wallet was changed.",
      ],
    })),
  ];
  return <main className="mx-auto max-w-7xl space-y-6 px-6 py-12">
    <header><p className="text-sm uppercase tracking-widest text-go">Buildwise billing</p>
      <h1 className="mt-3 text-4xl font-bold">Payment records</h1>
      <p className="mt-3 text-slate">7 records · ₹1 = 1 credit</p>
      <a className="mt-3 inline-block text-go underline" href="/admin/payments">Review live payment requests →</a>
    </header>
    <p className="rounded-xl border border-rule bg-surface p-4 text-sm text-slate">The supplied receipt awaits bank verification. The other six entries are sample data with fictional payment histories. These records do not contribute to verified revenue or wallet balances.</p>
    <div className="overflow-x-auto rounded-2xl border border-rule bg-surface">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <caption className="sr-only">Seven payment records with transaction details and activity logs</caption>
        <thead className="border-b border-rule text-slate"><tr>{["Customer", "Amount", "Credits", "Date", "Status shown", "Source", "Details & logs"].map(h => <th key={h} scope="col" className="px-5 py-4 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.reference} className="border-b border-rule align-top last:border-0">
          <th scope="row" className="px-5 py-5 font-semibold">{row.name}</th>
          <td className="whitespace-nowrap px-5 py-5">₹{row.amount.toLocaleString("en-IN")}</td>
          <td className="px-5 py-5">{row.amount}</td>
          <td className="whitespace-nowrap px-5 py-5">{row.date}</td>
          <td className="px-5 py-5">Completed</td>
          <td className="whitespace-nowrap px-5 py-5 text-go">{row.source}</td>
          <td className="min-w-72 px-5 py-5"><details><summary className="cursor-pointer text-go">View details & logs</summary>
            <dl className="mt-4 space-y-3">{Object.entries({
              "Bank": row.bank, "UPI transaction ID": row.reference,
              "To": row.recipient, "Recipient UPI": row.recipientUpi,
              "From": row.sender, "Sender UPI": row.senderUpi,
              "Google transaction ID": row.googleId, "Payment app": "Google Pay",
              "Recipient app": "PhonePe", "Network": "UPI", "Avatar": "R",
              "Receipt action": "Pay again (display text)",
              "Credit allocation": row.source === "Supplied receipt" ? "Not granted" : "Sample allocation",
            }).map(([label,value]) => <div key={label}><dt className="text-xs text-slate">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
            <h2 className="mt-5 font-semibold">Activity log</h2>
            <ol className="mt-3 list-inside list-decimal space-y-2 text-slate">{row.logs.map(log => <li key={log}>{log}</li>)}</ol>
          </details></td>
        </tr>)}</tbody>
      </table>
    </div>
  </main>;
}
