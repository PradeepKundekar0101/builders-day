import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@buildwise/db";
import { publicEnv } from "@/lib/public-env";

const PROTECTED_PREFIXES = ["/apps", "/new", "/ideas", "/admin"];

const isProtected = (pathname: string) =>
  PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/** Refreshes the Supabase session cookie and applies the optimistic auth redirects. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // Keeps a CDN from serving one user's refreshed session cookie to another user.
        cacheHeaders = { ...cacheHeaders, ...headers };
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
    return redirect;
  };

  if (!signedIn && isProtected(pathname)) {
    return redirectTo(`/signin?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && pathname === "/signin") {
    return redirectTo("/apps");
  }
  return response;
}
