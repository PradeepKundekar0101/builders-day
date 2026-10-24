"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Session = { id: string; revision: number; created_at: string };
export function SavedStudioSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/prompt-studio/sessions", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load saved drafts.");
        setSessions(data.sessions);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="mt-8" aria-label="Saved Prompt Studio drafts">
      <h2 className="text-xl font-semibold">Saved drafts</h2>
      {loading && <p role="status">Loading saved drafts…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !sessions.length && (
        <p>No saved drafts yet. Save a brief in Prompt Studio to return to it here.</p>
      )}
      <ul className="mt-4 space-y-3">
        {sessions.map((item) => (
          <li key={item.id} className="rounded-xl border border-rule p-4">
            <Link href={`/apps/new?session=${item.id}`}>
              Resume draft {item.id.slice(0, 8)} · version {item.revision}
            </Link>
            <p className="text-sm text-slate">
              Created {new Date(item.created_at).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
      {sessions.length === 50 && (
        <p>
          Showing your 50 most recently created drafts. Older drafts remain accessible through their
          saved URLs.
        </p>
      )}
    </section>
  );
}
