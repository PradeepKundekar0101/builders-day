import { z } from "zod";
import { createStudioReview, flagReasons } from "@buildwise/shared";
import { estimateSpec, PricingSchema } from "@buildwise/estimator";
import { supportedSpec } from "@buildwise/build-engine";
import { studioUser, studioDb, studioError } from "@/lib/prompt-studio/server";
import { requireSameOrigin, costService } from "@/lib/cost/server";
import { StudioHttpError, readStudioJson } from "@/lib/prompt-studio/request";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const userId = await studioUser();
    if (process.env.PROVN_LIVE_BUILDS !== "true")
      throw new StudioHttpError(503, "Live builds are not enabled yet. Your brief remains saved.");
    const { sessionId, revision } = z
      .object({ sessionId: z.uuid(), revision: z.number().int().positive() })
      .parse(await readStudioJson(request));
    const db = studioDb(),
      service = costService();
    const { data: session } = await db
      .from("prompt_studio_sessions")
      .select("revision")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!session) throw new StudioHttpError(404, "Draft not found.");
    if (session.revision !== revision)
      throw new StudioHttpError(409, "Your draft changed. Reload before building.");
    const { data: version } = await db
      .from("prompt_studio_versions")
      .select("payload,status")
      .eq("session_id", sessionId)
      .eq("revision", revision)
      .single();
    if (version?.status !== "user_reviewed")
      throw new StudioHttpError(409, "Mark this saved version reviewed before building.");
    const review = createStudioReview(version.payload as never);
    if (review.onboarding?.privateMode)
      throw new StudioHttpError(409, "Private mode does not permit cloud builds.");
    let spec;
    try {
      spec = supportedSpec(review.spec);
    } catch (e) {
      throw new StudioHttpError(422, e instanceof Error ? e.message : "Unsupported scope");
    }
    const { data: pricing } = await service.db
      .from("cost_pricing_versions")
      .select("config")
      .eq("version", "source-v1")
      .single();
    if (!pricing) throw new StudioHttpError(503, "Build pricing is not configured.");
    const estimate = estimateSpec({
      spec,
      specRevision: "review",
      pricing: PricingSchema.parse(pricing.config),
    });
    if (!estimate.selection.selectedIds.some((id) => id.startsWith("page:")))
      throw new StudioHttpError(422, "Mark at least one product page as required before building.");
    const flags = flagReasons(spec, estimate.costUsd);
    const { data: specId, error } = await service.db.rpc("prepare_studio_build", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_revision: revision,
      p_flags: flags,
    });
    if (error)
      throw new StudioHttpError(409, "Unable to lock this draft version. Reload and try again.");
    const { data: stored } = await service.db
      .from("specs")
      .select("version,operator_status")
      .eq("id", specId)
      .single();
    if (!stored) throw new StudioHttpError(503, "Specification storage unavailable.");
    if (!["approved", "not_needed"].includes(stored.operator_status))
      throw new StudioHttpError(
        409,
        "This specification needs operator review before a build can start.",
      );
    return Response.json({
      availableCredits: (await service.wallet.status(userId)).availableCredits,
      specId,
      quote: estimateSpec({
        spec,
        specRevision: `${specId}:${stored.version}`,
        pricing: PricingSchema.parse(pricing.config),
      }),
      sessionId,
      revision,
    });
  } catch (e) {
    return studioError(e);
  }
}
