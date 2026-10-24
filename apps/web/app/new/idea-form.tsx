"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IDEA_TEXT_MAX, IDEA_TEXT_MIN } from "@buildwise/shared";

export function IdeaForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = text.trim().length;
  const tooShort = length < IDEA_TEXT_MIN;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/ideas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, links: link.trim() ? [link.trim()] : [] }),
    }).catch(() => null);
    if (response?.ok) {
      const { id } = (await response.json()) as { id: string };
      router.push(`/ideas/${id}`);
      return;
    }
    const body = (await response?.json().catch(() => null)) as { message?: string } | null;
    setError(
      response?.status === 400 && link.trim()
        ? (body?.message ?? "Check the link; it should start with https://.")
        : (body?.message ?? "We couldn't save your idea. Try again."),
    );
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="mt-8">
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <label htmlFor="idea" className="text-sm font-medium">
        Your idea
      </label>
      <textarea
        id="idea"
        required
        rows={7}
        maxLength={IDEA_TEXT_MAX}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="A tiffin order tracker for my home kitchen. Customers pick meals for the week and pay online; I see each day's orders."
        aria-describedby="idea-count"
        className="mt-1.5 w-full resize-y rounded-lg border border-rule bg-surface p-3 text-base leading-relaxed outline-none placeholder:text-slate/70 focus:border-go"
      />
      <p id="idea-count" className="mt-1 text-right text-sm text-slate">
        {tooShort
          ? `${IDEA_TEXT_MIN - length} more ${IDEA_TEXT_MIN - length === 1 ? "character" : "characters"} needed`
          : `${length} / ${IDEA_TEXT_MAX}`}
      </p>

      <label htmlFor="link" className="mt-4 block text-sm font-medium">
        A link that helps explain it <span className="font-normal text-slate">(optional)</span>
      </label>
      <input
        id="link"
        type="url"
        inputMode="url"
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="https://"
        className="mt-1.5 h-12 w-full rounded-lg border border-rule bg-surface px-3 text-base outline-none placeholder:text-slate/70 focus:border-go"
      />

      <p className="mt-4 text-sm text-slate">
        We hide email addresses, phone numbers, card numbers and keys before anything reaches our
        AI.
      </p>

      <button
        type="submit"
        disabled={tooShort || submitting}
        className="mt-6 h-12 w-full rounded-lg bg-go font-semibold text-white hover:bg-go-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting ? "Saving" : "Get my estimate"}
      </button>
    </form>
  );
}
