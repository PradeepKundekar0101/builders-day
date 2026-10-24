import { SavedStudioSessions } from "@/components/prompt-studio/saved-sessions";
import Link from "next/link";
import type { Metadata } from "next";

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
      <SavedStudioSessions />
    </div>
  );
}
