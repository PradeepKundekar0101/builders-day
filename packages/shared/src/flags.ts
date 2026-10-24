import type { Spec } from "./spec";

export type FlagReason = "payment" | "third_party_personal_data" | "over_budget_threshold";

/** Estimates above this go to a Buildwise operator before the quote is sent. */
export const FLAG_COST_THRESHOLD_USD = 25;

const PERSONAL_DATA_WORDS = new Set([
  "email",
  "phone",
  "mobile",
  "address",
  "dob",
  "birth",
  "aadhaar",
  "pan",
  "passport",
]);

const holdsPersonalData = (spec: Spec) =>
  spec.entities.some((entity) =>
    entity.fields.some(
      (field) =>
        field.type === "email" ||
        field.name.split("_").some((word) => PERSONAL_DATA_WORDS.has(word)),
    ),
  );

/** Server-side rule for which specs need an operator's approval; never trusted to the agent. */
export function flagReasons(spec: Spec, defaultCostUsd: number): FlagReason[] {
  const reasons: FlagReason[] = [];
  if (spec.integrations.some((integration) => integration.kind === "payment_pinelabs")) {
    reasons.push("payment");
  }
  if (holdsPersonalData(spec)) reasons.push("third_party_personal_data");
  if (defaultCostUsd > FLAG_COST_THRESHOLD_USD) reasons.push("over_budget_threshold");
  return reasons;
}
