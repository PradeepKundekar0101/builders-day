import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { sessionUser } from "@/lib/server/session-user";
import { costService } from "@/lib/cost/server";
import { ReviewPayment } from "./review";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading payments…</p>}>
      <Payments />
    </Suspense>
  );
}
async function Payments() {
  const user = await sessionUser();
  if (!user) redirect("/signin?next=/admin/payments");
  if (!user.staff) notFound();
  const { data, error } = await costService()
    .db.from("manual_credit_payments")
    .select("*")
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <h1 className="text-3xl font-bold">Verify UPI payments</h1>
      <a href="/admin/billing" className="mt-4 inline-block text-go underline">Billing records & activity logs</a>
      <p className="my-4">
        Check each reference, received amount and payer against your bank or UPI app. A submitted
        reference is not proof of receipt.
      </p>
      {data.length === 0 ? (
        <p>No payments waiting for review.</p>
      ) : (
        data.map((p) => (
          <section key={p.id} className="my-4 rounded-xl border p-6">
            <h2 className="text-xl font-bold">
              ₹{p.credits} for {p.credits} credits
            </h2>
            <p>UPI reference: {p.reference}</p>
            <p>Customer account: {p.account_id}</p>
            <p>Submitted: {p.created_at}</p>
            <ReviewPayment id={p.id} />
          </section>
        ))
      )}
    </div>
  );
}
