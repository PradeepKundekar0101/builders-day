"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Build = { id: string; status: string; sessionId: string; revision: number };
export function SavedBuilds() {
  const [builds, setBuilds] = useState<Build[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/prompt-studio/build-status", { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setBuilds(data.builds);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Product builds</h2>
      {error && <p className="mt-3 text-sm">{error}</p>}
      {!builds.length && !error && (
        <p className="mt-3 text-sm">Your approved product builds will appear here.</p>
      )}
      <ul className="mt-4 space-y-3">
        {builds.map((b) => (
          <li key={b.id}>
            <Link
              className="underline"
              href={`/apps/build?session=${b.sessionId}&revision=${b.revision}&run=${b.id}`}
            >
              Version {b.revision} · {b.status} · {b.id.slice(0, 8)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
