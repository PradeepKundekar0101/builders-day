import { z } from "zod";
import { estimateSpec, PricingSchema, SelectionSchema } from "@buildwise/estimator";
import { creditsToUnits } from "@buildwise/cost-guard";
import { SpecSchema } from "@buildwise/shared";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
const Input = z.object({
  runId: z.string().uuid(),
  specId: z.string().uuid(),
  selection: SelectionSchema,
  pricingVersion: z.string().min(1).default("v1"),
  billingMode: z.enum(["managed", "byok"]).default("managed"),
});
/** Caller provides only scope and an idempotency UUID. All prices come from stored sources. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { db, userId } = await costIdentity(),
      input = Input.parse(await request.json());
    const { data: spec, error } = await db
      .from("specs")
      .select("id,version,spec,operator_status")
      .eq("id", input.specId)
      .eq("user_id", userId)
      .single();
    if (error || !spec) throw new Error("NOT_FOUND");
    if (!["not_needed", "approved"].includes(spec.operator_status))
      throw new Error("Operator review required");
    // BYOK execution needs verified key ownership from the router. Preview is supported,
    // but accepting a client assertion here would permit free platform-funded model calls.
    if (input.billingMode === "byok")
      throw new Error("BYOK execution requires a verified provider-key integration");
    const service = costService();
    const { data: pricing, error: pricingError } = await service.db
      .from("cost_pricing_versions")
      .select("config")
      .eq("version", input.pricingVersion)
      .single();
    if (pricingError || !pricing) throw new Error("Unknown pricing version");
    const quote = estimateSpec({
      spec: SpecSchema.parse(spec.spec),
      specRevision: `${spec.id}:${spec.version}`,
      selection: input.selection,
      pricing: PricingSchema.parse(pricing.config),
      billingMode: input.billingMode,
    });
    const row = {
      id: input.runId,
      spec_id: spec.id,
      user_id: userId,
      status: "locked",
      selected_features: quote.selection,
      cost_usd: quote.costUsd,
      low_usd: quote.lowUsd,
      high_usd: quote.highUsd,
      hours: quote.hours,
      model_budget_usd: quote.modelBudgetUsd,
      weights_version: quote.weightsVersion,
      spec_revision: quote.specRevision,
      billing_mode: quote.billingMode,
      share_slug: input.runId,
    };
    const { error: insertError } = await service.db.from("quotes").insert(row);
    if (insertError) {
      if (insertError.code !== "23505") throw new Error("Quote creation failed");
      const { data: old } = await service.db
        .from("quotes")
        .select("*")
        .eq("id", input.runId)
        .eq("user_id", userId)
        .single();
      if (
        !old ||
        Object.entries(row).some(([key, value]) =>
          key === "selected_features"
            ? JSON.stringify(SelectionSchema.parse(old[key])) !== JSON.stringify(value)
            : String(old[key]) !== String(value),
        )
      )
        throw new Error("Conflicting quote retry");
    }
    const status = await service.wallet.execute(userId, {
      type: "quote",
      id: `quote:${input.runId}`,
      runId: input.runId,
      quoteId: input.runId,
      specRevision: quote.specRevision,
      capUnits: creditsToUnits(quote.costCredits),
      category: "build",
    });
    return Response.json({ quote, wallet: status, runId: input.runId });
  } catch (error) {
    return costError(error);
  }
}
