import type { IntegrationKind, Spec } from "@buildwise/shared";
import type { EstimateInput } from "./estimate";

/** The features a user has switched on, by name. */
export type Selection = {
  pages: string[];
  entities: string[];
  auth: boolean;
  integrations: IntegrationKind[];
};

export function defaultSelection(spec: Spec): Selection {
  return {
    pages: spec.pages.filter((page) => page.mustHave).map((page) => page.name),
    entities: spec.entities.filter((entity) => entity.mustHave).map((entity) => entity.name),
    auth: spec.auth.enabled,
    integrations: spec.integrations.filter((i) => i.mustHave).map((i) => i.kind),
  };
}

/** Counts only selected items that exist in the spec, so a tampered selection cannot add features. */
export function inputFromSelection(spec: Spec, selection: Selection): EstimateInput {
  const pages = new Set(selection.pages);
  const entities = new Set(selection.entities);
  const integrations = new Set(selection.integrations);
  return {
    pages: spec.pages.filter((page) => pages.has(page.name)).length,
    entities: spec.entities.filter((entity) => entities.has(entity.name)).length,
    auth: spec.auth.enabled && selection.auth,
    integrations: spec.integrations.filter((i) => integrations.has(i.kind)).map((i) => i.kind),
  };
}
