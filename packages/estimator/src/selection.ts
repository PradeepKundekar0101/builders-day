import { estimateSpec } from "./spec-estimate";
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

/** Validate executable selections before a server persists a quote. */
export function validatedInputFromSelection(spec: Spec, selection: Selection): EstimateInput {
  const knownPages = new Set(spec.pages.map((p) => p.name));
  if (knownPages.size !== spec.pages.length)
    throw new Error("Page names must be unique for phase-1 selections");
  for (const name of selection.pages) if (!knownPages.has(name)) throw new Error("Unknown page");
  for (const name of selection.entities)
    if (!spec.entities.some((e) => e.name === name)) throw new Error("Unknown entity");
  for (const kind of selection.integrations)
    if (!spec.integrations.some((i) => i.kind === kind)) throw new Error("Unknown integration");
  if (
    new Set(selection.pages).size !== selection.pages.length ||
    new Set(selection.entities).size !== selection.entities.length ||
    new Set(selection.integrations).size !== selection.integrations.length
  )
    throw new Error("Duplicate selections");
  const ids = [
    ...spec.pages.flatMap((p, i) => (selection.pages.includes(p.name) ? [`page:${i}`] : [])),
    ...selection.entities.map((n) => `entity:${n}`),
    ...(selection.auth ? ["auth"] : []),
    ...selection.integrations.map((k) => `integration:${k}`),
  ];
  estimateSpec({
    spec,
    specRevision: "validation",
    selection: { specRevision: "validation", selectedIds: ids },
  });
  return inputFromSelection(spec, selection);
}
