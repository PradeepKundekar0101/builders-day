import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * True when the quote for this run was made from a reviewed Prompt Studio version.
 * Throws when storage fails, so a schema or connection problem is never reported as "not reviewed".
 */
export async function quoteFromReviewedStudio(db: SupabaseClient, runId: string, userId: string) {
  const { data: quote, error: quoteError } = await db
    .from("quotes")
    .select("spec_id,weights_version")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (quoteError) throw new Error(`Quote lookup failed: ${quoteError.message}`);
  if (!quote || quote.weights_version !== "source-v1") return false;
  const { data: mapping, error: mappingError } = await db
    .from("studio_build_specs")
    .select("spec_id")
    .eq("spec_id", quote.spec_id)
    .maybeSingle();
  if (mappingError) throw new Error(`Reviewed version lookup failed: ${mappingError.message}`);
  return Boolean(mapping);
}
