import { z } from "zod";
import { SpecSchema, type Spec } from "@buildwise/shared";

import {
  calculate,
  round,
  DEFAULT_PRICING,
  PricingSchema,
  type Pricing,
  type FeatureKind,
  type BillingMode,
} from "./pricing";
export { DEFAULT_PRICING, PricingSchema };
/** The pricing snapshot every Prompt Studio build is quoted, approved and started with. */
export const STUDIO_PRICING_VERSION = "source-v2";
/** Studio snapshots whose quotes describe a source build (older ones may no longer be startable). */
export const STUDIO_PRICING_VERSIONS = ["source-v1", STUDIO_PRICING_VERSION] as const;
export const AGENT_BASE_LABEL = "AI code build and checks";
export type { Pricing };
export const SelectionSchema = z.object({
  specRevision: z.string().min(1),
  selectedIds: z
    .array(z.string())
    .refine((v) => new Set(v).size === v.length, "Duplicate selections"),
});
export type SpecSelection = z.infer<typeof SelectionSchema>;
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
  selection?: SpecSelection;
  pricing?: Pricing;
  billingMode?: BillingMode;
};
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
export function defaultSpecSelection(spec: Spec, specRevision: string): SpecSelection {
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
export function estimateSpec(input: EstimateInput) {
  const features = catalog(input.spec),
    pricing = PricingSchema.parse(input.pricing ?? DEFAULT_PRICING);
  const selection = SelectionSchema.parse(
    input.selection ?? defaultSpecSelection(input.spec, input.specRevision),
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
  const chosen = features.filter((f) => selected.has(f.id));
  const totals = calculate(
    chosen.map((f) => ({ kind: f.kind, quantity: 1 })),
    pricing,
    input.billingMode,
  );
  const featureCosts = chosen.map((f, i) => ({ ...f, ...totals.lines[i]! }));
  return {
    ...totals,
    weightsVersion: pricing.version,
    specRevision: input.specRevision,
    selection,
    featureCosts,
    drivers: [
      { kind: "model_tokens", costUsd: round(totals.modelChargeUsd) },
      { kind: "deploy", costUsd: totals.deployChargeUsd },
      { kind: "integrations", costUsd: totals.integrationUsd },
    ],
    approximate: true as const,
  };
}
export function suggestAlternatives(input: EstimateInput, targetUsd: number) {
  z.number().finite().nonnegative().parse(targetUsd);
  const original = estimateSpec(input),
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
    const revised = estimateSpec({ ...input, selection: next });
    if (revised.costUsd >= estimateSpec({ ...input, selection }).costUsd) continue;
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
