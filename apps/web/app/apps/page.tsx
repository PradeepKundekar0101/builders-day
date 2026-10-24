import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { usd } from "@/lib/format";
import { intakeService } from "@/lib/server/intake/instance";
import type { IdeaSummary } from "@/lib/server/intake/service";
import { sessionUser } from "@/lib/server/session-user";

export const metadata: Metadata = { title: "My apps - Buildwise" };

function statusText(idea: IdeaSummary) {
  if (idea.review === "rejected") return "Not approved";
  if (idea.review === "pending") return "Waiting for review";
  if (idea.costUsd !== null) return `${usd(idea.costUsd)} approx.`;
  if (idea.status === "failed") return "Something went wrong";
  return "Estimating";
}

export default function AppsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Apps />
    </Suspense>
  );
}

async function Apps() {
  const user = await sessionUser();
  if (!user) redirect("/signin?next=/apps");
  const ideas = await intakeService().listIdeas(user.id);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">My apps</h1>
        {ideas.length > 0 && (
          <Link
            href="/new"
            className="inline-flex h-11 items-center rounded-lg bg-go px-5 font-semibold text-white hover:bg-go-hover"
          >
            New estimate
          </Link>
        )}
      </div>

      {ideas.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-rule bg-surface px-6 py-12 text-center">
          <p className="font-semibold">
            No apps yet. Describe an idea and get a price in under a minute.
          </p>
          <p className="mt-2 text-sm text-slate">
            Your estimates, builds and live links will show up here.
          </p>
          <Link
            href="/new"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-go px-5 font-semibold text-white hover:bg-go-hover"
          >
            Describe an idea
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-rule rounded-xl border border-rule bg-surface">
          {ideas.map((idea) => (
            <li key={idea.id}>
              <Link
                href={`/ideas/${idea.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-paper"
              >
                <span className="min-w-0 truncate font-medium">{idea.title}</span>
                <span className="shrink-0 text-sm text-slate">{statusText(idea)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
