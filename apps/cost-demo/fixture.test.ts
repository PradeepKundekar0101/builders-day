import { it, expect } from "vitest";
import {
  estimateSpec as estimate,
  defaultSpecSelection as defaultSelection,
} from "@buildwise/estimator";
import { fixture, specRevision } from "./fixture";
it("demo fixture satisfies the shared specification", () => {
  expect(
    estimate({ spec: fixture, specRevision, selection: defaultSelection(fixture, specRevision) })
      .costUsd,
  ).toBe(4.78);
});
