"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { IdeaView } from "@/lib/server/intake/service";
import { EstimatePanel } from "./estimate-panel";

const POLL_MS = 2000;

export function IntakeView({ initial }: { initial: IdeaView }) {
  const [view, setView] = useState(initial);
  const settled = view.estimate !== null || view.review === "rejected" || view.status === "failed";

  useEffect(() => {
    if (settled) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/ideas/${view.id}`, { cache: "no-store" }).catch(
        () => null,
      );
      if (!cancelled && response?.ok) setView((await response.json()) as IdeaView);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settled, view.id]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-slate">Your idea</p>
      <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">{view.text}</p>

      {view.messages.length > 0 && (
        <ol aria-label="Questions from Buildwise" className="mt-8 space-y-3">
          {view.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.role === "agent"
                  ? "mr-10 rounded-xl rounded-tl-sm border border-rule bg-surface p-4"
                  : "ml-10 rounded-xl rounded-tr-sm bg-ink p-4 text-white"
              }
            >
              {message.role === "agent" ? (
                <p className="mb-1 text-xs font-semibold text-go">Buildwise asks</p>
              ) : (
                <p className="sr-only">You answered</p>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8">
        <Status view={view} onAnswered={setView} />
      </div>
    </div>
  );
}

function Status({ view, onAnswered }: { view: IdeaView; onAnswered: (view: IdeaView) => void }) {
  if (view.estimate) return <EstimatePanel spec={view.estimate.spec} quote={view.estimate.quote} />;
  if (view.review === "rejected") {
    return (
      <Notice title="We can't build this one as described.">
        A Buildwise operator reviewed it and it is outside what we can build safely today. Try a
        simpler version of the idea.
      </Notice>
    );
  }
  if (view.review === "pending") {
    return (
      <Notice title="An operator is checking this estimate.">
        Ideas with payments, other people&apos;s personal details, or a higher price get a quick
        human review. Your price shows up here as soon as it is approved.
      </Notice>
    );
  }
  if (view.status === "failed") {
    return (
      <Notice title="Something went wrong reading your idea.">
        Describe it again in a new estimate and we will take another look.
      </Notice>
    );
  }
  if (view.awaitingAnswer) return <AnswerForm ideaId={view.id} onAnswered={onAnswered} />;
  return (
    <p role="status" className="flex items-center gap-3 text-slate">
      <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-go" />
      {view.messages.length === 0 ? "Reading your idea" : "Working out the details"}
    </p>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-rule bg-surface p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate">{children}</p>
    </div>
  );
}

function AnswerForm({
  ideaId,
  onAnswered,
}: {
  ideaId: string;
  onAnswered: (view: IdeaView) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const response = await fetch(`/api/ideas/${ideaId}/answers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer }),
    }).catch(() => null);
    const refreshed = response?.ok
      ? await fetch(`/api/ideas/${ideaId}`, { cache: "no-store" }).catch(() => null)
      : null;
    if (refreshed?.ok) {
      setAnswer("");
      onAnswered((await refreshed.json()) as IdeaView);
    } else {
      setError("We couldn't send your answer. Try again.");
    }
    setSending(false);
  }

  return (
    <form onSubmit={send}>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <label htmlFor="answer" className="text-sm font-medium">
        Your answer
      </label>
      <textarea
        id="answer"
        required
        rows={3}
        maxLength={1000}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        className="mt-1.5 w-full resize-y rounded-lg border border-rule bg-surface p-3 text-base outline-none focus:border-go"
      />
      <button
        type="submit"
        disabled={sending || answer.trim() === ""}
        className="mt-3 h-11 rounded-lg bg-go px-6 font-semibold text-white hover:bg-go-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Sending" : "Send answer"}
      </button>
    </form>
  );
}
