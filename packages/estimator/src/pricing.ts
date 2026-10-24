import { z } from "zod";
import { FEATURES_V1 } from "./features";
export const FeatureKindSchema = z.enum([
  "static_page",
  "entity",
  "auth",
  "file_upload",
  "payment_pinelabs",
  "email",
  "ai_feature",
  "admin_dashboard",
]);
export type FeatureKind = z.infer<typeof FeatureKindSchema>;
const nonnegative = z.number().finite().nonnegative();
export const PricingSchema = z.object({
  version: z.string().min(1),
  usdPerMillionTokens: nonnegative,
  margin: nonnegative,
  deployUsd: nonnegative,
  rangeFraction: nonnegative.max(1),
  features: z.record(
    FeatureKindSchema,
    z.object({
      tokens: z.number().int().nonnegative(),
      hours: nonnegative,
      weight: nonnegative,
      integrationUsd: nonnegative,
    }),
  ),
});
export type Pricing = z.infer<typeof PricingSchema>;
export const DEFAULT_PRICING: Pricing = PricingSchema.parse({
  version: "v1",
  usdPerMillionTokens: 6,
  margin: 2,
  deployUsd: 1,
  rangeFraction: 0.3,
  features: Object.fromEntries(
    Object.entries(FEATURES_V1).map(([key, feature]) => [
      key === "crud_entity" ? "entity" : key,
      { tokens: feature.tokens, hours: feature.hours, weight: 1, integrationUsd: 0 },
    ]),
  ),
});

export type BillingMode = "managed" | "byok";
export const round = (value: number, digits = 2) =>
  Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
/** Single arithmetic engine for the phase-1 count API and revision-bound API. */
export function calculate(
  items: { kind: FeatureKind; quantity: number }[],
  raw: Pricing,
  billingMode: BillingMode = "managed",
) {
  const config = PricingSchema.parse(raw);
  z.enum(["managed", "byok"]).parse(billingMode);
  const lines = items
    .filter((i) => {
      z.number().int().nonnegative().max(100000).parse(i.quantity);
      FeatureKindSchema.parse(i.kind);
      return i.quantity > 0;
    })
    .map((i) => {
      const f = config.features[i.kind];
      return {
        ...i,
        tokens: f.tokens * i.quantity * f.weight,
        hours: f.hours * i.quantity,
        modelUsd: round((f.tokens * i.quantity * f.weight * config.usdPerMillionTokens) / 1e6, 6),
        integrationUsd: f.integrationUsd * i.quantity,
      };
    });
  const tokens = lines.reduce((s, i) => s + i.tokens, 0),
    modelBudgetUsd = round((tokens * config.usdPerMillionTokens) / 1e6, 6),
    integrationUsd = round(
      lines.reduce((s, i) => s + i.integrationUsd, 0),
      6,
    );
  const modelChargeUsd = billingMode === "byok" ? 0 : round(config.margin * modelBudgetUsd, 6);
  const deployChargeUsd = billingMode === "byok" ? 0 : config.deployUsd;
  const costUsd = round(modelChargeUsd + deployChargeUsd + integrationUsd);
  if (
    !Number.isFinite(costUsd) ||
    !Number.isSafeInteger(Math.round(costUsd * 1e6)) ||
    !Number.isSafeInteger(Math.round(modelBudgetUsd * 1e6))
  )
    throw new Error("Unsupported precision");
  const lowUsd = round(costUsd * (1 - config.rangeFraction)),
    highUsd = round(costUsd * (1 + config.rangeFraction));
  return {
    lines,
    tokens,
    modelBudgetUsd,
    costUsd,
    lowUsd,
    highUsd,
    hours: round(lines.reduce((s, i) => s + i.hours, 0)),
    modelChargeUsd,
    deployChargeUsd,
    integrationUsd,
    costCredits: round(costUsd * 100, 4),
    lowCredits: round(lowUsd * 100, 4),
    highCredits: round(highUsd * 100, 4),
    modelBudgetCredits: round(modelBudgetUsd * 100, 4),
    requiresApproval: costUsd * 100 > 50,
    billingMode,
  };
}
