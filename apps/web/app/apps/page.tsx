import type { Metadata } from "next";

export const metadata: Metadata = { title: "My apps - PROVN" };

export default function AppsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">My apps</h1>
      <div className="mt-8 rounded-xl border border-dashed border-rule bg-surface px-6 py-12 text-center">
        <p className="font-semibold">
          No apps yet. Describe an idea and get a price in under a minute.
        </p>
        <p className="mt-2 text-sm text-slate">
          Your estimates, builds and live links will show up here.
        </p>
      </div>
    </div>
  );
}
