import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function SiteHeader() {
  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Buildwise
        </Link>
        <Suspense fallback={<span aria-hidden="true" className="h-8 w-20" />}>
          <HeaderAccount />
        </Suspense>
      </div>
    </header>
  );
}

async function HeaderAccount() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;

  if (!data?.claims?.sub) {
    return (
      <Link href="/signin" className="text-sm font-medium text-slate hover:text-ink">
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {email && <span className="truncate text-sm text-slate">{email}</span>}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="shrink-0 whitespace-nowrap rounded-md border border-rule px-3 py-1.5 text-sm font-medium hover:border-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
