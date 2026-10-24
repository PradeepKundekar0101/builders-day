import type { SupabaseClient } from "@supabase/supabase-js";
/** Generated apps are hosted as https://<project>.vercel.app; anything else in the table is not shown. */
export function safeLiveUrl(url: unknown) {
  return typeof url === "string" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url)
    ? url
    : undefined;
}
/** Same rule as released_url(): only a released build exposes its deployed URL. Callers check ownership. */
export async function releasedLiveUrl(db: SupabaseClient, build: { id: string; status: string }) {
  if (build.status !== "released") return undefined;
  const { data } = await db
    .from("deployments")
    .select("url")
    .eq("build_id", build.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return safeLiveUrl(data?.url);
}
