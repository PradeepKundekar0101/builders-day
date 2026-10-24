import { z } from "zod";
import { SpecSchema, type Spec } from "@buildwise/shared";

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
    Object.entries({
      static_page: [15000, 0.25],
      entity: [60000, 0.75],
      auth: [40000, 0.5],
      file_upload: [35000, 0.5],
      payment_pinelabs: [80000, 1],
      email: [30000, 0.5],
      ai_feature: [50000, 0.75],
      admin_dashboard: [70000, 1],
    }).map(([key, [tokens, hours]]) => [key, { tokens, hours, weight: 1, integrationUsd: 0 }]),
  ),
});
export const SelectionSchema = z.object({
  specRevision: z.string().min(1),
  selectedIds: z
    .array(z.string())
    .refine((v) => new Set(v).size === v.length, "Duplicate selections"),
});
export type Selection = z.infer<typeof SelectionSchema>;
export type Feature = {
  id: string;
  label: string;
  kind: FeatureKind;
  required: boolean;
  requires: string[];
};
export type EstimateInput = {
  spec: Spec;
  specRevision: string;
  selection?: Selection;
  pricing?: Pricing;
};
const round = (value: number, digits = 2) =>
  Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;

/** Page entries mean standalone pages. CRUD list/form pages are included in entity cost. */
export function catalog(raw: Spec): Feature[] {
  const spec = SpecSchema.parse(raw);
  const features: Feature[] = spec.pages.map((p, i) => ({
    id: `page:${i}`,
    label: p.name,
    kind: "static_page",
    required: p.mustHave,
    requires: [],
  }));
  features.push(
    ...spec.entities.map((e) => ({
      id: `entity:${e.name}`,
      label: e.name,
      kind: "entity" as const,
      required: e.mustHave,
      requires: ["auth"],
    })),
  );
  if (spec.auth.enabled)
    features.push({
      id: "auth",
      label: "Authentication",
      kind: "auth",
      required: true,
      requires: [],
    });
  const kinds = new Set<string>();
  for (const i of spec.integrations) {
    if (kinds.has(i.kind)) throw new Error("Duplicate integration kind");
    kinds.add(i.kind);
    features.push({
      id: `integration:${i.kind}`,
      label: i.kind.replaceAll("_", " "),
      kind: i.kind,
      required: i.mustHave,
      requires: i.kind === "admin_dashboard" ? ["auth"] : [],
    });
  }
  return features;
}
export function defaultSelection(spec: Spec, specRevision: string): Selection {
  const features = catalog(spec),
    selected = new Set(features.filter((f) => f.required).map((f) => f.id));
  for (const f of features)
    if (selected.has(f.id))
      for (const id of f.requires) {
        if (!features.some((item) => item.id === id)) throw new Error(`Missing dependency: ${id}`);
        selected.add(id);
      }
  return SelectionSchema.parse({ specRevision, selectedIds: [...selected] });
}
export function estimate(input: EstimateInput) {
  const features = catalog(input.spec),
    pricing = PricingSchema.parse(input.pricing ?? DEFAULT_PRICING);
  const selection = SelectionSchema.parse(
    input.selection ?? defaultSelection(input.spec, input.specRevision),
  );
  if (selection.specRevision !== input.specRevision)
    throw new Error("Stale specification revision");
  const selected = new Set(selection.selectedIds);
  if (!selected.size) throw new Error("Select at least one feature");
  for (const id of selected)
    if (!features.some((f) => f.id === id)) throw new Error(`Unknown feature: ${id}`);
  for (const f of features) {
    if (f.required && !selected.has(f.id)) throw new Error(`Required feature: ${f.id}`);
    if (selected.has(f.id))
      for (const id of f.requires)
        if (!selected.has(id)) throw new Error(`Missing dependency: ${id}`);
  }
  const featureCosts = features
    .filter((f) => selected.has(f.id))
    .map((f) => {
      const c = pricing.features[f.kind];
      return {
        ...f,
        tokens: c.tokens * c.weight,
        hours: c.hours,
        modelUsd: round((c.tokens * c.weight * pricing.usdPerMillionTokens) / 1e6, 6),
        integrationUsd: c.integrationUsd,
      };
    });
  const tokens = featureCosts.reduce((s, f) => s + f.tokens, 0);
  const modelBudgetUsd = round((tokens * pricing.usdPerMillionTokens) / 1e6, 6);
  const integrationUsd = featureCosts.reduce((s, f) => s + f.integrationUsd, 0);
  const costUsd = round(pricing.margin * modelBudgetUsd + pricing.deployUsd + integrationUsd);
  if (!Number.isFinite(costUsd) || !Number.isSafeInteger(Math.round(modelBudgetUsd * 1e6)))
    throw new Error("Estimate exceeds supported precision");
  return {
    costUsd,
    lowUsd: round(costUsd * (1 - pricing.rangeFraction)),
    highUsd: round(costUsd * (1 + pricing.rangeFraction)),
    hours: round(featureCosts.reduce((s, f) => s + f.hours, 0)),
    modelBudgetUsd,
    tokens,
    weightsVersion: pricing.version,
    specRevision: input.specRevision,
    selection,
    featureCosts,
    drivers: [
      { kind: "model_tokens", costUsd: round(modelBudgetUsd * pricing.margin) },
      { kind: "deploy", costUsd: pricing.deployUsd },
      { kind: "integrations", costUsd: integrationUsd },
    ],
    approximate: true as const,
  };
}
export function suggestAlternatives(input: EstimateInput, targetUsd: number) {
  nonnegative.parse(targetUsd);
  const original = estimate(input),
    features = catalog(input.spec);
  if (original.costUsd <= targetUsd) return { targetUsd, suggestions: [], achievable: true };
  let selection = original.selection;
  const suggestions = [];
  const removable = original.featureCosts
    .filter((f) => !f.required)
    .sort((a, b) => b.modelUsd - a.modelUsd);
  for (const feature of removable) {
    if (
      features.some((f) => selection.selectedIds.includes(f.id) && f.requires.includes(feature.id))
    )
      continue;
    const next = {
      ...selection,
      selectedIds: selection.selectedIds.filter((id) => id !== feature.id),
    };
    if (!next.selectedIds.length) continue;
    const revised = estimate({ ...input, selection: next });
    if (revised.costUsd >= estimate({ ...input, selection }).costUsd) continue;
    selection = next;
    suggestions.push({
      removedIds: original.selection.selectedIds.filter(
        (id) => !selection.selectedIds.includes(id),
      ),
      selection,
      estimate: revised,
      savingsUsd: round(original.costUsd - revised.costUsd),
      fitsTarget: revised.costUsd <= targetUsd,
      tradeoff: `Defer ${original.featureCosts
        .filter((f) => !selection.selectedIds.includes(f.id))
        .map((f) => f.label)
        .join(", ")}. These capabilities will not be included.`,
    });
    if (revised.costUsd <= targetUsd) break;
  }
  return {
    targetUsd,
    suggestions,
    achievable: original.costUsd <= targetUsd || suggestions.some((s) => s.fitsTarget),
  };
}
