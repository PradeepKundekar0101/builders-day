import { SavedBuilds } from "@/components/prompt-studio/saved-builds";
import { SavedStudioSessions } from "@/components/prompt-studio/saved-sessions";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { usd } from "@/lib/format";
import { intakeService } from "@/lib/server/intake/instance";
import type { IdeaSummary } from "@/lib/server/intake/service";
import { sessionUser } from "@/lib/server/session-user";

export const metadata: Metadata = { title: "My apps - PROVN" };

export default function AppsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">My apps</h1>
      <div className="mt-8 rounded-xl border border-dashed border-rule bg-surface px-6 py-12 text-center">
        <p className="font-semibold">Start with an idea. Shape it into a clear product brief.</p>
        <p className="mt-2 text-sm text-slate">
          Create and review your requirements in Prompt Studio.
        </p>
        <Link
          href="/apps/new"
          className="mt-6 inline-block rounded-xl bg-go px-5 py-3 font-semibold text-white"
        >
          Open Prompt Studio
        </Link>
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-slate">Loading estimates…</p>}>
        <SavedEstimates />
      </Suspense>
      <SavedStudioSessions />
      <SavedBuilds />
    </div>
  );
}

function statusText(idea: IdeaSummary) {
  if (idea.review === "rejected") return "Not approved";
  if (idea.review === "pending") return "Waiting for review";
  if (idea.costUsd !== null) return `${usd(idea.costUsd)} approx.`;
  if (idea.status === "failed") return "Something went wrong";
  return "Estimating";
}

async function SavedEstimates() {
  const user = await sessionUser();
  if (!user) return null;
  const ideas = await intakeService().listIdeas(user.id);
  if (ideas.length === 0) return null;
  return (
    <section className="mt-8" aria-label="Saved estimates">
      <h2 className="text-xl font-semibold">Your estimates</h2>
      <ul className="mt-4 divide-y divide-rule rounded-xl border border-rule bg-surface">
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
    </section>
  );
}
