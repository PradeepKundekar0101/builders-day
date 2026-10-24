import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@buildwise/db";
import { publicEnv } from "@/lib/public-env";

import { safeNext } from "@/lib/safe-next";

const PROTECTED_PREFIX = "/apps";

/** Refreshes the Supabase session cookie and applies the optimistic auth redirects. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && (pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`))) {
    return redirectTo(`/signin?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && pathname === "/signin") {
    return redirectTo(safeNext(request.nextUrl.searchParams.get("next")));
  }
  return response;
}
