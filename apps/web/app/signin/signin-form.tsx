"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { publicEnv } from "@/lib/public-env";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const LINK_ERROR = "That sign-in link is invalid or expired. Request a new one.";

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const resume = next.startsWith("/apps/new?")
    ? new URL(next, "https://local.invalid").searchParams.get("resume")
    : null;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    params.get("error") === "link" ? { kind: "error", message: LINK_ERROR } : { kind: "idle" },
  );

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${publicEnv.siteUrl}${next}` },
    });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent" });
  }

  async function continueWithGoogle() {
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${publicEnv.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setStatus({ kind: "error", message: error.message });
  }

  if (status.kind === "sent") {
    return (
      <div role="status" className="mt-8 rounded-lg border border-rule bg-surface p-5">
        <p className="font-semibold">Check your email for a sign-in link.</p>
        <p className="mt-1 text-sm text-slate">
          We sent it to {email}. The link works once and expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {resume && (
        <div className="mb-5 text-sm text-slate">
          <p>Sign in to continue to your Prompt Studio draft. Your work is kept in this tab.</p>
          <a
            className="underline"
            href={`/prompt-studio-demo?resume=${encodeURIComponent(resume)}`}
          >
            Back to my draft
          </a>
        </div>
      )}
      {status.kind === "error" && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {status.message}
        </p>
      )}
      <button
        type="button"
        onClick={continueWithGoogle}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-rule bg-surface font-semibold hover:border-ink"
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="my-6 flex items-center gap-3 text-sm text-slate" aria-hidden="true">
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form onSubmit={sendLink}>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1.5 h-12 w-full rounded-lg border border-rule bg-surface px-3 text-base outline-none focus:border-go"
        />
        <button
          type="submit"
          disabled={status.kind === "sending"}
          className="mt-4 h-12 w-full rounded-lg bg-go font-semibold text-white hover:bg-go-hover disabled:opacity-60"
        >
          {status.kind === "sending" ? "Sending link" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
