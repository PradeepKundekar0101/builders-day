import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { usd } from "@/lib/format";
import { intakeService } from "@/lib/server/intake/instance";
import { sessionUser } from "@/lib/server/session-user";
import { DecisionButtons } from "./decision-buttons";

export const metadata: Metadata = { title: "Approvals - Buildwise", robots: { index: false } };

const REASONS = {
  payment: "Takes payments",
  third_party_personal_data: "Stores other people's personal details",
  over_budget_threshold: "Estimate above $25",
} as const;

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Approvals />
    </Suspense>
  );
}

async function Approvals() {
  const user = await sessionUser();
  if (!user) redirect("/signin?next=/admin/approvals");
  if (!user.staff) notFound();
  const approvals = await intakeService().pendingApprovals();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Approvals</h1>
      {approvals.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-rule bg-surface px-6 py-12 text-center text-slate">
          Nothing waiting for review.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rule bg-surface p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold">{approval.specName}</p>
                <p className="mt-0.5 text-sm text-slate">
                  {approval.flagReasons.map((reason) => REASONS[reason]).join(" · ")}
                  {approval.costUsd !== null && ` · ${usd(approval.costUsd)} approx.`}
                </p>
              </div>
              <DecisionButtons approvalId={approval.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
