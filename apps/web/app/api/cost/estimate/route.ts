import { z } from "zod";
import { estimateSpec as estimate, PricingSchema, SelectionSchema } from "@buildwise/estimator";
import { SpecSchema } from "@buildwise/shared";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
const Input = z.object({
  specId: z.string().uuid(),
  selection: SelectionSchema,
  billingMode: z.enum(["managed", "byok"]).default("managed"),
  pricingVersion: z.string().min(1).default("v1"),
});
/** Authenticated preview only. Payment owner must recompute again when locking. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { db, userId } = await costIdentity();
    const input = Input.parse(await request.json());
    const { data: row, error } = await db
      .from("specs")
      .select("id,version,spec")
      .eq("id", input.specId)
      .eq("user_id", userId)
      .single();
    if (error || !row) throw new Error("NOT_FOUND");
    const { data: pricing, error: pricingError } = await costService()
      .db.from("cost_pricing_versions")
      .select("config")
      .eq("version", input.pricingVersion)
      .single();
    if (pricingError || !pricing) throw new Error("Unknown pricing version");
    return Response.json(
      estimate({
        spec: SpecSchema.parse(row.spec),
        specRevision: `${row.id}:${row.version}`,
        selection: input.selection,
        pricing: PricingSchema.parse(pricing.config),
        billingMode: input.billingMode,
      }),
    );
  } catch (error) {
    return costError(error);
  }
}
