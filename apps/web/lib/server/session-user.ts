import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null; staff: boolean };

/** The signed-in user from verified session claims, or null. */
export async function sessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  // Read through RLS as the user, so the role comes from their own profile row.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", id).single();
  return {
    id,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    staff: profile?.role === "operator" || profile?.role === "admin",
  };
}
