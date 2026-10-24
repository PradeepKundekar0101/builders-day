import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_PRICING_VERSION } from "@buildwise/estimator";
/**
 * Whether the quote for this run may start a build: it must use the current Studio pricing and
 * come from a reviewed Prompt Studio version. Throws when storage fails, so a schema or connection
 * problem is never reported as an unreviewed or outdated estimate.
 */
export async function quoteFromReviewedStudio(
  db: SupabaseClient,
  runId: string,
  userId: string,
): Promise<"ok" | "not_studio" | "stale_pricing"> {
  const { data: quote, error: quoteError } = await db
    .from("quotes")
    .select("spec_id,weights_version")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (quoteError) throw new Error(`Quote lookup failed: ${quoteError.message}`);
  if (!quote) return "not_studio";
  const { data: mapping, error: mappingError } = await db
    .from("studio_build_specs")
    .select("spec_id")
    .eq("spec_id", quote.spec_id)
    .maybeSingle();
  if (mappingError) throw new Error(`Reviewed version lookup failed: ${mappingError.message}`);
  if (!mapping) return "not_studio";
  return quote.weights_version === STUDIO_PRICING_VERSION ? "ok" : "stale_pricing";
}
