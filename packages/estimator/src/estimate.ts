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

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/**
 * Cost = m * (sum_i w_i * t_i * p) + d + sum_j c_j.
 * Deterministic, so the same selection always yields the same quote on client and server.
 */
export function estimate(input: EstimateInput, config: EstimatorConfig = ESTIMATOR_V1): Estimate {
  const quantities: [FeatureKey, number][] = [
    ["static_page", input.pages],
    ["crud_entity", input.entities],
    ["auth", input.auth ? 1 : 0],
    ...[...new Set(input.integrations)].map((kind): [FeatureKey, number] => [kind, 1]),
  ];

  const lineItems = quantities
    .filter(([, quantity]) => quantity > 0)
    .map(([key, quantity]): LineItem => {
      const feature = FEATURES_V1[key];
      const tokens = feature.tokens * quantity;
      return {
        key,
        label: feature.label,
        quantity,
        tokens,
        hours: feature.hours * quantity,
        usd: round(config.margin * config.weight * tokens * config.pricePerToken, 2),
      };
    });

  const tokens = lineItems.reduce((sum, item) => sum + item.tokens, 0);
  const rawModelUsd = config.weight * tokens * config.pricePerToken;
  const integrationsUsd = input.integrations.reduce(
    (sum, kind) => sum + (config.integrationUsd[kind] ?? 0),
    0,
  );
  const costUsd = round(config.margin * rawModelUsd + config.deployUsd + integrationsUsd, 2);

  return {
    version: config.version,
    tokens,
    modelUsd: round(rawModelUsd, 2),
    modelBudgetUsd: round(rawModelUsd, 4),
    costUsd,
    lowUsd: round(costUsd * (1 - config.rangePct), 2),
    highUsd: round(costUsd * (1 + config.rangePct), 2),
    hours: round(
      lineItems.reduce((sum, item) => sum + item.hours, 0),
      2,
    ),
    lineItems,
    drivers: [
      { key: "model", label: "Model tokens", usd: round(config.margin * rawModelUsd, 2) },
      { key: "deploy", label: "Deploy and hosting setup", usd: round(config.deployUsd, 2) },
      { key: "integrations", label: "Integrations", usd: round(integrationsUsd, 2) },
    ],
  };
}
