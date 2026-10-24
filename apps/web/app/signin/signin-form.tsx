"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { publicEnv } from "@/lib/public-env";
import { emailReturnUrl } from "@/lib/email-return";
import { safeNext } from "@/lib/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const LINK_ERROR = "That sign-in link is invalid or expired. Request a new one.";

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    params.get("error") === "link" ? { kind: "error", message: LINK_ERROR } : { kind: "idle" },
  );

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "sending" });
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: emailReturnUrl(publicEnv.siteUrl, next) },
    });
    setStatus(error ? { kind: "error", message: error.message } : { kind: "sent" });
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
      {status.kind === "error" && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
        >
          {status.message}
        </p>
      )}
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
