import type { IntegrationKind } from "@buildwise/shared";

export type FeatureKey = "static_page" | "crud_entity" | "auth" | IntegrationKind;

export type Feature = {
  label: string;
  tokens: number;
  hours: number;
  unit: "per_page" | "per_entity" | "once";
};

/** Token and hour weights from the PRD's feature table. */
export const FEATURES_V1: Record<FeatureKey, Feature> = {
  static_page: { label: "Page", tokens: 15_000, hours: 0.25, unit: "per_page" },
  crud_entity: {
    label: "Data type with form and list",
    tokens: 60_000,
    hours: 0.75,
    unit: "per_entity",
  },
  auth: { label: "Sign-in with email and Google", tokens: 40_000, hours: 0.5, unit: "once" },
  file_upload: { label: "File upload", tokens: 35_000, hours: 0.5, unit: "once" },
  payment_pinelabs: { label: "Pine Labs checkout", tokens: 80_000, hours: 1, unit: "once" },
  email: { label: "Email notifications", tokens: 30_000, hours: 0.5, unit: "once" },
  ai_feature: { label: "AI feature", tokens: 50_000, hours: 0.75, unit: "once" },
  admin_dashboard: { label: "Admin dashboard", tokens: 70_000, hours: 1, unit: "once" },
};

export type EstimatorConfig = {
  version: string;
  /** Blended USD price per model token (approximate). */
  pricePerToken: number;
  margin: number;
  deployUsd: number;
  weight: number;
  /** Per-integration fixed costs, c_j in the PRD formula. */
  integrationUsd: Partial<Record<IntegrationKind, number>>;
  rangePct: number;
};

export const ESTIMATOR_V1: EstimatorConfig = {
  version: "v1",
  pricePerToken: 6 / 1_000_000,
  margin: 2,
  deployUsd: 1,
  weight: 1,
  integrationUsd: {},
  rangePct: 0.3,
};
