import { calculate, DEFAULT_PRICING, round, type Pricing, type BillingMode } from "./pricing";
import type { IntegrationKind } from "@buildwise/shared";
import { ESTIMATOR_V1, FEATURES_V1, type EstimatorConfig, type FeatureKey } from "./features";

export type EstimateInput = {
  pages: number;
  entities: number;
  auth: boolean;
  integrations: IntegrationKind[];
};

export type LineItem = {
  key: FeatureKey;
  label: string;
  quantity: number;
  tokens: number;
  hours: number;
  usd: number;
};

export type Driver = { key: "model" | "deploy" | "integrations"; label: string; usd: number };

export type Estimate = {
  version: string;
  tokens: number;
  modelUsd: number;
  modelBudgetUsd: number;
  costUsd: number;
  lowUsd: number;
  highUsd: number;
  hours: number;
  lineItems: LineItem[];
  drivers: Driver[];
};

/** Compatible phase-1 API, backed by the same pricing engine as estimateSpec. */
export function estimate(
  input: EstimateInput,
  config: EstimatorConfig = ESTIMATOR_V1,
  billingMode: BillingMode = "managed",
): Estimate & ReturnType<typeof creditFields> {
  const integrations = [...new Set(input.integrations)];
  const quantities: [FeatureKey, number][] = [
    ["static_page", input.pages],
    ["crud_entity", input.entities],
    ["auth", input.auth ? 1 : 0],
    ...integrations.map((k): [FeatureKey, number] => [k, 1]),
  ];
  const pricing: Pricing = {
    ...DEFAULT_PRICING,
    version: config.version,
    margin: config.margin,
    deployUsd: config.deployUsd,
    rangeFraction: config.rangePct,
    usdPerMillionTokens: config.pricePerToken * 1e6,
    features: Object.fromEntries(
      Object.entries(DEFAULT_PRICING.features).map(([key, f]) => [
        key,
        {
          ...f,
          weight: config.weight,
          integrationUsd: config.integrationUsd[key as IntegrationKind] ?? 0,
        },
      ]),
    ) as Pricing["features"],
  };
  const totals = calculate(
    quantities.map(([key, quantity]) => ({
      kind: key === "crud_entity" ? "entity" : key,
      quantity,
    })),
    pricing,
    billingMode,
  );
  const lineItems = totals.lines.map((l) => {
    const key: FeatureKey = l.kind === "entity" ? "crud_entity" : l.kind;
    return {
      key,
      label: FEATURES_V1[key].label,
      quantity: l.quantity,
      tokens: l.tokens,
      hours: l.hours,
      usd: round(billingMode === "byok" ? 0 : config.margin * l.modelUsd),
    };
  });
  return {
    ...totals,
    ...creditFields(totals),
    version: config.version,
    modelUsd: round(totals.modelBudgetUsd),
    lineItems,
    drivers: [
      { key: "model", label: "Model tokens", usd: round(totals.modelChargeUsd) },
      { key: "deploy", label: "Deploy and hosting setup", usd: totals.deployChargeUsd },
      { key: "integrations", label: "Integrations", usd: totals.integrationUsd },
    ],
  };
}
function creditFields(t: ReturnType<typeof calculate>) {
  return {
    costCredits: t.costCredits,
    lowCredits: t.lowCredits,
    highCredits: t.highCredits,
    modelBudgetCredits: t.modelBudgetCredits,
    requiresApproval: t.requiresApproval,
    billingMode: t.billingMode,
  };
}
