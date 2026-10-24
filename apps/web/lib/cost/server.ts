import "server-only";
import { createClient } from "@supabase/supabase-js";
import { CostGuard, PostgresStore } from "@buildwise/cost-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function costIdentity() {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") throw new Error("UNAUTHENTICATED");
  return { db, userId };
}
export function costService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Cost service is not configured");
  // Separate untyped RPC client until `pnpm db:types` regenerates the new functions.
  const db = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, guard: new CostGuard(new PostgresStore(db)) };
}
export function requireSameOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.NEXT_PUBLIC_SITE_URL ?? request.url).origin
  )
    throw new Error("INVALID_ORIGIN");
}
export function costError(error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid request";
  return Response.json(
    {
      error:
        message === "UNAUTHENTICATED"
          ? "Sign in required"
          : message === "NOT_FOUND"
            ? "Not found"
            : message === "INVALID_ORIGIN"
              ? "Invalid origin"
              : "Cost request rejected. Check the specification, selection, and budget state.",
    },
    {
      status:
        message === "UNAUTHENTICATED"
          ? 401
          : message === "NOT_FOUND"
            ? 404
            : message === "INVALID_ORIGIN"
              ? 403
              : 400,
    },
  );
}
